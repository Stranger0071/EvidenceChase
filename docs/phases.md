# EvidenceChase — Implementation Phases

> Companion to [`PRD.md`](./PRD.md). The PRD says **what** to build and **why**. This file says **in what order** and **when each part is finished**.
>
> **Stack:** Next.js on **Vercel** (web) · Express on **Render** (API) · **PostgreSQL** on Render · **AWS S3** + GuardDuty Malware Protection (files) · Resend (email) · cron-job.org (scheduler)
> **Window:** Thu 23 Oct (evening) → **Sun 26 Oct, 11:00 AM IST** (aiming to submit by 10:00 AM)
> **Rule of the build:** *deploy first, deploy often.* Both apps are live from Phase 0, and every phase ends with a working deploy.

---

## Overview

| Phase | Name | When | Outcome | Priority |
|---|---|---|---|---|
| — | Prerequisites | 23 Oct, evening | Accounts, email domain, database, AWS bucket, IAM user and GuardDuty ready | P0 |
| 0 | Setup and walking skeleton | 23 Oct, evening | Web on Vercel and API on Render, talking to each other through the rewrite, CI green | P0 |
| 1 | Foundation: data, auth, architecture | 24 Oct, early morning | Schema, sign-in with sessions and the layered API skeleton in place | P0 |
| 2 | Audits and evidence requests | 24 Oct, morning | Manager can create audits and add or import requests | P0 |
| 3 | Owner portal and secure uploads | 24 Oct, afternoon to evening | Owner uploads to S3, the API checks and records it, scan results promote or reject files | P0 / P1 |
| 4 | Review loop and activity log | 25 Oct, morning | Manager accepts or requests changes, full audit trail | P0 |
| 5 | Reminder engine | 25 Oct, midday | Daily automated, idempotent digest emails | P0 |
| 6 | Dashboard and export | 25 Oct, afternoon | Progress view and an audit-ready ZIP | P0 / P1 |
| 7 | Hardening and end-to-end testing | 25 Oct, evening | Error states, security checks, E2E green | P0 |
| 8 | Docs, demo and submission | 26 Oct, 06:00–10:00 | README, write-up, video, submitted | P0 |
| 9 | Post-submission roadmap | After 26 Oct | What I'd build next (for the interview) | — |

**Critical path:** prerequisites → 0 → 1 → 2 → 3 → 4 → 5 → 8. Phases 6 and 7, plus malware scanning and Object Lock in Phase 3, can shrink if I fall behind (see the cut line at the end).

```
23 Oct      24 Oct                         25 Oct                              26 Oct
evening     morning        afternoon/eve   morning     midday      afternoon/eve   morning
[pre+P0] [ P1 ][  P2  ] [      P3       ] [  P4  ] [  P5  ] [ P6 ][    P7    ] [  P8  ]→ submit 10:00
```

---

## Prerequisites (before Phase 0)

Finish these first, because they involve waiting on other people's systems (DNS, account checks) rather than writing code. Save every AWS JSON document below in `infra/aws/` so the setup can be reviewed and repeated.

### Accounts
- [ ] GitHub, Vercel, Render, AWS, Resend and cron-job.org accounts created
- [ ] Optional: UptimeRobot for uptime alerts

### Email
- [ ] **Domain added in Resend and DNS records created.** Start this first, because DNS can take hours.

### Database
- [ ] Render PostgreSQL created in **Singapore**
- [ ] Internal and external connection URLs saved
- [ ] Calendar reminder set for the database's 30-day expiry (about 22 Nov) and to take a `pg_dump` backup

### AWS account safety
- [ ] **MFA turned on** for the root user. Never create root access keys.
- [ ] A personal admin IAM user (or IAM Identity Center user) with MFA, used for all console work
- [ ] **AWS Budgets** alerts at $1 and $5, sent to your email
- [ ] Confirm GuardDuty Malware Protection for S3 is available on your account and plan, and note its per-GB price

