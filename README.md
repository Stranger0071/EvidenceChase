# EvidenceChase

[![CI](https://github.com/Stranger0071/EvidenceChase/actions/workflows/ci.yml/badge.svg)](https://github.com/Stranger0071/EvidenceChase/actions/workflows/ci.yml)

**Give your control owners a link, not a login. EvidenceChase does the chasing.**

Before every compliance audit (SOC 2, ISO 27001, HIPAA), a compliance manager has to collect evidence,
such as screenshots, access reviews and signed policies, from dozens of people across the company.
Today that runs on a spreadsheet, email threads and a shared drive. EvidenceChase replaces all three:
define what you need once, every owner gets a secure upload link, reminders go out automatically, every
file is checked before anyone opens it, and the dashboard always shows how ready you are for the auditor.

|                 |                                                                                |
| --------------- | ------------------------------------------------------------------------------ |
| **Live app**    | _https://evidence-chase.vercel.app/_                                           |
| **Demo login**  | `demo@evidencechase.app` / `evidence-demo-2026`                                |
| **Demo video**  | _add the unlisted YouTube / Drive link_                                        |
| **Write-up**    | [WRITEUP.md](WRITEUP.md) (problem, decisions, cuts, what broke)                |
| **Design docs** | [PRD](docs/PRD.md) · [Phases](docs/phases.md) · [Test plan](docs/TEST_PLAN.md) |

> The API runs on Render's free tier and sleeps after 15 idle minutes. If the first page takes a while,
> it's waking up: the app says so, and it's quick after that.

## Who it's for

- **Compliance managers** at 50–500 person companies, preparing for an audit with a fixed date and
  30–150 evidence requests.
- **Control owners** (engineers, HR, IT, finance), who will never create another account just to send
  one file.

## What it does

1. **Set up an audit** by hand or by importing a CSV. The import is all-or-nothing: every problem is
   reported with its spreadsheet row number, and nothing is imported unless every row is valid.
2. **Send requests.** Each owner gets one email listing all of their requests, each with its own magic
   link. A "Copy link" button works without email.
3. **Owners upload with no account.** The link opens exactly one request. Files go straight to S3 with
   a progress bar, then are checked: real file type from the contents (a renamed `.exe` is caught), a
   server-computed SHA-256, and (with GuardDuty switched on) a malware scan, all before the manager can open them.
4. **Reminders chase for you:** 7, 3 and 1 days before, on the day, and every 3 days once overdue, as
   one daily digest per owner. They stop as soon as evidence is in. "Nudge now" sends one immediately.
5. **Review:** preview, accept, or send back with a comment the owner sees by email and on their page.
   Two reviewers can never overwrite each other, and every step is in an append-only activity log.
6. **Dashboard:** % ready, a status breakdown, progress per owner (who to chase first), the most overdue
   requests, and files still being scanned. Every chart has a table view.
7. **Export the evidence pack:** a ZIP with a folder per control and an `index.csv` in which each file's
   fingerprint is re-checked during the export (OK / MISMATCH / MISSING), with who accepted it and when.

## Architecture

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

- **`packages/shared`**: Zod schemas, types and the CSV parser, used by both apps so the API contract
  can't drift.
- **`apps/api`**: routes handle HTTP only; services hold the business rules; `src/domain` is pure
  functions (state machine, reminder schedule, scan decisions, file rules) with exhaustive unit tests;
  repositories are the only code that touches Prisma, and every query is scoped to the signed-in
  manager (IDOR protection).
- **`apps/web`**: Next.js App Router, TanStack Query, React Hook Form with the shared schemas, and
  accessible UI built on Radix.

Every technology choice, with its reasoning and the alternatives considered, is in
[PRD §9](docs/PRD.md).

## How files are stored and protected

Each file has two halves: the **bytes** in a private S3 bucket and the **facts** (original name, size,
real type, SHA-256, scan result, retention date) in Postgres, which is the source of truth.

| Step            | What happens                                                                                                                                                                                                                                                                                        |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Upload          | The API issues a 5-minute presigned POST that pins the exact key, type and size; S3 itself refuses anything else. The browser sends the file straight to `quarantine/{requestId}/{fileId}`.                                                                                                         |
| Check           | The API reads the object once, as a stream: it detects the real type from its first bytes, checks text files are UTF-8, and computes its own SHA-256. Anything wrong is deleted and the owner is told why.                                                                                          |
| Scan (optional) | With `MALWARE_SCAN_ENABLED=true`, GuardDuty scans `quarantine/` and only "no threats found" moves on; anything else, or no verdict within 30 minutes, is deleted and sent back to the owner. It's a paid AWS service, so the demo deployment runs with it off; the code and its tests are in place. |
| Keep            | Clean files are copied to `evidence/{audit}/{request}/{submission}/{file}` and get an **Object Lock** retention date. The API's IAM user can't list the bucket, delete evidence or bypass the lock.                                                                                                 |
| View            | Managers get 60-second links, forced to download (images and PDFs can preview). Files are served from S3's domain, never the app's.                                                                                                                                                                 |

Owner links carry the token in the URL fragment (`/e#…`), which browsers never send to a server, so it
can't appear in access logs; the page sends it to the API as a header. Only its SHA-256 is stored.

## Run it locally (about 5 minutes)

Requirements: Node 22.9+, pnpm (`corepack enable`), Docker.

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
docker compose up -d        # Postgres on :5432 and an S3-compatible server (RustFS) on :9000
pnpm storage:setup          # create the local bucket: Object Lock, CORS, lifecycle rule
pnpm db:migrate             # apply migrations (re-run after pulling new ones)
pnpm db:seed                # demo account and a SOC 2 audit mid-way through, with real files
pnpm dev                    # web on http://localhost:3000, API on http://localhost:4000
```

Sign in with the demo login above. Without a Resend key, emails (including owners' magic links) are
printed to the API log; "Copy link" on any request works too. Malware scanning needs AWS GuardDuty, so
it's off locally and files are promoted straight after their checks.

## Tests

```bash
pnpm lint && pnpm typecheck
pnpm test                 # 162 unit tests: domain rules, parsers, security helpers
pnpm test:integration     # 81 API tests against real Postgres (docker compose up -d postgres)
pnpm test:e2e             # Playwright: the full lifecycle in Chromium, plus WCAG checks with axe-core
```

CI runs all of them on every push, the end-to-end suite against production builds (so the production
Content-Security-Policy is exercised too), plus a gitleaks secrets scan. What each suite covers, the
checks done by hand, and the bugs they found are in [docs/TEST_PLAN.md](docs/TEST_PLAN.md).

## Deploying

The step-by-step account setup is in [docs/phases.md](docs/phases.md) (Prerequisites) and the AWS
settings, as reviewable JSON, are in [infra/aws/](infra/aws/README.md).

- **Render (API + Postgres):** New → Blueprint → this repo. [`render.yaml`](render.yaml) creates both
  in Singapore, generates the secrets, and asks for the rest (Vercel URL, AWS keys, Resend key).
- **Vercel (web):** import the repo with root directory `apps/web`, and set `API_ORIGIN` (the Render
  URL) and `STORAGE_ORIGIN` (`https://<bucket>.s3.ap-southeast-1.amazonaws.com`).
- **cron-job.org**, both with `Authorization: Bearer <CRON_SECRET>`:
  - every 5 minutes: `POST https://<api>.onrender.com/internal/cron/scan-check` (also keeps the API awake)
  - daily at 03:30 UTC (09:00 IST): `POST https://<api>.onrender.com/internal/cron/reminders`
- Then `pnpm db:seed` once against the production database for the demo account.

The API refuses to start in production if storage, the cron secret, export signing or email isn't
configured.

## Known limitations

- **Cold starts:** the free Render instance sleeps after 15 idle minutes; the 5-minute cron call keeps
  it awake, but the first request after an outage can take up to a minute.
- **Free Postgres expires** 30 days after creation (about 22 Nov 2026 for this deployment).
- **Long-lived AWS key:** Render runs outside AWS, so the API uses an IAM access key. It's least
  privilege (can't list, delete evidence or bypass Object Lock); short-lived credentials are the fix.
- **No malware scanning in the demo deployment.** GuardDuty Malware Protection is a paid AWS service,
  so it's switched off (`MALWARE_SCAN_ENABLED=false`). Files are still checked by their contents,
  fingerprinted, quarantined until checked, and locked. Turning it on is one setting plus enabling
  GuardDuty on the bucket; the scan path is covered by integration tests.
- Magic links are bearer tokens: anyone holding one can upload to that one request (scoped, expiring,
  revocable, rate-limited, content-checked and reviewed).
- A day the reminder job misses is skipped rather than sent late.
- No password reset, one manager per audit, no dark mode, rate limits kept in memory (fine for one
  instance).

## Attributions

UI primitives follow the [shadcn/ui](https://ui.shadcn.com) pattern on top of
[Radix UI](https://www.radix-ui.com); icons from [Lucide](https://lucide.dev); local S3 by
[RustFS](https://github.com/rustfs/rustfs). Built with the help of an AI coding assistant (Claude
Code); every part of the code is understood and can be explained by the author.
