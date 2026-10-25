# EvidenceChase

[![CI](https://github.com/Stranger0071/EvidenceChase/actions/workflows/ci.yml/badge.svg)](https://github.com/Stranger0071/EvidenceChase/actions/workflows/ci.yml)

EvidenceChase is a web app for collecting audit evidence. A compliance manager lists everything the
auditor needs, each person who has to provide something gets a secure upload link (no account
needed), and the app sends the reminders and checks the files so the manager doesn't have to.

|                |                                                                 |
| -------------- | --------------------------------------------------------------- |
| **Live app**   | https://evidence-chase.vercel.app/                              |
| **Demo login** | `demo@evidencechase.app` / `evidence-demo-2026`                 |
| **Write-up**   | [WRITEUP.md](WRITEUP.md) (problem, decisions, cuts, what broke) |
| **Test plan**  | [docs/TEST_PLAN.md](docs/TEST_PLAN.md)                          |

> The API is on Render's free tier, which sleeps after 15 minutes without traffic. If the first page
> is slow, the server is just waking up. It's fast after that.

## The problem

Before a compliance audit (SOC 2, ISO 27001, HIPAA and so on), someone has to collect evidence from
across the company: MFA screenshots, access reviews, signed policies, training reports, backup test
records. Usually that's 30 to 150 items from 10 or more people.

From what I found, most teams do this with a spreadsheet, a pile of email threads and a shared drive.
The manager spends weeks chasing people, files end up in the wrong place or in the wrong format, and
it's hard to tell how close you are to being ready. Nobody can easily prove that a file wasn't changed
after it was handed in, either.

I wanted to replace all three with one tool that does the chasing and keeps the evidence trustworthy.

## Who it's for

- **Compliance managers** at companies of roughly 50 to 500 people who have an audit coming up on a
  fixed date. They create the audit, send the requests, review what comes back and export the final
  pack for the auditor.
- **Control owners**: the engineers, HR, IT and finance people who actually have the evidence. They
  only use the app once or twice per audit, so they shouldn't need an account. They just open the link
  from their email and upload.

## What it does

1. **Set up an audit**, either one request at a time or by importing a CSV. The import is
   all-or-nothing: if any row has a problem, nothing is imported and every problem is listed with its
   row number. Two ready-made samples are included:
   [ISO 27001](apps/web/public/sample-iso27001-requests.csv) and
   [HIPAA](apps/web/public/sample-hipaa-requests.csv).
2. **Send requests.** Each owner gets one email listing all of their requests, each with its own link.
   You can send to everyone, only overdue requests, only requests sent back for changes, or people you
   pick from a list. There's also a "Copy link" button in case email isn't an option.
3. **Owners upload without an account.** The link opens exactly one request. Files go straight to S3
   with a progress bar and are then checked (see below) before the manager can open them.
4. **Automatic reminders** go out 7, 3 and 1 days before the due date, on the day, and every 3 days
   once it's overdue. Each owner gets at most one reminder email a day, and reminders stop as soon as
   the evidence is in. "Nudge now" sends one straight away.
5. **Review**: preview a file, accept it, or send it back with a comment. The owner sees the comment
   in an email and on their page. Two reviewers can't overwrite each other's decisions, and every step
   is recorded in an activity log.
6. **Dashboard** showing how ready the audit is, progress per owner (so you know who to chase), the
   most overdue requests and any files still being checked. Every chart also has a table view.
7. **Export the evidence pack**: a ZIP with a folder per control and an `index.csv`. Each file's
   fingerprint is re-checked while the ZIP is built, so the auditor can see that nothing changed.

## How uploaded files are checked

I spent a lot of time on this part because the whole point is that the evidence can be trusted.

1. **Before uploading**, the API checks the file's name, type and size against an allow-list (PDF,
   PNG, JPG, CSV, TXT, XLSX and DOCX, up to 25 MB). It then gives the browser a 5-minute upload link
   that only works for that exact file name, type and size. S3 itself rejects anything else.
2. **The file goes to a `quarantine/` folder** in a private S3 bucket. It never passes through my API.
3. **When the owner submits**, the API reads the file back and:
   - works out the real type from the first bytes, so an `.exe` renamed to `.pdf` gets caught;
   - checks that CSV and TXT files are actually text;
   - calculates a SHA-256 fingerprint on the server (it never trusts one from the browser).

   If something is wrong, the file is deleted and the owner is told why.

4. **Malware scan (optional):** with AWS GuardDuty switched on, a file only moves on if the scan says
   "no threats found". Anything else, or no answer within 30 minutes, gets rejected.
5. **Before moving the file to `evidence/`**, the API checks the fingerprint again, so the file can't be
   swapped after it was checked. The copy is then locked with S3 Object Lock for 90 days, so it can't be
   changed or deleted.
6. **Managers view files through links that expire after 60 seconds**, served from S3's domain rather
   than the app's.

Owner links keep the token after a `#` in the URL. Browsers never send that part to a server, so it
can't end up in access logs. Only a hash of the token is stored in the database.

## How it's built

```
                          ┌──────────── Vercel ─────────────┐
 Manager ── browser ────▶ │ Next.js 15 (apps/web)           │
                          │ /api/* rewrite → Render         │  same origin, so the session
 Owner ──── /e#<token> ─▶ │ (first-party session cookie)    │  cookie is first-party
                          └───────────────┬─────────────────┘
                                          ▼
                          ┌──────────── Render ─────────────┐        ┌────────────────────────┐
 cron-job.org ──────────▶ │ Express 5 API (apps/api)        │ ─────▶ │ PostgreSQL (Prisma)    │
  · scan-check /5 min     │ routes → services → domain →    │        └────────────────────────┘
  · reminders daily       │ repositories / adapters         │ ─────▶ Resend (email)
                          └───────────────┬─────────────────┘
                                          │ presign, verify, copy, retain
 Browser ── presigned POST / GET ──────▶ ┌▼────────────────────────────────────┐
 (file bytes never pass through the API) │ AWS S3: quarantine/ → evidence/      │ ◀── GuardDuty (optional,
                                         │ private · versioned · Object Lock    │     paid; off in the demo)
                                         └──────────────────────────────────────┘
```

It's a pnpm monorepo with three parts:

- **`packages/shared`**: the Zod schemas, types and CSV parser. Both apps use them, so the frontend
  and backend can't disagree about what valid data looks like.
- **`apps/api`**: Express and Prisma. Routes only deal with HTTP, services have the business rules, and
  `src/domain` is pure functions (status changes, reminder schedule, scan decisions, file rules) with
  lots of unit tests. Every database query is limited to the signed-in manager's own audits, so nobody
  can open someone else's data by guessing an ID.
- **`apps/web`**: Next.js (App Router), TanStack Query, React Hook Form, and UI components built on
  Radix so they're accessible.

## Running it locally

You'll need Node 22.9 or newer, pnpm (`corepack enable`) and Docker. It takes about 5 minutes.

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
docker compose up -d        # Postgres on :5432 and an S3-compatible server (RustFS) on :9000
pnpm storage:setup          # creates the local bucket with Object Lock, CORS and a cleanup rule
pnpm db:migrate             # applies the database migrations
pnpm db:seed                # demo account plus a SOC 2 audit that's half done, with real files
pnpm dev                    # web on http://localhost:3000, API on http://localhost:4000
```

Then sign in with the demo login above. Locally there's no email service, so emails (including the
owners' upload links) are printed in the API's terminal. "Copy link" on a request works too. Malware
scanning needs AWS, so it's off locally and files move on right after their checks.

## Tests

```bash
pnpm lint && pnpm typecheck
pnpm test                 # 170 unit tests: domain rules, parsers, security helpers
pnpm test:integration     # 88 API tests against a real Postgres (docker compose up -d postgres)
pnpm test:e2e             # Playwright: the whole flow in Chromium, plus accessibility checks with axe-core
```

GitHub Actions runs all of these on every push, with the end-to-end tests running against production
builds, and also scans for leaked secrets with gitleaks. The [test plan](docs/TEST_PLAN.md) has more
detail on what each suite covers.

## Deploying

The AWS settings (bucket policy, CORS, lifecycle rule and the IAM policy) are saved as JSON in
[infra/aws/](infra/aws/README.md) so they can be checked and recreated.

- **Render (API and Postgres):** New → Blueprint → this repo. [`render.yaml`](render.yaml) creates both
  in Singapore, generates the secrets and asks for the rest (Vercel URL, AWS keys, Resend key).
- **Vercel (web):** import the repo with `apps/web` as the root directory and set `API_ORIGIN` (the
  Render URL) and `STORAGE_ORIGIN` (`https://<bucket>.s3.<region>.amazonaws.com`).
- **cron-job.org**, with the header `Authorization: Bearer <CRON_SECRET>` on both:
  - every 5 minutes: `POST https://<api>.onrender.com/internal/cron/scan-check` (this also keeps the
    API awake)
  - daily at 03:30 UTC (09:00 IST): `POST https://<api>.onrender.com/internal/cron/reminders`
- Finally, run `pnpm db:seed` once against the production database to create the demo account.

The API won't start in production if storage, the cron secret, export signing or email are missing,
so a half-configured deploy fails straight away instead of breaking later.

## Known limitations

- **Cold starts.** The free Render server sleeps after 15 idle minutes. The 5-minute cron call keeps
  it awake most of the time, but after an outage the first request can take up to a minute.
- **The free database expires** 30 days after it was created (around 22 Nov 2026 for this deployment).
- **No malware scanning on the live demo.** GuardDuty Malware Protection costs money, so it's switched
  off (`MALWARE_SCAN_ENABLED=false`). Files are still type-checked, fingerprinted, quarantined and
  locked. Turning it on is one setting plus enabling GuardDuty on the bucket, and the scan code is
  covered by tests.
- **Email needs a verified domain.** Until a domain is verified in Resend, it only delivers to the
  Resend account's own address, so emails to anyone else fail. "Copy link" still works in the meantime.
- **Long-lived AWS key.** Render runs outside AWS, so the API uses an IAM access key. It has the
  minimum permissions it needs (it can't list the bucket, delete evidence or remove the lock), but
  short-lived credentials would be better.
- **Upload links work like passwords.** Anyone with an owner's link can upload to that one request.
  The links are limited to one request, expire after 30 days, can be revoked and are rate-limited, and
  everything uploaded is still checked and reviewed. Sending a new link doesn't cancel older ones.
- **Rate limits are kept in memory**, which is fine for one server but wouldn't work with several.
  Someone calling the API directly instead of going through Vercel could also fake their IP address
  to get around them.
- If the reminder job misses a day, that day's reminders are skipped, not sent late.
- Some things I didn't get to: password reset, more than one manager per audit, and dark mode.