### S3 buckets
Create `evidencechase-prod` (and optionally `evidencechase-dev`) in **ap-southeast-1 (Singapore)**. Local development uses MinIO instead.

- [ ] **Object Lock enabled at creation.** This also turns on versioning.
- [ ] Block Public Access: all four settings on
- [ ] Object Ownership: *Bucket owner enforced* (ACLs disabled)
- [ ] Default encryption: SSE-S3
- [ ] Bucket policy, HTTPS only (`infra/aws/bucket-policy.json`):
  ```json
  {
    "Version": "2012-10-17",
    "Statement": [{
      "Sid": "HttpsOnly",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": ["arn:aws:s3:::evidencechase-prod", "arn:aws:s3:::evidencechase-prod/*"],
      "Condition": { "Bool": { "aws:SecureTransport": "false" } }
    }]
  }
  ```
- [ ] CORS (`infra/aws/cors.json`):
  ```json
  [{
    "AllowedOrigins": ["https://evidencechase.vercel.app"],
    "AllowedMethods": ["POST", "GET"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }]
  ```
- [ ] Lifecycle rule (`infra/aws/lifecycle.json`), scoped to prefix `quarantine/`:
  - Expire current versions after 1 day
  - Permanently delete old (noncurrent) versions after 1 day
  - Remove expired delete markers

### IAM user for the API
- [ ] Create IAM user `evidencechase-api-prod` with **no console access**
- [ ] Attach the least-privilege policy from PRD §8.4 (`infra/aws/api-policy.json`). Check it has no delete on `evidence/*`, no `ListBucket` and no governance bypass.
- [ ] Create one access key and store it **only** in Render env vars and your password manager

### GuardDuty
- [ ] GuardDuty → **Malware Protection for S3** → enable for `evidencechase-prod`, prefix `quarantine/`, **object tagging on**. Let the wizard create the service role GuardDuty needs.
- [ ] Smoke test: upload the **EICAR test file** to `quarantine/` from the console, then check that within a minute the object gets the tag `GuardDutyMalwareScanStatus = THREATS_FOUND`. Delete the test object afterwards.

### Secrets
- [ ] Generated `SESSION_SECRET`, `CRON_SECRET` and `EXPORT_SIGNING_SECRET` (`openssl rand -base64 32`) and stored in a password manager. Never put them in the repo.

---

## Phase 0: Setup and walking skeleton

**Goal:** remove every "account / config / deploy / cross-origin" risk on day one, so that every later phase is just writing code.

### Tasks
- [ ] **Monorepo:** `pnpm-workspace.yaml` with `apps/web`, `apps/api` and `packages/shared`. A root `tsconfig.base.json`, plus ESLint and Prettier shared across all three.
- [ ] **apps/web:** `create-next-app` (TypeScript strict, App Router, Tailwind), `shadcn/ui init`, TanStack Query provider
- [ ] **apps/api:** Express 5 + TypeScript with `createApp()` in `app.ts` and `listen` in `server.ts`. Add helmet, pino-http (with a request ID), JSON body limit (`100kb`) and the `errorHandler`.
- [ ] Set up the API folders per PRD §11 (`routes`, `middleware`, `domain`, `services`, `repositories`, `adapters`, `jobs`, `emails`), plus `infra/aws/` with the JSON files from the prerequisites
- [ ] **packages/shared:** Zod set up, plus `constants.ts` (allowed file types, size limit of 25 MB, file limit of 10)
- [ ] `GET /health` on the API returns `{ ok: true, db: "up" }` (with a `SELECT 1`)
- [ ] `docker-compose.yml` with **Postgres and MinIO** (plus a one-off container that creates the local bucket). Add `.env.example` in both apps and make sure `.gitignore` covers `.env*`.
- [ ] GitHub Actions: pnpm install → lint → typecheck → test → build both apps, a Postgres service container, plus **gitleaks**
- [ ] **Deploy the API to Render:**
  - Root directory `apps/api`, Singapore region, health check `/health`
  - Build: `corepack enable && pnpm install --frozen-lockfile --prod=false && pnpm build && pnpm db:deploy`
  - Start: `node dist/server.js`
  - Env vars added, including the AWS ones. `DATABASE_URL` uses the **internal** URL. `TZ=UTC`.
