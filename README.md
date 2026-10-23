# EvidenceChase

**Give your control owners a link, not a login. EvidenceChase does the chasing.**

Before every compliance audit (SOC 2, ISO 27001, HIPAA), a compliance manager has to collect evidence,
such as screenshots, access reviews and signed policies, from dozens of people across the company.
Today that runs on a spreadsheet, email threads and a shared drive. EvidenceChase replaces all three:
define what you need once, every owner gets a secure upload link, reminders go out automatically, and
the dashboard always shows how ready you are for the auditor.

- **Live app:** _added at deployment (Phase 0)_
- **Demo login:** `demo@evidencechase.app` / `evidence-demo-2026`
- **Docs:** [Product requirements](docs/PRD.md) · [Implementation phases](docs/phases.md)

## Status

| Phase | Scope                                                                        | State                                                                     |
| ----- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 0     | Monorepo, CI, health check, web ↔ API proxy                                  | ✅ Built and verified locally. Hosting setup (Vercel/Render) still to do. |
| 1     | Database schema, sign-up/sign-in with sessions, layered API                  | ✅ Done                                                                   |
| 2     | Audits and evidence requests, CSV import                                     | ✅ Done                                                                   |
| 3     | Owner magic links, secure S3 uploads, malware-scan check, Object Lock        | ✅ Done (GuardDuty and Resend need the AWS / Resend accounts to go live)  |
| 4     | Review loop (accept / request changes / re-open), file preview, activity log | ✅ Done                                                                   |
| 5–8   | Reminders, dashboard, export, hardening, submission                          | Not started                                                               |

## Who it's for

- **Compliance managers** at 50–500 person companies, preparing for an audit with a fixed date and
  30–150 evidence requests.
- **Control owners** (engineers, HR, IT, finance), who will never create another account just to
  send one file.

## What works today

- Manager sign-up and sign-in with server-side sessions (httpOnly cookie, stored in Postgres)
- Create, edit and archive audits. Archived audits are read-only.
- Add, edit and delete evidence requests. Control IDs are unique per audit. Requests with submitted
  evidence can't be deleted.
- **All-or-nothing CSV import:** the file is validated in the browser for a preview, then again on the
  server. Every problem is reported with its spreadsheet row number, and nothing is imported unless
  every row is valid.
- Readiness summary per audit: counts by status, overdue (computed, never stored) and % complete
- Searchable, sortable, filterable requests table
- **Send requests:** one email per owner listing all of their open requests, each with its own magic
  link, plus a "Copy link" fallback that works without email
- **Owner portal (no login):** a link opens exactly one request. Owners drag and drop files that upload
  straight to S3 with a progress bar, and see "changes needed" comments and scan results.
- **Secure upload pipeline** (PRD §8.4): S3 enforces each file's exact size and type at upload. The API
  then checks the real file type from its contents (a renamed `.exe` is caught), computes its own
  SHA-256, waits for the malware scan, and only then moves the file from `quarantine/` to
  `evidence/` with a write-once Object Lock retention date.
- **Review:** accept, request changes (with a comment the owner is emailed) or re-open; previews for
  images and PDFs; full evidence history; append-only activity timeline. Optimistic locking means two
  reviewers can never overwrite each other.

## Architecture

```
Browser ──▶ Vercel: Next.js 15 (apps/web)
              │  /api/* rewrite (same origin, so the session cookie is first-party)
              ▼
            Render: Express 5 API (apps/api) ──▶ PostgreSQL (Prisma)
                     routes → services → domain (pure) → repositories
```

- **`packages/shared`**: Zod schemas, types, constants and the CSV parser, used by both apps so the API
  contract can't drift.
- **`apps/api`**: a layered Express API. Routes only handle HTTP. Services hold the business rules.
  `src/domain` is pure functions (the request state machine, overdue rules, summaries) with full unit
  tests. Repositories are the only code that touches Prisma, and every audit query is scoped to the
  signed-in manager (IDOR protection).
- **`apps/web`**: Next.js App Router, TanStack Query for server state, React Hook Form with the shared
  Zod schemas, TanStack Table, and accessible UI primitives built on Radix.