- [ ] **Deploy the web app to Vercel:**
  - Root directory `apps/web`, `API_ORIGIN` set
  - `next.config.ts` rewrite from `/api/:path*` to `${API_ORIGIN}/:path*`
- [ ] Landing page calls `/api/health` through the rewrite and shows "API: up"
- [ ] Configure **`trust proxy`** and log `req.ip` and `x-forwarded-for` once, to confirm the real client IP is seen behind Vercel → Render
- [ ] cron-job.org: a temporary `GET /health` every 5 minutes as the keep-alive. Phase 3 replaces it with the scan-check call.

### Deliverables
- Public Vercel URL whose landing page reports the API is up
- CI badge green

### Done when
- Pushing to `main` auto-deploys **both** apps
- A browser request to `https://<app>.vercel.app/api/health` returns OK, which proves the rewrite works
- A fresh clone runs locally with `docker compose up -d && pnpm dev` (web + API) by following the README stub

### Example commits
`chore: set up pnpm monorepo with web, api and shared packages` · `chore(infra): document s3 bucket, cors, lifecycle and iam policies` · `feat(api): express app with health check and error handler` · `feat(web): proxy api requests through next rewrites` · `ci: lint, typecheck, test, build and gitleaks`

---

## Phase 1: Foundation (data, auth, architecture)

**Goal:** the bones every feature hangs on: the schema, sign-in, and the route → service → repository pattern with consistent errors.

### Tasks
- [ ] Write `prisma/schema.prisma` covering every model from PRD §7:
  - User (`passwordHash`)
  - Audit
  - EvidenceRequest (`version`, `dueDate` as `@db.Date`)
  - Submission
  - **EvidenceFile** (`state`, `scanStatus`, `storageKey`, `originalName`, `declaredMime`, `detectedMime`, `sizeBytes`, `sha256`, `retainUntil`, `rejectReason`)
  - AccessToken
  - ReminderLog (unique `(requestId, kind, sentOn)`)
  - ActivityLog (`actorType` includes `SYSTEM`)
- [ ] Create the first migration and commit it. Confirm it applies during the Render build.
- [ ] Prisma client singleton and repositories for User and Audit
- [ ] `DomainError` hierarchy (`Validation`, `NotFound`, `Conflict`, `Forbidden`, `Unauthorized`) and `errorHandler` mapping them to 422/404/409/403/401 with the `{ error: { code, message, details? } }` shape
- [ ] **Auth:**
  - `POST /auth/signup`, `/auth/login`, `/auth/logout` and `GET /auth/me`
  - bcrypt (cost 12)
  - `express-session` with `connect-pg-simple`. Cookie is `httpOnly`, `secure` in production, `sameSite=lax`, 7-day rolling.
  - Regenerate the session ID on login (prevents session fixation)
- [ ] Middleware:
  - `requireManager`
  - `originCheck`: state-changing methods must send `Origin` set to `WEB_ORIGIN`
  - Login rate limit (`express-rate-limit`: 5 per minute per IP)
- [ ] Define the ports `StoragePort` and `MailerPort`, plus a `ConsoleMailer` adapter for dev and tests
- [ ] Web:
  - Login and signup pages (React Hook Form + shared Zod schemas)
  - `lib/api-client.ts` with typed fetch and error parsing
  - `middleware.ts` redirects to `/login` when there's no session cookie
- [ ] Seed script with a **demo manager account** and a demo audit

### Tests
- Integration (Supertest + Postgres): signup → login → `me` → logout. Wrong password → 401. Sixth login in a minute → 429. POST with a foreign `Origin` → 403.

### Done when
- On production I can sign up, log in and see an empty "My audits" page **in both Chrome and Safari** (this proves the first-party cookie works through the rewrite)
- `/audits` without a session redirects to login

### Example commits
`feat(db): initial prisma schema and migration` · `feat(api): session auth with bcrypt and postgres store` · `feat(api): typed domain errors and error handler` · `feat(web): login and signup pages`

---

## Phase 2: Audits and evidence requests

**Goal:** the manager can describe *what evidence is needed, from whom, by when*.

### Tasks
- [ ] **Domain (pure functions plus unit tests first):** `transition(status, action, actor)` state machine (including the SYSTEM rejection) and `isOverdue(request, today)`
- [ ] Shared Zod schemas: `auditInput`, `requestInput`, `csvRow`
- [ ] AuditService and routes: create, edit, archive, list, get-with-summary, with the owner scope in **every** query (stops IDOR). No hard delete.
- [ ] RequestService and routes: create, edit, delete (only while there are no submissions). Changing `ownerEmail` revokes the old link (FR-5).
- [ ] CSV import:
  - Papa Parse in the browser shows a preview table
  - `POST /audits/:id/requests/import` re-validates **every** row on the server
  - Imports everything in one transaction or nothing, with a per-row error report (FR-4)
- [ ] Web:
  - Audit list
  - Audit detail with a requests table (TanStack Table: sort and filter by status, owner and due date)
  - Add/edit dialog
  - CSV import dialog with an error table
  - Downloadable sample CSV
- [ ] Optional (P2): SOC 2 starter template

### Tests
- Unit: full state-machine transition matrix, overdue boundary cases, CSV row validator (bad email, missing column, duplicate controlRef, BOM, empty file, more than 500 rows)
- Integration: manager B gets `404` on manager A's audit and requests. An invalid CSV imports zero rows.

### Done when
- On production, I can create an audit and import a 10-row CSV
- A bad CSV shows row-level errors without importing anything

### Example commits
`feat(domain): request status state machine` · `test(domain): transition matrix and overdue rules` · `feat(api): all-or-nothing csv import` · `feat(web): requests table with filters`

---

## Phase 3: Owner portal and secure uploads

**Goal:** the core value. An owner with no account opens a link, uploads evidence **safely**, and submits. This phase builds the file pipeline in PRD §8.4. Steps 3a and 3b are P0, and 3c (scanning and Object Lock) is P1.

### 3a. Magic links (P0)
- [ ] TokenService:
  - 32 random bytes encoded as base64url, with **only the SHA-256 hash stored**
  - 30-day expiry, scoped to one request, revocable
- [ ] `requireOwnerToken` middleware:
  - Reads the `X-Access-Token` header, hashes it and looks up the token
  - Checks expiry and revocation, then attaches the request to `req`
  - Rate limited (30 requests per minute per IP)
- [ ] "Send requests" action: issue the tokens and send **one email per owner** listing all their requests (React Email template rendered on the API, sent through Resend)
- [ ] "Copy link" button for each request, as a fallback if email is down during the demo
- [ ] Web `/e/[token]`:
  - Reads the token from the URL and sends it to the API in a header
  - Shows the control, instructions, due date and the last rejection comment
  - A friendly error page covers invalid, expired or revoked links
  - `Referrer-Policy: no-referrer`

### 3b. Upload, check and record (P0)
- [ ] **S3StorageAdapter** implementing `StoragePort` with the AWS SDK v3. It uses `S3_ENDPOINT` + path-style addressing when the endpoint is set, so the same code runs against MinIO.
  - `presignPost` (`@aws-sdk/s3-presigned-post`), `presignGet`
  - `head`, `getRange`, `getStream`
  - `getTags`, `copy`, `putRetention`, `delete`
- [ ] `POST /e/uploads`:
  - Validates the list of name, size and declared type against the shared allowlist (≤ 10 files, ≤ 25 MB each)
  - INSERTs `EvidenceFile(state=PENDING_UPLOAD)` with the key `quarantine/{requestId}/{fileId}`
  - Returns a **presigned POST** for each file (5-minute expiry). Its policy pins the exact `key`, `Content-Type` equal to the declared type, and `content-length-range` from 1 byte to 25 MB.