Every technology choice, with its reasoning and the alternatives considered, is explained in
[docs/PRD.md §9](docs/PRD.md).

## Run it locally

Requirements: Node 22+, pnpm 10+ (`corepack enable`), Docker.

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
docker compose up -d                  # Postgres on :5432 and a local S3 server (RustFS) on :9000
pnpm storage:setup                    # create the local bucket: Object Lock, CORS, lifecycle rule
pnpm db:migrate                       # apply migrations
pnpm db:seed                          # demo account and a sample SOC 2 audit
pnpm dev                              # web on http://localhost:3000, API on http://localhost:4000
```

Sign in with the demo login above, or create an account. Without a Resend key, emails are printed
to the API log, so you can copy owners' magic links from there (or use "Copy link" on a request). A sample CSV for the import is linked from the
import dialog (`apps/web/public/sample-requests.csv`).

## Tests

```bash
pnpm test               # unit tests: domain rules and the CSV parser
pnpm test:integration   # API tests against real Postgres (needs `docker compose up -d postgres`)
pnpm lint && pnpm typecheck
```

The integration tests use a separate `evidencechase_test` database and refuse to run against any
database whose name doesn't end in `_test`. They cover: sign-up, login and logout, identical responses
for a wrong password and an unknown email, login rate limiting, CSRF origin checks, IDOR between two
managers, archived audits being read-only, duplicate control IDs, owner-change link revocation, and the
CSV import (valid file, invalid rows, clashes with existing requests).

## Deploying

The full checklist is in [docs/phases.md](docs/phases.md) (Prerequisites and Phase 0). The key settings:

**Render (API)**

- Root directory: `apps/api`. Region: Singapore. Health check: `/health`.
- Build: `corepack enable && pnpm install --frozen-lockfile --prod=false && pnpm build && pnpm db:deploy`.
  `--prod=false` matters: with `NODE_ENV=production` set, pnpm would otherwise skip the dev dependencies
  the build needs (TypeScript bundler, Prisma CLI).
- Start: `pnpm start`
- Env: `NODE_ENV=production`, `DATABASE_URL` (Render's **internal** URL), `SESSION_SECRET`,
  `WEB_ORIGIN` (your Vercel URL), `TRUST_PROXY=2` (check `req.ip` in the logs), `TZ=UTC`,
  `AWS_REGION`, `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` (the least-privilege IAM user in
  `infra/aws/api-policy.json`), `S3_BUCKET`, `MALWARE_SCAN_ENABLED=true`, `CRON_SECRET`, `RESEND_API_KEY`,
  `EMAIL_FROM`. The API refuses to start in production if storage, cron or email isn't configured.

**cron-job.org**

- Every 5 minutes: `POST https://<api>.onrender.com/internal/cron/scan-check` with
  `Authorization: Bearer <CRON_SECRET>`. It promotes scanned files, retries anything that failed half-way,
  and keeps the free Render instance awake.

**Vercel (web)**

- Root directory: `apps/web`
- Env: `API_ORIGIN` (your Render URL)

## Known limitations (current phase)

- Reminders, the dashboard charts and the evidence export are not built yet (Phases 5–6).
- Malware scanning relies on Amazon GuardDuty, which only exists on AWS. Locally (and in tests) it's
  switched off, and the tests simulate GuardDuty's tags.
- Magic links are bearer tokens: anyone holding a link can upload to that one request. That risk is
  limited by scoping, 30-day expiry, revocation, rate limits, scanning and manager review.
- No password reset for managers.
- One manager per audit. Teams and roles are on the roadmap.
- Login and sign-up rate limits are kept in memory, which is correct for the single API instance but
  would need Redis or Postgres with more than one instance.
- On Render's free tier, the API sleeps after 15 idle minutes and the first request can take up to a
  minute. The app shows a "waking up the server" message when this happens.

## Attributions

UI primitives follow the [shadcn/ui](https://ui.shadcn.com) pattern on top of
[Radix UI](https://www.radix-ui.com). Icons from [Lucide](https://lucide.dev). Built with the help of
an AI coding assistant (Claude Code). Every part of the code is understood and can be explained by the author.