- [ ] Web `useUpload()` hook:
  - react-dropzone with client-side type and size checks
  - XHR `POST` of a `FormData` (policy fields first, file last) straight to S3, with a per-file **progress bar** and **retry**
  - Readable messages for S3's `EntityTooLarge` and policy errors
- [ ] `POST /e/submit {fileIds, note}`, in `UploadService.verifyAndSubmit()`:
  1. Every `fileId` must belong to **this token's request** and be `PENDING_UPLOAD`. Otherwise return `404`.
  2. `HEAD`: the object exists and its size matches the declared size
  3. `GET` bytes 0–4095, then **magic-byte check** with `file-type`. The real type must be in the allowlist and match the extension. CSV and TXT must be valid UTF-8 text.
  4. Stream the object to **compute SHA-256 on the server**
  5. If any check fails: delete the object, set `state=REJECTED` and return `422` with the reason
  6. **One transaction:**
     - Files set to `AWAITING_SCAN` (or straight to promotion if `MALWARE_SCAN_ENABLED=false`) with the hash and detected type
     - New Submission (the previous one gets `isCurrent=false`)
     - Status set to `SUBMITTED` (optimistic `version` check)
     - ActivityLog row (IP and user agent)
  7. Respond "Submitted", and check the scan result for up to about 10 seconds (3c)
  8. Email the manager
- [ ] Job `cleanupPendingFiles`: `PENDING_UPLOAD` rows older than 24 hours become `REJECTED` (the S3 lifecycle rule removes the bytes)

### 3c. Malware scanning, promotion and retention (P1)
- [ ] Domain: `decideScanOutcome(tag, ageMinutes)` returns *promote*, *reject* or *wait* (no tag after 30 minutes means reject as `FAILED`)
- [ ] `ScanService.check(fileId)`, safe to run any number of times:
  - Read the `GuardDutyMalwareScanStatus` tag (`GetObjectTagging`)
  - **Clean** → promote:
    - `CopyObject` to `evidence/{auditId}/{requestId}/{submissionId}/{fileId}`
    - Update the file to `VERIFIED` with the new key and `verifiedAt`
    - `PutObjectRetention` (GOVERNANCE, `OBJECT_LOCK_RETENTION_DAYS`), then save `retainUntil`
    - Delete the quarantine copy
  - **Threat / unsupported / failed** →
    - Delete the quarantine object and mark the file `REJECTED` with the reason
    - Move the request to `CHANGES_REQUESTED` as `SYSTEM`, with the comment "A file failed the malware scan"
    - Email the owner and the manager
  - **No tag yet** → do nothing, and the next check tries again
  - Each step checks the file's current state first. A file `VERIFIED` without `retainUntil` gets its retention retried.
- [ ] `POST /internal/cron/scan-check` (protected by `CRON_SECRET`):
  - Runs `check()` for every `AWAITING_SCAN` file, plus `cleanupPendingFiles`
  - Returns 202
- [ ] cron-job.org: replace the temporary `/health` ping with `POST /internal/cron/scan-check` **every 5 minutes**. It's now both the scan check and the keep-alive.
- [ ] Also run `check()` whenever the manager opens a request with files still `AWAITING_SCAN`
- [ ] Web: "Scanning…" badge on files. TanStack Query polls every 10 seconds while any file is still `AWAITING_SCAN`.

### Tests
- Unit:
  - Token generation, hashing, expiry and revocation
  - File rules (disallowed type, extension/MIME mismatch, magic-byte mismatch, invalid UTF-8 CSV, 0 bytes, too large, more than 10 files)
  - The presigned POST policy builder always includes the size range, key and content type
  - Every branch of `decideScanOutcome`
- Integration (fake StoragePort with controllable tags):
  - A `fileId` from another request gets `404`
  - A renamed `.exe` gets `422` and the object is deleted
  - A forced transaction error leaves no Submission and the files stay `PENDING_UPLOAD`
  - A clean tag → `VERIFIED` at the expected key, with `retainUntil` set
  - A threat tag → file `REJECTED`, request `CHANGES_REQUESTED`, owner emailed
  - Running the check twice, and once with a crash right after the copy → exactly one `VERIFIED` file
- Manual on production:
  - Upload a real 20 MB PDF
  - Try a 30 MB file and confirm S3 refuses it
  - Upload the **EICAR** file and confirm the request is sent back automatically

### Done when
- On production, an owner uploads a 20 MB PDF with a progress bar and the status becomes `SUBMITTED`
- Within a minute or so, the file shows as clean, sits under `evidence/…` in S3 with an Object Lock retention date, and its SHA-256 is stored in the database
- A renamed executable is rejected straight away with a clear message, and the EICAR file is caught by the scan and sent back to the owner

### Example commits
`feat(api): hashed, request-scoped magic-link tokens` · `feat(api): s3 storage adapter with size-limited presigned post` · `feat(api): verify uploads by magic bytes and server-side hash` · `feat(api): guardduty scan check with idempotent promotion` · `feat(api): object lock retention on verified evidence` · `feat(web): drag-and-drop uploader with progress and retry`

---

## Phase 4: Review loop and activity log

**Goal:** *wrong* evidence gets caught and fixed without email threads.

### Tasks
- [ ] Review queue on the audit page ("Needs review", oldest first)
- [ ] `GET /files/:id/url`:
  - Checks ownership (file → request → audit → manager) and that the file is `VERIFIED`
  - Returns a **presigned GET** (60-second expiry, `ResponseContentDisposition=attachment; filename="<originalName>"`, `ResponseContentType=<detectedMime>`)
  - Writes a "downloaded" ActivityLog entry
- [ ] Inline preview for images and PDF only, in a sandboxed `<iframe sandbox>`. Every other type downloads.
- [ ] `POST /requests/:id/review {action, comment, version}`:
  - Goes through `transition()`
  - Requesting changes needs a comment of at least 5 characters
  - **Accept returns `409` while any current file isn't `VERIFIED`**
  - Optimistic locking, returning `409` on conflict
- [ ] On changes requested: email the owner the comment and the same link, which restarts reminders
- [ ] "Re-open accepted request" action, which is logged
- [ ] Activity timeline per request (append-only. The repository exposes **no** update or delete.). It includes SYSTEM entries such as scan results.
- [ ] Web: optimistic UI with TanStack Query mutations, an Accept button that's disabled while scanning, and a conflict toast that refetches

### Tests
- Integration:
  - Two reviews at the same time: exactly one succeeds and the other gets `409`
  - Accepting a `PENDING` request is rejected
  - Accept with an `AWAITING_SCAN` file → `409`
  - Manager B can't get a download URL for manager A's file
  - No download URL for a file that isn't `VERIFIED`

### Done when
- The full loop works on production: submit → request changes → resubmit → accept, with every step visible in the timeline

### Example commits
`feat(api): review endpoint with optimistic locking` · `feat(api): presigned downloads for verified files only` · `feat(web): review panel and activity timeline`

---

## Phase 5: Reminder engine

**Goal:** the product does the chasing. Nobody has to click anything.

### Tasks
- [ ] Domain: `computeReminderKind(dueDate, today)` for T-7, T-3, T-1, T-0 and overdue every 3 days. Use **date-only UTC** comparison.
- [ ] ReminderService:
  - Scan open requests (audit `remindersOn`, not archived)
  - `INSERT … ON CONFLICT DO NOTHING RETURNING`
  - Group by owner and batch-send digests through Resend
  - Delete the log rows if a send fails, so the next run retries
- [ ] `POST /internal/cron/reminders`:
  - Protected by `Authorization: Bearer CRON_SECRET` (`timingSafeEqual`)
  - **Responds 202 immediately**, then runs in the background
  - Logs a summary `{scanned, sent, skipped, failed}`
- [ ] cron-job.org: daily `POST` at 09:00 IST with the auth header
- [ ] Per-audit reminders on/off toggle
- [ ] Digest email template
- [ ] Optional (P2): "Nudge now" button that respects the one-email-per-owner-per-day cap

### Tests
- Unit: every offset, days with nothing due, timezone around midnight IST, leap day, a request created already overdue
- Integration (real Postgres + fake mailer):
  - Running twice on the same day sends exactly one email per owner
  - One owner with 3 due requests gets 1 email
  - A mailer failure leads to a retry on the next run
  - A missing or wrong secret gets `401`

### Done when
- Triggering the job from the cron-job.org "test run" sends one digest on production, and triggering it again immediately sends nothing

### Example commits
`feat(domain): reminder schedule calculation` · `feat(api): idempotent daily reminder job` · `test(api): reminder idempotency against real postgres`

---

## Phase 6: Dashboard and export

**Goal:** answer "are we ready for the auditor?" at a glance, and hand over a clean evidence pack.

### Tasks
- [ ] `GET /audits/:id/summary`: one aggregated `GROUP BY status` query, with overdue computed in SQL
- [ ] Dashboard: completion %, status counts, overdue list, progress per owner (Recharts donut and bar), and a count of files still scanning
- [ ] Empty states, skeleton loaders, and a **"waking up the server…"** message if a request takes more than 3 seconds (Render cold start)
- [ ] (P1) Export:
  - `POST /audits/:id/export-link` returns an HMAC-signed URL **straight to Render** (60-second expiry, scoped to one audit)
  - `GET /exports/:auditId?exp&sig` streams the ZIP with `archiver`, pulling each `VERIFIED` file from `evidence/` in S3. The layout is `/<controlRef>-<slug>/<originalName>` plus `index.csv` (control, owner, status, submitted, accepted, reviewer, **sha256**, retained until).
  - Only accepted submissions are included by default
- [ ] Re-hash each file while streaming it and flag any mismatch in `index.csv`

### Done when
- The dashboard numbers match the requests table
- The exported ZIP opens and its hashes match the database

### Example commits
`feat(api): audit readiness summary` · `feat(web): dashboard with progress charts` · `feat(api): signed streaming zip export with hash index`

---

## Phase 7: Hardening and end-to-end testing

**Goal:** turn "it works on my demo" into "it works when an evaluator pokes at it".

### Tasks
- [ ] Security headers on the web app (`next.config`): CSP (allow the S3 bucket domain for previews), HSTS, `nosniff`, `Referrer-Policy: no-referrer`, `frame-ancestors 'none'`. Review helmet's defaults on the API.
- [ ] Walk through the PRD §8.4 and §9.4 security checklists and fix any gaps
- [ ] **AWS checks** (record the results in `docs/TEST_PLAN.md`):
  - Using the API's IAM key with the AWS CLI, `aws s3api delete-object` on an `evidence/` key → *Access Denied*
  - `aws s3 ls` on the bucket → *Access Denied*
  - A plain `http://` request to the bucket → denied by the bucket policy
  - A verified object shows its Object Lock retention date
- [ ] Run through every manual check and error state in PRD §12.4. Write `docs/TEST_PLAN.md` with the results.
- [ ] Playwright E2E for the main path: sign up → import CSV → owner uploads (MinIO, scanning off) → request changes → resubmit → accept → export. Run it in CI.
- [ ] Accessibility pass: keyboard-only upload, labels, contrast
- [ ] Graceful shutdown on `SIGTERM` (Render redeploys): stop accepting requests, let in-flight ones finish, close Prisma
- [ ] Load the production demo data (a realistic SOC 2 audit with a mix of statuses) and confirm the demo account works
- [ ] Add an UptimeRobot monitor for both URLs

### Done when
- CI runs green across unit, integration and E2E
- No console errors on the main flows in Chrome and Safari
- The AWS checks all behave as expected
- A tester who has never seen the app can complete the owner flow unassisted

### Example commits
`feat(web): strict security headers and csp` · `test(e2e): full evidence lifecycle` · `fix(api): graceful shutdown on sigterm` · `docs: manual test plan and aws permission checks`

---

## Phase 8: Docs, demo and submission

**Goal:** the evaluators can understand, run and judge the project without talking to me.

### Tasks
- [ ] README per PRD §15. It must include:
  - Pitch, **live URL**, **demo login** and video link
  - CI badge
  - Architecture diagram and **how files are stored and protected**
  - Local setup in under 10 minutes (Postgres + MinIO via Docker), plus the AWS setup guide in `infra/aws/`
  - Tests
  - **Known limitations** (cold start, scan delay, Postgres expiry date, long-lived AWS key)
  - Attributions (shadcn/ui, AI assistants used)
- [ ] `WRITEUP.md` (≤ 400 words, *count the words*). Section 4 ("what broke") must reflect what actually happened during the build, so keep notes from the prerequisites onwards.
- [ ] Record the 2–3 minute demo using the PRD §15 script, including the EICAR moment. Wake the API first. Upload the video (unlisted YouTube or Drive) and link it in the README.
- [ ] Final checks:
  - Open the live URL in an incognito window, after the API has been idle
  - Check the repo is public
  - Run gitleaks on the full history and confirm **no AWS keys** appear anywhere
  - Make sure the commit history is clean
- [ ] Confirm the 5-minute cron call is running, the AWS budget alert is on, and the Postgres expiry is after **5 Nov** (10 days after the deadline)
- [ ] **Submit by 10:00 AM IST**, with the URL, repo, write-up and video, to the contact given in the brief

### Done when
- The submission email is sent with all four items and 1 hour to spare

---

## Phase 9: Post-submission roadmap (talking points for the interview)

| Next step | Why it's next |
|---|---|
| Replace the long-lived AWS key with short-lived credentials (IAM Roles Anywhere, or move the API to AWS with an IAM role) | Removes the riskiest secret in the system |
| Push scan results through EventBridge instead of checking every 5 minutes | Faster results and no polling |
| COMPLIANCE-mode Object Lock with the retention period set per audit | True write-once evidence for real customers |
| CloudTrail S3 data events and customer-managed KMS keys | A full access trail and key control, which auditors expect |
| Terraform for everything in `infra/aws/` | Repeatable, reviewable infrastructure |
| Custom domain (`app.` and `api.` on one site) | Removes the rewrite hop while keeping cookies first-party |
| Paid Render instance + Redis-backed rate limiting | Removes cold starts and allows more than one API instance |
| Organizations, roles and invites (and Postgres Row-Level Security, per-tenant S3 prefixes) | Real teams have more than one compliance person |
| Queue-based jobs (Amazon SQS) for reminders and async ZIP export to S3 | Retries, backoff and no long requests |
| Slack/Teams reminders with deep links | Owners live in chat, not email |
| Recurring evidence (quarterly access reviews) | Continuous compliance, not one-off audits |
| Read-only, time-limited auditor portal | Replaces emailing ZIP files around |
| Optional email OTP before upload on sensitive requests | Turns the link from a pure bearer token into a second factor |
| SSO / Google login and password reset for managers | Expected in B2B |

---

## Cut line: what to drop if I fall behind

Drop these **in this order**, and never drop anything above the line:

1. P2 extras: SOC 2 template, "Nudge now", UptimeRobot
2. Dashboard charts (keep the numeric counts)
3. Object Lock retention (files are still versioned, and the API still can't delete evidence)
4. GuardDuty scanning: set `MALWARE_SCAN_ENABLED=false` so files are promoted right after the checks, and list scanning as a known limitation
5. Export ZIP → simplify to `index.csv` plus per-file presigned download links
6. Playwright E2E → replace it with the documented manual test plan (keep unit and integration tests)

**── never cut ──** owner magic link · size-limited presigned POST · quarantine → check → promote · review loop · idempotent reminders · 5-minute keep-alive · both apps deployed · README · write-up · demo video
