# EvidenceChase — Product Requirements Document

| | |
|---|---|
| **Product** | EvidenceChase — audit evidence collection without the spreadsheet-and-email chaos |
| **Context** | VComply Software Development Role — Build & Deploy Assignment |
| **Author** | Aadi |
| **Version** | 1.2 (MVP: Vercel + Render + PostgreSQL + AWS S3) |
| **Date** | 23 Oct 2026 |
| **Status** | Approved for build |

---

## 1. What the assignment asks for

The VComply brief is open-ended: *"Build and deploy a web-based tool that solves a real, specific problem for a defined user."*

**Non-negotiables**

| Requirement | How EvidenceChase meets it |
|---|---|
| Public URL, live for at least 10 days after the deadline | Frontend on Vercel (doesn't sleep). API on Render, kept awake by a scheduled call every 5 minutes. Render Postgres free tier lasts 30 days from creation (about 22 Nov), which is past the 5 Nov requirement. Files on AWS S3, covered by AWS free-tier credits. |
| Public GitHub repo | pnpm monorepo (`apps/web`, `apps/api`, `packages/shared`) with a clean, incremental commit history (see §14) |
| README.md: problem, user, setup, limitations | README template planned in §15 |
| No secrets in the repo | `.env.example` in each app only. Secrets live in Vercel and Render env vars. `gitleaks` runs in CI. |
| Product write-up of 400 words or fewer | Drafted from §2, §4, §12 and §13 |
| 2–3 minute demo video | Script in §15 |

**How submissions are scored, and where this PRD covers each one**

| Dimension | Where it's addressed |
|---|---|
| Product Sense | §2 Problem, §3 Users, §4 Scope decisions |
| Code Quality | §8 Architecture (layered), §9 Tech stack, §14 Conventions |
| Functionality | §5 User flows, §6 Functional requirements |
| Testing | §12 Testing strategy |
| Deployment & Docs | §11 Deployment, §15 Submission plan |

---

## 2. Problem statement

### The problem
Before every compliance audit (SOC 2, ISO 27001, HIPAA, internal audit), a **compliance manager** has to collect **evidence** from dozens of **control owners** spread across Engineering, HR, IT and Finance. Evidence means things like screenshots of MFA settings, access review exports, signed policies and training completion reports.

Today this usually runs on a **spreadsheet plus email threads plus a shared drive**:

- The manager keeps a spreadsheet: control ID, what's needed, who owns it, due date, status.
- Owners get an email, forget it, and get chased again by hand. Reminders are copy-pasted one person at a time.
- Files come back as email attachments, Slack DMs or "it's in the drive somewhere", with no link to the control they belong to.
- Rejecting a bad submission ("this screenshot is from last year") means yet another email thread.
- The status in the spreadsheet is always stale, so the manager can't answer "are we ready for the auditor?" without auditing their own tracker first.

### Why it matters
- Audit prep typically takes **weeks of a compliance person's time**, and much of that is chasing rather than reviewing.
- Late or missing evidence becomes an **audit finding**, which costs money, delays certification and can block sales deals that depend on a SOC 2 report.
- This is the exact pain VComply's customers (regulated mid-market companies) live with. That makes the problem easy to validate and relevant to the evaluators.

### Why existing alternatives fall short

| Alternative | Gap |
|---|---|
| Spreadsheet + email | No automation, no single source of truth, files are disconnected from requests |
| Enterprise GRC suites (VComply, Vanta, Drata, AuditBoard) | Powerful but heavy. They need procurement and onboarding, and **every control owner needs a seat and a login**, which is the biggest adoption blocker for one-off contributors. |
| Generic task tools (Jira, Asana, Monday) | Not built around evidence. No review/reject loop, no audit-ready export, and owners still need accounts. |
| Google Forms / file request links | Collect files, but no per-control tracking, reminders, review loop or status dashboard |

### The improvement
**EvidenceChase turns "chasing people" into a system.** The manager defines what's needed once. Each owner gets a **secure, login-free link** to upload against their exact request. Reminders go out **automatically** on a schedule. Every file is **checked and scanned for malware**. The manager **accepts or rejects** with a comment, accepted evidence is **locked against deletion**, and the **dashboard and export** are always audit-ready.

> **One-line pitch:** Give your control owners a link, not a login. EvidenceChase does the chasing.

---

## 3. Target users and personas

### Primary user: the compliance manager ("Priya")
- Compliance or GRC lead at a 50–500 person company, often a team of one or two.
- Preparing for a SOC 2 Type II or ISO 27001 audit with a fixed auditor date.
- Manages 30–150 evidence requests across 10–40 owners.
- **Goal:** get every piece of evidence in, correct and on time, without spending her days writing follow-up emails.
- **Frustration:** "I spend more time chasing people than actually reviewing evidence."

### Secondary user: the control owner ("Rahul, DevOps engineer")
- Owns 2–8 requests. Compliance isn't his job, and he will not create another account.
- **Goal:** know exactly what's needed, upload it in under a minute, and be left alone.
- **Frustration:** vague asks ("send me the access review thing") and repeated nagging after he already sent it.

### Out of scope (for now): the external auditor
Auditors receive the exported evidence pack. They don't use the app directly in the MVP.

---

## 4. Product decisions and scope

### 4.1 The three most important product decisions (for the write-up)

1. **Control owners never create an account.** Each request gets a unique, expiring, single-purpose **magic link**.
   *Why:* adoption by owners is the bottleneck. Every login screen is a reason not to respond.
   *Trade-off:* the link works like a bearer token, so I mitigate the risk with hashed storage, expiry, scope limited to one request, rate limiting and revocation (§9.4).

2. **Reminders are automatic and escalating, and the manager does nothing to trigger them.** They go out at T-7, T-3 and T-1 days, on the due date, and every 3 days once overdue, and stop the moment evidence is submitted.
   *Why:* chasing is the core pain. If the manager has to click "send reminder", the product hasn't solved it.
   *Trade-off:* emails could feel spammy, so there's a cap of one email per owner per day (digest) and a per-audit on/off switch.

3. **Review is a first-class state machine, not a checkbox.** `PENDING → SUBMITTED → ACCEPTED | CHANGES_REQUESTED → SUBMITTED …`. Every transition is logged.
   *Why:* audits fail on *wrong* evidence as often as on *missing* evidence. The reject-with-comment loop replaces a whole email thread, and the immutable activity log is itself useful audit evidence.
   *Trade-off:* a bit more modelling and test work, but it gives the clearest, most testable part of the codebase.

### 4.2 MVP scope (built by 26 Oct)

| # | Feature | Priority |
|---|---|---|
| F1 | Manager sign-up/sign-in (email + password, server-side sessions). A seeded **demo account** for evaluators. | P0 |
| F2 | Create, edit and archive an **Audit** (name, framework, auditor date) | P0 |
| F3 | Add **Evidence Requests** one at a time (control ID, title, instructions, owner name/email, due date) | P0 |
| F4 | **CSV bulk import** of requests, with row-level validation errors | P0 |
| F5 | **Owner magic link**: request details, file upload (drag and drop, multi-file), note, submit | P0 |
| F6 | **Review**: preview/download files, Accept or Request changes with a comment | P0 |
| F7 | **Automated reminder emails** (scheduled, idempotent, stop on submit) | P0 |
| F8 | **Dashboard**: completion %, counts by status, overdue list, progress per owner | P0 |
| F9 | **Activity log** per request and per audit (append-only) | P1 |
| F10 | **Export evidence pack** (ZIP: folders per control plus `index.csv` with SHA-256 hashes) | P1 |
| F11 | **Malware scanning** of every upload (Amazon GuardDuty Malware Protection for S3) | P1 |
| F12 | **Write-once retention** of verified evidence (S3 Object Lock) | P1 |
| F13 | SOC 2 starter template (pre-filled ~15 common requests) | P2 |
| F14 | Manual "Nudge now" button (respects the daily cap) | P2 |

### 4.3 Explicitly cut from scope (and why)

| Cut | Reason | Next step if there were more time |
|---|---|---|
| Google / SSO login for managers | Email + password needs no third-party console setup, and evaluators can use a demo account straight away | OAuth via Passport or an identity provider |
| Multi-user organizations, roles, invites | Adds RBAC complexity. A single manager per audit proves the core loop. | `Organization` + `Membership(role)` tables. The schema is already keyed so this can be added. |
| Slack / Teams reminders | Email alone proves the loop. More integrations mean more OAuth apps to set up. | Slack bot DM with an upload deep-link |
| Recurring evidence (quarterly access reviews) | Needs a recurrence engine | RRULE-based request templates |
| Mapping evidence to multiple frameworks/controls | That's the "GRC suite" problem, so it's out of the wedge | Many-to-many `control_mapping` |
| Auditor portal | Export covers the hand-off | Read-only, time-boxed auditor link |
| CloudTrail logging of every S3 file access | The app's own `ActivityLog` covers the MVP | Turn on CloudTrail S3 data events for the evidence bucket |
| Customer-managed encryption keys (KMS) | Default S3 encryption (SSE-S3) is enough for the MVP, and KMS keys cost money each month | SSE-KMS with a customer-managed key per environment |
| In-browser preview for all file types | Only images and PDF are previewed. Everything else downloads. | Office viewer integration |

---

## 5. Core user flows

### Flow A: Manager sets up an audit
1. Sign in → **New Audit** → name "SOC 2 Type II — FY26", framework SOC 2, auditor fieldwork date.
2. Add requests by hand, **import a CSV**, or start from the SOC 2 template.
3. Click **Send requests**. Each owner receives *one* email listing their requests, each with its own magic link.

### Flow B: Owner submits evidence (no login)
1. The owner opens the link in the email and lands on the request page: control ID, instructions, due date and any previous rejection comment.
2. They drag and drop the files, which upload **straight to S3** with a progress bar, add an optional note, and click **Submit**.
3. The API checks every file and records the submission. The owner sees a confirmation, and reminders for that request stop.
4. In the background, every file is **scanned for malware** (§8.4). If a file fails, the request goes back to the owner automatically with the reason.

### Flow C: Manager reviews
1. The dashboard shows a "Needs review" queue, sorted by oldest submission.
2. The manager opens a request and previews the files. Files still being scanned show "Scanning…", and **Accept** stays disabled until every file is clean.
3. The manager clicks **Accept** or **Request changes** with a comment such as "Screenshot must show the date. Please re-capture."
4. On *changes requested*, the owner is emailed with the comment and the same link. The status goes back to awaiting submission.

### Flow D: Automated chasing (system)
1. An external scheduler (cron-job.org) calls the API's reminder endpoint daily at 03:30 UTC (09:00 IST).
2. For every open request, the API works out whether a reminder is due (T-7, T-3, T-1, T-0, overdue every 3 days).
3. It groups due reminders **per owner** into a single digest email, sends it, and records each reminder so it is never sent twice.

### Flow E: Audit-ready export
1. The manager clicks **Export** → gets a ZIP: `/<controlRef>-<slug>/<files>` plus `index.csv` (control, owner, status, submitted at, accepted at, reviewer, SHA-256).

---

## 6. Functional requirements

### 6.1 Audits
- FR-1: A manager can create, edit and archive audits they own. Archived audits are read-only. Audits can't be hard-deleted in the MVP, because evidence is retained.
- FR-2: Each audit shows a computed summary: total, pending, submitted, accepted, changes requested, overdue, and % complete (accepted ÷ total).

### 6.2 Evidence requests
- FR-3: Required fields: `controlRef`, `title`, `ownerEmail`, `dueDate`. Optional: `instructions`, `ownerName`.
- FR-4: CSV import validates *every* row (Zod) and either imports all rows or none, returning a per-row error report (`row 7: invalid email`). It never partially imports.
- FR-5: Editing the owner email **revokes** the old link and issues a new one.
- FR-6: **Overdue is derived, not stored**: `status ∈ {PENDING, CHANGES_REQUESTED} AND dueDate < today`. This avoids a cron job having to flip statuses and avoids stale data.

### 6.3 Owner portal and files
- FR-7: The link resolves to exactly one request. An invalid, expired or revoked token shows a friendly error with "contact your compliance manager".
- FR-8: Allowed file types: PDF, PNG, JPG, CSV, XLSX, DOCX, TXT. Max 25 MB per file (enforced **by S3 itself** through the upload policy), 10 files per submission. The type is checked by extension, declared MIME type **and the file's real content (magic bytes)**.
- FR-9: Owners can submit while the request is `PENDING` or `CHANGES_REQUESTED`. If it is already `SUBMITTED`, the page shows "awaiting review" (resubmission is allowed and replaces the pending submission). If it is `ACCEPTED`, the page is read-only.
- FR-10: Every file is scanned for malware. Only files scanned clean can be downloaded, previewed or exported. If a file has a threat, can't be scanned or fails to scan, it is removed, and the request moves to `CHANGES_REQUESTED` with a system comment and an email to the owner.

### 6.4 Review
- FR-11: Only `SUBMITTED` requests can be accepted or sent back. Accept also requires **every file in the current submission to be `VERIFIED`** (scanned clean). Requesting changes requires a comment of at least 5 characters.
- FR-12: Each review creates an immutable `ActivityLog` entry (actor, action, from→to status, timestamp, comment).

### 6.5 Reminders
- FR-13: Schedule offsets relative to `dueDate`: −7, −3, −1, 0, then +3, +6, +9 … while open.
- FR-14: At most **one email per owner per day** (digest across all their open requests).
- FR-15: Reminders are **idempotent**: re-running the job on the same day sends nothing new (enforced by a DB unique constraint, §7).
- FR-16: Reminders stop when the status is `SUBMITTED` or `ACCEPTED`, or when the audit is archived or has reminders turned off.

### 6.6 Files and export
- FR-17: Uploaded files are **never overwritten or edited**. A resubmission creates a new submission, and earlier files stay in the history. Verified files get an **S3 Object Lock retention date**, so they can't be deleted or replaced before that date.
- FR-18: The ZIP is streamed to the browser rather than built in memory. Only `ACCEPTED` submissions are included by default, with an option to include all.

---

## 7. Data model

```
┌──────────────────┐ 1    * ┌──────────────┐ 1      * ┌────────────────────┐
│    User          │────────│    Audit     │──────────│  EvidenceRequest   │
│ id               │        │ id           │          │ id                 │
│ email (uniq)     │        │ ownerId (FK) │          │ auditId (FK)       │
│ name             │        │ name         │          │ controlRef         │
│ passwordHash     │        │ framework    │          │ title              │
│ createdAt        │        │ auditDate    │          │ instructions       │
└──────────────────┘        │ remindersOn  │          │ ownerName          │
 (sessions live in the      │ archivedAt   │          │ ownerEmail         │
  `session` table managed   │ createdAt    │          │ dueDate (DATE)     │
  by connect-pg-simple)     └──────────────┘          │ status (enum)      │
                                                      │ version (int)      │  ← optimistic locking
                                                      │ createdAt/updatedAt│
                                                      └─────────┬──────────┘
                 ┌─────────────────────┬────────────────────────┼───────────────────┬─────────────────┐
                 │ *                   │ *                      │ *                 │ *               │ *
       ┌─────────┴────────┐  ┌─────────┴────────┐   ┌───────────┴──────┐ ┌──────────┴─────┐ ┌─────────┴────────┐
       │  Submission      │  │  AccessToken     │   │  ReminderLog     │ │  ActivityLog   │ │  EvidenceFile    │
       │ id               │  │ id               │   │ id               │ │ id             │ │ id (uuid)        │
       │ requestId (FK)   │  │ requestId (FK)   │   │ requestId (FK)   │ │ requestId (FK) │ │ requestId (FK)   │
       │ note             │  │ tokenHash (uniq) │   │ kind (T-7..)     │ │ actorType      │ │ submissionId(FK?)│ ← null until submit
       │ submittedAt      │  │ expiresAt        │   │ sentOn (date)    │ │ actorId/email  │ │ state (enum)     │
       │ isCurrent (bool) │  │ revokedAt        │   │ UNIQUE(request,  │ │ action         │ │ storageKey       │
       └──────────────────┘  │ lastUsedAt       │   │  kind, sentOn)   │ │ fromStatus     │ │ originalName     │
                             └──────────────────┘   └──────────────────┘ │ toStatus       │ │ declaredMime     │
                                                                         │ comment        │ │ detectedMime     │
                                                                         │ ip, userAgent  │ │ sizeBytes        │
                                                                         │ createdAt      │ │ sha256           │ ← computed by the server
                                                                         └────────────────┘ │ scanStatus       │ ← GuardDuty result
                                                                          (append-only: no  │ retainUntil      │ ← Object Lock date
                                                                           UPDATE/DELETE in │ rejectReason     │
                                                                           the repository)  │ createdAt        │
                                                                                            │ verifiedAt       │
                                                                                            └──────────────────┘
```

**Enums**
- `RequestStatus`: `PENDING | SUBMITTED | CHANGES_REQUESTED | ACCEPTED`
- `FileState`: `PENDING_UPLOAD | AWAITING_SCAN | VERIFIED | REJECTED` (see §8.4)
- `ScanStatus`: `NOT_SCANNED | NO_THREATS_FOUND | THREATS_FOUND | UNSUPPORTED | FAILED`. These mirror the values GuardDuty writes to the object's `GuardDutyMalwareScanStatus` tag.
- `ActorType`: `MANAGER | OWNER | SYSTEM`

**Key indexes**
- `EvidenceRequest(auditId, status)` for dashboard counts
- `EvidenceRequest(status, dueDate)` for the reminder scan
- `AccessToken(tokenHash)` unique, for O(1) link lookup
- `ReminderLog(requestId, kind, sentOn)` unique, which gives idempotency for free
- `EvidenceFile(state, createdAt)` for the scan-check job and orphan cleanup

**Why relational:** the data is inherently relational (audit → requests → submissions → files). I need **transactions** (submit = attach files + create submission + status change + log in one atomic step), **constraints** (unique reminder log) and **aggregations** (dashboard `GROUP BY status`). A document DB would push all of that into application code.

**Why file bytes are *not* in Postgres:** the database holds only the **metadata** of each file (name, size, type, hash, scan result, where it's stored). The bytes live in S3. Storing 25 MB blobs in Postgres would bloat backups, fill the 1 GB free database quickly, and push large reads through the API. See §8.4.

### Request status state machine

```
                 owner submits
   ┌─────────┐ ───────────────▶ ┌───────────┐  manager accepts  ┌──────────┐
   │ PENDING │                  │ SUBMITTED │ ────────────────▶ │ ACCEPTED │ (terminal*)
   └─────────┘                  └───────────┘  (all files       └──────────┘
                                  ▲   │         VERIFIED)
                 owner resubmits  │   │ manager requests changes (comment required)
                                  │   │ OR system: a file failed the malware scan
                                  │   ▼
                             ┌───────────────────┐
                             │ CHANGES_REQUESTED │
                             └───────────────────┘
   * the manager can "re-open" ACCEPTED → CHANGES_REQUESTED (logged), e.g. if the auditor rejects it later
   OVERDUE is a derived view: (PENDING | CHANGES_REQUESTED) AND dueDate < today
```

The state machine lives in one **pure function**, `transition(current, action, actor) → next | Error`, in `apps/api/src/domain/requestStatus.ts`. It has no I/O, so it can be fully unit-tested (§12).

---

## 8. System architecture

### 8.1 High-level diagram

```
                      ┌──────────────────────────── VERCEL ────────────────────────────┐
 Compliance Manager   │  apps/web : Next.js 15 (React 19, TypeScript)                  │
 (browser) ──HTTPS───▶│  · pages, forms, dashboard (TanStack Query for data)           │
                      │  · rewrite:  /api/:path*  ──▶  https://<api>.onrender.com/:path*│
 Control Owner        │    (browser sees ONE origin → first-party session cookie)      │
 (magic link) ─HTTPS─▶│                                                                │
                      └───────────────────────────────┬────────────────────────────────┘
                                                      │ proxied JSON API calls
                      ┌──────────────────────────── RENDER (Singapore) ▼───────────────┐
                      │  apps/api : Node 22 + Express 5 (TypeScript), long-running     │
                      │                                                                │
                      │  middleware: helmet · origin check · session · rate limit ·    │
                      │              zod validation · error handler · pino logging     │
                      │  routes ──▶ services ──▶ domain (pure)                         │
                      │                 │                                              │
                      │                 ├──▶ repositories (Prisma) ───────┐            │
                      │                 ├──▶ StorageAdapter (AWS SDK) ─┐  │            │
                      │                 └──▶ MailerAdapter (Resend) ─┐ │  │            │
                      │  jobs: reminders · scan check + promote ·    │ │  │            │
                      │        orphan cleanup                        │ │  │            │
                      └──────────────────────────────────────────────┼─┼──┼────────────┘
                                ▲                                    │ │  │ internal URL
       cron-job.org ────────────┘                                    │ │  ▼
       · POST /internal/cron/scan-check  every 5 min                 │ │ ┌────────────────────┐
         (also keeps the free instance awake)                        │ │ │ Render PostgreSQL  │
       · POST /internal/cron/reminders   daily 09:00 IST             │ │ │ (same region)      │
                                                                     │ │ └────────────────────┘
                                          ┌──────────────┐           │ │
                                          │ Resend       │◀──────────┘ │ S3 API (IAM user, least privilege):
                                          │ (email API)  │             │ presign POST/GET · HEAD · ranged GET ·
                                          └──────────────┘             │ GetObjectTagging · Copy · PutObjectRetention
                                                                       ▼
 Browser ── POST file via presigned POST (5 min, ≤ 25 MB) ──▶ ┌──────────────────────────────┐
 Browser ◀─ GET file via presigned URL (60 s) ─────────────── │ AWS S3 · ap-southeast-1      │
                                                              │ private · versioned ·        │
                                                              │ Object Lock · SSE-S3         │
                                                              │ quarantine/      evidence/   │
                                                              └──────────────┬───────────────┘
                                                                             │ every new object in quarantine/
                                                              ┌──────────────▼───────────────┐
                                                              │ Amazon GuardDuty             │
                                                              │ Malware Protection for S3    │
                                                              │ → tags the object with the   │
                                                              │   scan result                │
                                                              └──────────────────────────────┘
```

**Three paths of traffic, kept deliberately separate**

| Traffic | Path | Why |
|---|---|---|
| JSON API calls (small) | Browser → Vercel rewrite → Render | Same origin, so session cookies are first-party and CORS isn't needed for the manager app |
| File bytes (large) | Browser ↔ S3 directly, using presigned POST/GET | Keeps large uploads and downloads off the small API instance (512 MB RAM) and off the proxy |
| Evidence ZIP export (large, long) | Browser → Render directly, using a 60-second signed export link | Long streaming responses shouldn't go through the proxy. Render is a long-running server, so there's no function timeout. |

### 8.2 Why split frontend and backend

- **Clear boundary:** the API is a standalone service with its own tests, so it could later serve a Slack bot, a mobile app or the auditor portal without changes.
- **Right runtime for each job:** Vercel is ideal for serving the frontend from a CDN. Render runs a **long-lived Node process**, which suits streaming ZIP exports, background jobs and work that continues after the response (none of which fit serverless time limits).
- **Independent deploys:** a UI change doesn't redeploy the API, and the reverse.
- **Cost of the split, and how it's handled:** two deployments, cross-origin cookies and CORS. The Vercel rewrite gives a single origin, shared Zod schemas in `packages/shared` keep the contract in sync, and CI builds both apps.

### 8.3 Layered design in the API (why it matters for code quality)

| Layer | Folder | Responsibility | Rule |
|---|---|---|---|
| **Routes** | `src/routes/*` | HTTP only: parse with Zod, call one service method, return JSON | Thin. No business logic, no Prisma. |
| **Middleware** | `src/middleware/*` | `requireManager`, `requireOwnerToken`, rate limits, origin check, `errorHandler` | Cross-cutting concerns in one place |
| **Services** | `src/services/*` | Business rules: AuditService, RequestService, UploadService, ScanService, ReviewService, ReminderService, TokenService, ExportService | Framework-agnostic. Repositories and adapters are passed in (dependency injection), so services are unit-testable. |
| **Domain** | `src/domain/*` | Pure functions and types: `transition()`, `computeReminderKind()`, `isOverdue()`, `validateFileMeta()`, `decideScanOutcome()` | Zero I/O. 100% unit-test target. |
| **Infrastructure** | `src/repositories/*`, `src/adapters/*` | Prisma queries, S3 client, Resend client | Behind interfaces (`StoragePort`, `MailerPort`), so tests use in-memory fakes and providers can be swapped |

The frontend mirrors this simply. `lib/api-client.ts` is a typed fetch wrapper using the shared Zod types, `hooks/` holds TanStack Query hooks plus `useUpload()`, and `components/` holds UI only.

This is a light **ports-and-adapters (hexagonal)** structure. Locally, the same S3 adapter talks to **MinIO** (an S3-compatible server in Docker) just by changing the endpoint.

### 8.4 How files are stored

Every file has **two halves**:

| Half | Where it lives | What it contains |
|---|---|---|
| **Bytes** | AWS S3 bucket (private, versioned, Object Lock on, encrypted with SSE-S3) | The file contents, with `Content-Type` set to the detected type |
| **Metadata** | PostgreSQL, `EvidenceFile` row | Who and what it belongs to, original filename, size, declared and detected type, SHA-256, scan result, state, storage key, retention date, timestamps |

The database is the **source of truth**. Anything in S3 without a matching `VERIFIED` row is treated as garbage and cleaned up.

#### Bucket setup (one bucket per environment: `evidencechase-dev`, `evidencechase-prod`)

| Setting | Value | Why |
|---|---|---|
| Region | `ap-southeast-1` (Singapore) | Same region as the Render API, so verification and copies are fast |
| Block Public Access | All four settings on | No object can ever be made public, even by mistake |
| Object Ownership | Bucket owner enforced (ACLs disabled) | Permissions come only from IAM and the bucket policy, never per-object ACLs |
| Default encryption | SSE-S3 (AES-256) | Every object is encrypted at rest |
| Bucket policy | Deny every request where `aws:SecureTransport` is `false` | HTTPS-only access |
| Versioning + Object Lock | Enabled when the bucket is created | Object Lock requires versioning. Overwrites never destroy old data. |
| Lifecycle rule | `quarantine/`: expire objects after 1 day, delete old versions and leftover delete markers after 1 day | Abandoned and rejected uploads disappear automatically |
| CORS | Allow the Vercel origin, methods `POST` and `GET` | The browser uploads to and downloads from S3 directly |
| GuardDuty Malware Protection | Protects the `quarantine/` prefix, object tagging on | Every new upload is scanned and tagged with the result |

In dev, the bucket (or MinIO) runs with `MALWARE_SCAN_ENABLED=false`, so files skip the scan step.

#### Object keys use server-generated IDs, never the user's filename

```
quarantine/{requestId}/{fileId}                               ← just uploaded, not trusted yet
evidence/{auditId}/{requestId}/{submissionId}/{fileId}        ← checked, scanned clean, retained
```

The original filename (`Q3 access review (final).pdf`) is stored **only in the database**. It's put back at download time with `Content-Disposition: attachment; filename="…"`.

Why IDs instead of filenames: no path traversal (`../../`), no clashes when two people upload `screenshot.png`, no problems with Unicode or spaces, and filenames (which can contain sensitive information) don't leak into storage logs.

#### Least-privilege IAM policy for the API

Render runs outside AWS, so the API uses an **IAM user with an access key**, and that user can do only what the API needs:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "Quarantine",
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:GetObjectTagging", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::evidencechase-prod/quarantine/*"
    },
    {
      "Sid": "Evidence",
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:PutObjectTagging", "s3:PutObjectRetention"],
      "Resource": "arn:aws:s3:::evidencechase-prod/evidence/*"
    }
  ]
}
```

- **The API can't delete evidence.** There's no `s3:DeleteObject` on `evidence/*`, and no `s3:BypassGovernanceRetention`. Even a leaked API key can't destroy accepted evidence.
- **Presigned URLs inherit these permissions.** Upload links are signed with this user's credentials, so a browser can only ever write into `quarantine/`.
- No `s3:ListBucket`, so a leaked key can't even list what's stored.

#### Lifecycle of one file

```
 1. PRESIGN   Owner selects files → API validates name/size/type list (Zod + allowlist)
              → INSERT EvidenceFile(state=PENDING_UPLOAD, storageKey=quarantine/…)
              → returns a presigned POST (5 min) whose policy pins:
                  key = exactly this key · Content-Type = the declared type ·
                  content-length-range = 1 byte … 25 MB   ← S3 itself refuses anything else

 2. UPLOAD    Browser POSTs the form (policy fields + file) straight to S3, with a progress bar
              and retry. GuardDuty starts scanning the new object right away.

 3. VERIFY    On submit, for each fileId (it must belong to THIS token's request and be PENDING_UPLOAD):
              a. HEAD object        → exists, and size matches what was declared
              b. GET bytes 0–4095   → magic bytes (file-type) → real type in allowlist and matches extension?
              c. stream full object → compute SHA-256 on the server (the browser is never trusted)
              ✗ any check fails    → DELETE object, state=REJECTED, return 422 with the reason

 4. RECORD    One DB transaction:
              files → state=AWAITING_SCAN, sha256, detectedMime, submissionId
              + new Submission (isCurrent=true, previous one isCurrent=false)
              + request status → SUBMITTED (optimistic version check)
              + ActivityLog row (ip, userAgent)
              The owner gets "Submitted" now and doesn't wait for the scan.
              (With scanning disabled, the file jumps straight to step 6.)

 5. SCAN      GuardDuty tags the quarantine object GuardDutyMalwareScanStatus=<result>,
              usually within a minute. ScanService.check() reads the tag (GetObjectTagging):
                NO_THREATS_FOUND                  → step 6
                THREATS_FOUND / UNSUPPORTED / FAILED → delete from quarantine, file REJECTED with reason,
                                                    request → CHANGES_REQUESTED (actor SYSTEM),
                                                    owner and manager emailed
                no tag yet                        → try again on the next check
                                                    (after 30 min with no result → FAILED, as above)

 6. PROMOTE   CopyObject quarantine/… → evidence/…  (server-side copy, the bytes never pass through the API)
              UPDATE file → state=VERIFIED, storageKey=evidence/…, verifiedAt
              PutObjectRetention (GOVERNANCE, OBJECT_LOCK_RETENTION_DAYS) → save retainUntil
              DeleteObject quarantine/…

 7. SERVE     Only VERIFIED files can be downloaded. Manager clicks a file → API checks ownership →
              presigned GET (60 s, response-content-disposition=attachment, response-content-type=detectedMime)

 8. CLEAN UP  S3 lifecycle rule removes anything left in quarantine/ after 1 day.
              Daily job: rows still PENDING_UPLOAD after 24 h → REJECTED.
```

**When the scan result is checked.** There's no webhook to set up. The API checks the tag at three moments:
- Right after submit, for up to about 10 seconds, so small files are often clean before the owner leaves the page.
- Every 5 minutes, when cron-job.org calls `/internal/cron/scan-check`. That call also keeps the free Render instance awake.
- Whenever the manager opens the request.

**Promotion is safe to repeat.** The `evidence/` key is fixed by the file's ID, and every step checks the file's current state first. If the API crashes between the copy and the database update, the next check copies to the same key again (versioning keeps that harmless) and finishes the job. If setting the retention fails, `retainUntil` stays empty and the next check tries again.

**Why GOVERNANCE mode for Object Lock in the MVP.** In COMPLIANCE mode, *nobody*, not even the AWS root user, can delete a locked object or shorten its retention, so the demo bucket couldn't be cleaned up until the retention ran out. In GOVERNANCE mode, the API still can't delete anything (it lacks `s3:BypassGovernanceRetention`), but an admin can clean up. A real customer deployment would use COMPLIANCE mode, with the retention period set per audit.

#### Protection at every layer

| Concern | Control |
|---|---|
| **Who can upload** | Only a holder of a valid, unexpired, unrevoked token for that exact request. A presigned POST is for one key, for 5 minutes. |
| **What gets in** | S3 enforces the size cap and the exact key and content type. The API then checks extension, declared MIME and **magic bytes** against the allowlist. Maximum 10 files per submission. |
| **Malware** | GuardDuty scans every upload. Only `NO_THREATS_FOUND` files leave quarantine. |
| **Untrusted until checked** | Everything lands in `quarantine/` first. Only checked, clean files reach `evidence/`. |
| **Integrity / tamper evidence** | SHA-256 computed by the server and stored in the database. Re-checked during export and written to `index.csv`. Files are never overwritten, versioning keeps every version, and Object Lock blocks deletion. |
| **At rest** | SSE-S3 encryption on every object. Block Public Access. ACLs disabled. |
| **In transit** | HTTPS everywhere. The bucket policy rejects any non-TLS request. |
| **Least privilege** | Only the API holds AWS credentials, and its IAM user can't list the bucket, delete evidence or bypass retention. The browser only ever gets short-lived signed URLs. |
| **Safe viewing** | Downloads are forced as attachments. Image/PDF previews load in a sandboxed iframe. Files are served from S3's domain, a separate origin from the app, so a malicious file can't reach app cookies. `nosniff` header. |
| **Traceability** | Upload, submit, scan result, review and download events are written to `ActivityLog` with actor, IP and user agent |
| **Next (post-MVP)** | CloudTrail S3 data events, customer-managed KMS keys, COMPLIANCE-mode retention, short-lived credentials instead of a long-lived access key |

### 8.5 Key sequence: owner uploads evidence

```
Owner Browser          Vercel (rewrite)      Render API                        Postgres       S3 + GuardDuty
   │ GET /api/e/request (header X-Access-Token)  │                               │               │
   │───────────────────────▶│───────────────────▶│ sha256(token) → lookup ──────▶│               │
   │◀────────── request details ─────────────────│                               │               │
   │ POST /api/e/uploads {files:[name,size,type]}│                               │               │
   │───────────────────────▶│───────────────────▶│ validate, INSERT PENDING ────▶│               │
   │                        │                    │ createPresignedPost (5 min, ≤ 25 MB)          │
   │◀────────── [{fileId, url, fields}] ─────────│                               │               │
   │ POST form (fields + file) ───────────────────────────────────────────────────────────────▶│ quarantine/
   │                        │                    │                               │   GuardDuty scans + tags
   │ POST /api/e/submit {fileIds, note}          │                               │               │
   │───────────────────────▶│───────────────────▶│ HEAD · ranged GET · SHA-256 ─────────────────▶│
   │                        │                    │ BEGIN; files AWAITING_SCAN; Submission;       │
   │                        │                    │  status UPDATE … WHERE version=v; ActivityLog │
   │                        │                    │ COMMIT ──────────────────────▶│               │
   │◀────────── 200 "Submitted" ─────────────────│ check tag for ≤ 10 s ────────────────────────▶│
   │                        │                    │ clean → Copy to evidence/, retention, VERIFIED│
cron-job.org (every 5 min) ─▶ POST /internal/cron/scan-check → same check-and-promote for any file still AWAITING_SCAN
```

The token travels in the `X-Access-Token` header to the API, not in the API's URL, so it stays out of the API and proxy access logs.

### 8.6 Key sequence: reminder job (idempotent)

```
cron-job.org ──POST /internal/cron/reminders (Authorization: Bearer CRON_SECRET)──▶ Render API
  0. Respond 202 Accepted immediately; run the job in the same process (Render isn't serverless,
     so work can continue after the response). Summary logged via pino.
  1. SELECT open requests WHERE audit.remindersOn AND status IN (PENDING, CHANGES_REQUESTED)
  2. For each request: kind = computeReminderKind(dueDate, today)   ← pure fn, unit-tested
  3. INSERT INTO ReminderLog (requestId, kind, sentOn=today) ON CONFLICT DO NOTHING RETURNING id
     → only rows actually inserted are "to send" (a re-run or double-trigger sends nothing)
  4. GROUP the inserted rows BY ownerEmail → one digest email per owner (Resend batch API)
  5. If sending fails → DELETE those ReminderLog rows so the next run retries
  6. Log {scanned, sent, skipped, failed}
```

**Why "insert first, then send":** this is the database-as-lock pattern. A unique constraint makes the operation idempotent even if the scheduler retries or two calls overlap. The trade-off is at-least-once vs. at-most-once delivery. I chose *at-most-once per day, with a retry on failure*, because a duplicate reminder is more annoying to owners than a reminder that arrives a day late.

**Why respond 202 first:** cron-job.org gives up on requests after about 30 seconds. Replying immediately means a slow run (or a cold start) never looks like a failure to the scheduler.

### 8.7 Lifecycle of a typical API call

`Browser → Vercel rewrite → Render → helmet → originCheck → session / requireOwnerToken → rateLimit → zod.parse → service.method(ctx) → repository (Prisma) → domain errors mapped to HTTP (Validation→422, NotFound→404, Conflict→409, Forbidden→403) → JSON`

All errors go through one Express `errorHandler`, so error shapes are consistent: `{ error: { code, message, details? } }`. Unknown errors return a generic 500 and are logged with a request ID.

---

## 9. Tech stack, with the reasoning behind every choice

> Selection principle: **with roughly 3 days, choose boring, well-documented, free-tier-friendly tools that let one engineer ship a reliable full-stack app, and keep the architecture clean enough to scale.** Each choice below includes *why*, *what I considered instead*, and *the trade-off*. That's the format interviewers probe.

### 9.1 Language and frameworks

| Tech | Why I chose it | Alternatives considered | Trade-off I accept |
|---|---|---|---|
| **TypeScript** (strict mode), both apps | One language across frontend, backend and shared schemas. Compile-time safety catches whole classes of bugs (wrong status string, missing field) before runtime. | JavaScript (no safety), Python/Go backend (two languages, no shared types) | A little build-time overhead and typing effort |
| **pnpm workspaces monorepo** | `apps/web`, `apps/api` and `packages/shared` in one repo. The Zod schemas and types are written **once** and imported by both sides, so the API contract can't drift. One PR changes both ends atomically. | Two repos (contract drift, two CI setups), Nx/Turborepo (more tooling than needed) | Hosting needs a root-directory setting on both Vercel and Render |
| **Next.js 15 (App Router) + React 19**, frontend | File-based routing, layouts, `middleware.ts` for login redirects, and **rewrites** for the same-origin API proxy. First-class on Vercel. | Vite + React SPA (simpler, but I'd hand-roll routing and still need `vercel.json` rewrites), Remix | Next is more framework than a pure client app needs. I keep data fetching on the client with TanStack Query so there's one clear data path. |
| **Node 22 + Express 5**, backend | The most widely known Node framework, with minimal magic: every line is easy to explain in an interview. Express 5 forwards async errors to the error handler natively. Huge middleware ecosystem (helmet, rate limit, sessions). | Fastify (faster, schema-first, a solid alternative), NestJS (good structure, but heavy decorators and DI setup for 3 days), Next.js route handlers (that was the original single-app plan) | Fewer built-in conventions, so I impose the layered structure (§8.3) myself |

**Interview angle: "Why not microservices?"**
It's two deployables (UI and API), not microservices. The API is a single service with one database, so there are no distributed transactions. Inside it, the hexagonal structure means the reminder or export jobs *could* move to a separate worker later without rewriting business logic.

### 9.2 Data layer

| Tech | Why I chose it | Alternatives considered | Trade-off I accept |
|---|---|---|---|
| **PostgreSQL** | Relational data with real integrity needs: foreign keys, a unique constraint for reminder idempotency, ACID transactions for submit, `GROUP BY` for the dashboard. Industry standard. | MongoDB (weak relational queries and constraints), SQLite (single file, unsuitable for a hosted server with redeploys) | Schema migrations need discipline |
| **Render PostgreSQL** (free) | Same provider and **same region** as the API. The API uses the **internal** connection URL, which is low-latency and never leaves Render's network. One dashboard for the whole backend. | Neon, Supabase, Amazon RDS (more VPC and security-group setup than 3 days allow) | The free database **expires 30 days after creation** with 1 GB of space. That's fine for the evaluation window (about 22 Nov). I set a reminder and take a `pg_dump` backup. |
| **Prisma ORM** | Type-safe queries generated from one `schema.prisma`, plus readable **migrations** checked into git (reviewers can see the schema evolve). `$transaction` for atomic submits. | Drizzle (lighter and closer to SQL), raw `pg` (more boilerplate, no types), TypeORM | Slightly heavier than Drizzle. Not an issue on a long-running server, since there are no cold-start-per-request costs. |

**Interview angle: "How do you stop two people clobbering each other's change?"**
**Optimistic concurrency control.** `EvidenceRequest.version` is incremented on every transition: `UPDATE … SET status=$1, version=version+1 WHERE id=$2 AND version=$3`. If zero rows are updated, someone else changed it first, so I return `409 Conflict` and the UI refetches. No locks are held while a user is thinking.

### 9.3 Object storage (AWS)

| Tech | Why I chose it | Alternatives considered | Trade-off I accept |
|---|---|---|---|
| **Amazon S3** | The industry-standard object store. It's built for blobs, encrypted by default, and has the compliance features this product needs: **size limits enforced at upload, Object Lock, built-in malware scanning, versioning and fine-grained IAM**. AWS experience also transfers directly to most B2B SaaS jobs. | Cloudflare R2 (cheaper downloads and simpler setup, but no POST-policy size limit, no built-in malware scanning, and a less mature retention model), Render disk (paid only, tied to one instance), files in Postgres (bloats the 1 GB DB and backups) | More setup: IAM, bucket policy, CORS, GuardDuty. Render runs outside AWS, so the API needs a **long-lived access key**. That's mitigated with least privilege (§8.4), keeping the key only in Render's env vars, and rotating it. |
| **Presigned POST** (upload, 5 min) and **presigned GET** (download, 60 s) | The bucket stays **private**. The POST policy lets **S3 itself refuse** files over 25 MB, a different key or a different content type, before a single byte is stored. File bytes skip both the Vercel proxy and the 512 MB API instance. | Presigned PUT (can't enforce a size range), streaming uploads through the API with `multer` (every byte crosses the small, sleepy free instance) | The client has to make 3 calls (presign → POST → submit). I wrap this in one `useUpload()` hook. |
| **Amazon GuardDuty Malware Protection for S3** | A managed malware scan of every new object in `quarantine/`, with the result written to an object tag. No antivirus server to run or update. | ClamAV on Render (a 512 MB instance can't comfortably hold the virus database, plus signature updates to manage), VirusTotal API (rate limits, and it sends customer files to a third party) | Results are asynchronous (usually under a minute), so the design adds an `AWAITING_SCAN` state. Small per-GB charge, which is cents at demo volume and covered by AWS free-tier credits. |
| **S3 Object Lock** (GOVERNANCE mode) + **versioning** | Write-once storage for verified evidence: it can't be deleted or replaced until the retention date. That's exactly what auditors expect, and it's a strong GRC-specific talking point. | App-level "soft delete" only (a bug or a leaked key could still destroy data) | Must be enabled when the bucket is created, and versioning keeps extra copies. GOVERNANCE rather than COMPLIANCE mode for the demo (§8.4). |
| **AWS SDK v3** (`@aws-sdk/client-s3`, `@aws-sdk/s3-presigned-post`, `@aws-sdk/s3-request-presigner`) | Modular, typed, official. Works the same against MinIO locally. | — | — |
| **`file-type`** (magic-byte detection) | Reads the first bytes to find the *real* file type, so an `.exe` renamed to `.pdf` is caught | Trusting extension or MIME (both are set by the client and trivially spoofed) | Plain-text formats (CSV, TXT) have no magic bytes, so those are checked for valid UTF-8 text instead |
| **SHA-256** (Node `crypto`, streamed) | Integrity fingerprint for auditors in `index.csv`, and tamper detection on export | — | Reading each file once more after upload, which is cheap at ≤ 25 MB |

**Interview angle: "Why S3 and not Cloudflare R2?"**
At this scale cost is similar, since S3 includes free monthly download allowance. The deciding factors were compliance features: S3 enforces the size limit *before* upload, scans for malware with GuardDuty, and locks evidence with Object Lock. With R2, I would have had to build the first two myself and live without the third. The storage adapter uses the standard S3 API, so switching either way is a config change.

### 9.4 Authentication and security

| Tech | Why I chose it | Alternatives considered | Trade-off I accept |
|---|---|---|---|
| **Email + password with bcrypt** (cost 12) for managers | No third-party console setup, works for evaluators via a demo account, and bcrypt is the standard *slow* hash for low-entropy secrets like passwords | Google OAuth (setup overhead, evaluators may not want to sign in with Google), Clerk/Auth0, Amazon Cognito (powerful but slow to configure) | No password reset in the MVP (documented limitation) |
| **express-session + connect-pg-simple** | Server-side sessions stored **in Postgres**, with no extra service. The cookie is `httpOnly`, `secure` and `sameSite=lax`. Logout and revocation are instant (delete the row). | JWT in localStorage (readable by XSS, can't be revoked), JWT cookies (revocation needs a denylist), Redis sessions (another service) | A DB lookup per request, which is trivial at this scale |
| **Vercel rewrite as a same-origin proxy** | `*.vercel.app` and `*.onrender.com` are different sites, and browsers increasingly **block third-party cookies**. Proxying `/api/*` through the frontend makes the session cookie first-party, and CORS isn't needed for the manager app. | `SameSite=None` cross-site cookies (blocked by Safari and others), tokens in headers (back to localStorage risk), a custom domain for both (best long-term; needs DNS) | One extra network hop. Large and long transfers bypass the proxy (§8.1). |
| **Custom owner magic-link tokens** | Owners must not need accounts (decision #1). A token is 32 random bytes (`crypto.randomBytes`), base64url-encoded, and **only its SHA-256 hash is stored**, so a DB leak doesn't expose working links. Scoped to one request, expires in 30 days (refreshed by reminders), revocable. Sent in the `X-Access-Token` header. | JWT links (can't be revoked without a denylist, and the payload is visible), forcing owner accounts | It's a bearer secret, so anyone with the link can upload. Mitigated by scope, expiry, rate limits, malware scanning, and the manager reviewing every file anyway. |
| **express-rate-limit** (in memory) | Brute-force and abuse protection on login and owner endpoints. In-memory counters are **correct here because the API runs as a single instance**. | Redis-backed limiter (needed once there are multiple instances), Postgres-backed store | Counters reset when the instance restarts or sleeps. Acceptable for an MVP and easy to explain. |
| **helmet** | Sensible security headers on the API in one line | Hand-written headers | — |
| **Zod** (in `packages/shared`) | The same schema validates the form in the browser *and* the request on the server. Server-side validation is the real security boundary. | Yup, Joi | — |

**Security checklist (OWASP-minded)**
- Authorization on every query: `where: { id, audit: { ownerId: req.user.id } }`. This stops IDOR because one manager can never read another manager's audit, even by guessing IDs.
- CSRF: `sameSite=lax` cookies, JSON-only bodies, and an **Origin header check** that allows only the app's origin on state-changing requests.
- `app.set('trust proxy', …)` configured for the Vercel → Render proxy chain, so `secure` cookies and per-IP rate limits see the real client. Checked in logs during Phase 0.
- Upload and storage controls in §8.4.
- AWS account hygiene: MFA on the root user, no root access keys, a separate IAM user for the API with only the policy in §8.4, and a billing alert.
- `/internal/cron/*` protected by `CRON_SECRET` with a constant-time comparison (`crypto.timingSafeEqual`).
- Signed export links use an HMAC with a 60-second expiry, scoped to one audit.
- Security headers on the frontend via `next.config` (CSP, HSTS, `frame-ancestors 'none'`, `Referrer-Policy: no-referrer` so tokens in the owner URL don't leak through the Referer header).
- Secrets only in Vercel and Render env vars. `.env.example` is committed. **gitleaks** scans run in CI, which matters even more now that an AWS key exists.

### 9.5 Email and background jobs

| Tech | Why I chose it | Alternatives considered | Trade-off I accept |
|---|---|---|---|
| **Resend** | Simple HTTPS API (works from Render, unlike SMTP, which free hosting tiers often block), a free tier (3,000/month, 100/day) that's plenty for a demo, and a **batch send** endpoint for digests | Amazon SES (starts in a sandbox that only sends to verified addresses until AWS approves production access, which is too slow for this deadline), SendGrid, Nodemailer + Gmail SMTP | Without a verified domain, sending is restricted, so I verify a domain or subdomain on day 1 |
| **React Email** | Email templates as typed React components, rendered to HTML on the API, previewable locally | Handlebars/MJML strings | — |
| **cron-job.org** (external scheduler) | Free, reliable HTTP scheduler. Two schedules: the **scan check every 5 minutes**, which also keeps the free Render instance awake, and the **daily reminder** call. | Render Cron Jobs (paid), `node-cron` inside the API (doesn't fire while the instance is asleep), GitHub Actions schedule (start times drift), Amazon EventBridge Scheduler (works, but more AWS setup for something this simple) | An external dependency for scheduling. Every job is idempotent, so a missed or duplicated call is harmless. |
| **In-process job after 202** | Render runs a long-lived process, so the job can keep running after the response. That avoids a queue for the MVP. | BullMQ + Redis worker, Amazon SQS | If the instance restarts mid-job, the remaining work is picked up by the next run (idempotency). A queue is the next step at scale. |

**Interview angle: "What if the job runs twice or crashes halfway?"**
The `ReminderLog` unique constraint plus `ON CONFLICT DO NOTHING` makes it idempotent, so a re-run only sends what hasn't been recorded yet. On a send failure I delete the log rows so the next run retries. See §8.6. The scan check is idempotent in the same way, because each step checks the file's state first and the `evidence/` key is fixed (§8.4).

### 9.6 Frontend and UI

| Tech | Why I chose it | Alternatives considered | Trade-off I accept |
|---|---|---|---|
| **TanStack Query** | Server state on the client: caching, loading and error states, retries, and cache invalidation after a review action. Polling of "Scanning…" files until they turn clean. | SWR, plain `useEffect` fetching (race conditions, no cache) | — |
| **Tailwind CSS v4** | Fast to build with, consistent design tokens, tiny production CSS | CSS Modules, styled-components | Long class strings, which I manage with `cn()` and small components |
| **shadcn/ui** (Radix primitives) | Accessible primitives (dialogs, dropdowns, focus management, ARIA) copied into my repo, so I own and can explain the code | MUI (heavy, harder to customise), Chakra | I maintain the copied components |
| **React Hook Form + Zod resolver** | Performant forms using the *same* Zod schemas as the API | Formik | — |
| **TanStack Table** | Sorting and filtering on the requests table (by owner, status, due date) | AG Grid (heavy) | — |
| **react-dropzone** | Drag-and-drop multi-file input with type and size checks on the client | Native input only | — |
| **Papa Parse** | Robust CSV parsing (quotes, BOM, Excel exports). The CSV is parsed in the browser for a preview, and the API re-validates every row. | Manual `split(',')` | — |
| **Recharts** (one donut + one bar) | A simple, declarative progress chart for the dashboard | Chart.js, D3 (overkill) | — |

### 9.7 Export

| Tech | Why I chose it | Trade-off I accept |
|---|---|---|
| **archiver** (streaming ZIP) + S3 `GetObject` streams, served from Render via a 60-second signed link | Only `VERIFIED` files from `evidence/` are included. They stream from S3 through the ZIP straight to the response, with constant memory use. Render has **no function duration limit**, so large exports are fine. | Export bandwidth runs through the API instance. Next step: write the ZIP to S3 in a background job and email a presigned link. |

### 9.8 Testing and quality

| Tech | Why I chose it | Alternatives considered |
|---|---|---|
| **Vitest** | Fast, native ESM/TypeScript, Jest-compatible API. Used in both apps. | Jest (slower TS/ESM setup) |
| **Supertest** | Calls the Express app in-process (`createApp()` factory) to test routes, middleware, auth and error mapping without a running server | Hand-rolled fetch against a live server |
| **Real Postgres in tests** (GitHub Actions `services: postgres`, Docker locally) | The idempotency, transaction and locking guarantees **only exist in a real database**, so they must be tested against one | SQLite in-memory (different SQL semantics), mocks (would lie) |
| **In-memory fakes** for `StoragePort` / `MailerPort` | Tests never send real emails or touch AWS. The fake storage can return any scan tag, so every scan outcome is testable. | — |
| **MinIO** (Docker) | An S3-compatible server for local development and an optional storage integration test, including presigned POST. GuardDuty isn't available locally, so scanning is switched off there. | LocalStack (heavier) |
| **EICAR test file** | The industry-standard harmless "fake virus" file. Uploading it to production proves GuardDuty catches threats end to end. | — |
| **Playwright** | E2E across real browsers for the main path, run in CI against the locally started web + API + MinIO | Cypress |
| **ESLint + Prettier + `tsc --noEmit`** | Consistent style and type gate across the monorepo | — |
| **GitHub Actions** | CI on every push: install → lint → typecheck → unit → integration → build both apps → gitleaks. The badge goes in the README. | — |

### 9.9 Hosting and operations

| Tech | Why I chose it | Alternatives considered | Trade-off I accept |
|---|---|---|---|
| **Vercel** (Hobby), frontend | Built by the Next.js team, so zero-config deploys, a **preview URL per PR**, HTTPS, CDN and **rewrites** for the API proxy. It never sleeps, so the first page always loads instantly. | Netlify, Cloudflare Pages, AWS Amplify | Rewrites to an external origin add a hop, so large and long transfers are routed around it |
| **Render** (free web service), API | Runs a normal **long-lived Node server**: no function timeouts, streaming exports, background work after responding, in-memory rate limits. Git-based deploys, health checks, logs, and Postgres in the same dashboard and region (Singapore, closest to India and next to the S3 bucket). | Railway (trial credit runs out), Fly.io (more ops work), AWS EC2/ECS/App Runner (VPC, IAM and container setup that doesn't fit 3 days), serverless functions (timeouts, no background work) | The free instance **sleeps after 15 minutes idle** (30–60 s to wake). Mitigated by the 5-minute scan-check call. 750 free hours a month covers one always-on service. |
| **AWS Budgets** | An email alert at $1 and $5, so no AWS cost can surprise me | — | — |
| **pino** (structured JSON logs) + Render log viewer | Fast logging with a request ID on every line, so one request can be traced across middleware and services | `console.log` | — |
| **UptimeRobot** (optional) | Alerts me if either URL goes down during the evaluation window | — | — |

### 9.10 Full stack at a glance

```
Frontend   : Next.js 15 · React 19 · TypeScript · TanStack Query · Tailwind v4 · shadcn/ui
             React Hook Form · Zod · TanStack Table · react-dropzone · Papa Parse · Recharts
Backend    : Node 22 · Express 5 · TypeScript · layered services (hexagonal) · pino · helmet
Database   : PostgreSQL (Render, same region) · Prisma ORM + migrations
Storage    : AWS S3 (ap-southeast-1; private, versioned, Object Lock, SSE-S3) · presigned POST/GET
             GuardDuty Malware Protection for S3 · AWS SDK v3 · file-type · IAM least privilege
Auth       : email + password (bcrypt) · express-session + connect-pg-simple · hashed owner tokens
Email/Jobs : Resend + React Email · cron-job.org (scan check every 5 min + daily reminders)
Security   : express-rate-limit · Zod · origin check · CSP/HSTS · signed URLs · gitleaks
Testing    : Vitest · Supertest · real Postgres in CI · MinIO · EICAR · Playwright · GitHub Actions
Hosting    : Vercel (web) · Render (API + Postgres) · AWS (S3, GuardDuty, Budgets) · Resend
Repo       : pnpm workspaces — apps/web, apps/api, packages/shared
```

---

## 10. Non-functional requirements

| Category | Requirement | How it's achieved |
|---|---|---|
| **Performance** | API p95 < 300 ms (warm). Owner page interactive < 2 s on 4G. Files usually scanned within a minute. | Single aggregated `GROUP BY` for the dashboard, indexed queries, API, DB and S3 all in the Singapore region, small owner-page bundle |
| **Scalability (MVP)** | 50 audits × 200 requests × 10 files | Cursor pagination on the requests table, direct-to-S3 uploads and downloads, streamed exports |
| **Reliability** | Reminders never duplicate. Submits are atomic. Promotion survives crashes. No orphaned files. | DB unique constraint, `$transaction`, optimistic locking, state-checked promotion with fixed keys, quarantine lifecycle rule |
| **Availability** | Live for at least 10 days after 26 Oct | Vercel never sleeps. Render is kept awake by the 5-minute scan check. Render Postgres expiry (about 22 Nov) is past the window. UptimeRobot alerts. |
| **Security** | No IDOR, no leaked secrets, private and scanned files, evidence can't be deleted | §8.4 and §9.4 |
| **Accessibility** | WCAG 2.1 AA on core flows | Radix primitives, labelled inputs, keyboard-operable upload, colour contrast checked |
| **Auditability** | Every state change traceable | Append-only `ActivityLog` with actor, IP and timestamp. Object Lock and versioning on the evidence itself. |
| **Maintainability** | A newcomer can run it in < 10 minutes | README setup, `.env.example` per app, `pnpm db:seed` demo data, Docker Compose for Postgres + MinIO |

---

## 11. Deployment and environments

```
             push / PR                                   merge to main
Developer ──────────▶ GitHub ──Actions CI──┬──▶ Vercel Preview (web) ──────▶ Vercel Production (web)
                       lint, typecheck,    │                                 evidencechase.vercel.app
                       unit, integration,  │                                       │ /api/* rewrite
                       build, gitleaks     └──▶ (main only) Render auto-deploy ──▶ Render API (Singapore)
                                                build → prisma migrate deploy       │            │
                                                                       internal URL │            │ IAM user
                                                                         Render PostgreSQL   AWS S3 + GuardDuty
```

| Env | Web | API | DB | Storage | Malware scan | Email | Scheduler |
|---|---|---|---|---|---|---|---|
| Local | `localhost:3000` | `localhost:4000` | Docker Postgres | MinIO (Docker), or the dev S3 bucket | Off | Console mailer | Manual `curl` |
| Preview | Vercel preview | Not used. Previews are UI-only. | — | — | — | — | — |
| Production | Vercel | Render | Render Postgres | S3 `evidencechase-prod` | GuardDuty on `quarantine/` | Resend (verified domain) | cron-job.org |

**Render settings**
- Root directory: `apps/api`. Region: Singapore. Health check path: `/health`.
- Build: `corepack enable && pnpm install --frozen-lockfile --prod=false && pnpm build && pnpm db:deploy`. Migrations run in the build step, because pre-deploy commands are a paid feature.
- Start: `node dist/server.js`

**Vercel settings**
- Root directory: `apps/web`
- `next.config.ts`: `rewrites()` → `/api/:path*` to `${API_ORIGIN}/:path*`, plus security headers

**Environment variables**

`apps/api/.env.example`
```
NODE_ENV=
PORT=4000
TZ=UTC
DATABASE_URL=                  # Render internal URL in production
SESSION_SECRET=
CRON_SECRET=
EXPORT_SIGNING_SECRET=
WEB_ORIGIN=                    # https://evidencechase.vercel.app (origin check)
API_PUBLIC_URL=                # https://<api>.onrender.com (signed export links)
RESEND_API_KEY=
EMAIL_FROM=
AWS_REGION=ap-southeast-1
AWS_ACCESS_KEY_ID=             # IAM user evidencechase-api-<env>
AWS_SECRET_ACCESS_KEY=
S3_BUCKET=
S3_ENDPOINT=                   # local MinIO only (e.g. http://localhost:9000); empty in production
MALWARE_SCAN_ENABLED=true      # false locally (no GuardDuty)
OBJECT_LOCK_RETENTION_DAYS=90
```

`apps/web/.env.example`
```
API_ORIGIN=                    # used by next.config rewrites
NEXT_PUBLIC_APP_URL=
```

### Project structure

```
evidencechase/
├─ apps/
│  ├─ web/                          # Next.js on Vercel
│  │  ├─ app/
│  │  │  ├─ (marketing)/page.tsx     # landing page with the problem/pitch
│  │  │  ├─ (auth)/login, signup
│  │  │  ├─ (app)/audits/…           # manager area (middleware redirects if no session)
│  │  │  └─ e/[token]/page.tsx       # owner portal (public, token-scoped)
│  │  ├─ components/                 # shadcn/ui + feature components
│  │  ├─ hooks/                      # useAudits, useRequests, useUpload …
│  │  ├─ lib/api-client.ts           # typed fetch wrapper using shared Zod types
│  │  └─ next.config.ts              # rewrites + security headers
│  └─ api/                          # Express on Render
│     ├─ src/
│     │  ├─ app.ts                   # createApp(deps): builds the Express app (used by tests)
│     │  ├─ server.ts                # listens on PORT
│     │  ├─ routes/                  # auth, audits, requests, review, owner, files, exports, internal, health
│     │  ├─ middleware/              # requireManager, requireOwnerToken, rateLimits, originCheck, errorHandler
│     │  ├─ domain/                  # pure: requestStatus, reminderSchedule, overdue, fileRules, scanOutcome
│     │  ├─ services/                # Audit, Request, Upload, Scan, Review, Reminder, Token, Export
│     │  ├─ repositories/            # Prisma-backed data access
│     │  ├─ adapters/                # storage.s3.ts, mailer.resend.ts, mailer.console.ts
│     │  ├─ jobs/                    # reminders.ts, scanCheck.ts, cleanupPendingFiles.ts
│     │  └─ emails/                  # React Email templates
│     ├─ prisma/                     # schema.prisma, migrations/, seed.ts
│     └─ tests/                      # unit/, integration/
├─ packages/shared/                 # zod schemas, types, constants (allowed file types, limits)
├─ infra/aws/                       # bucket policy, CORS, lifecycle and IAM policy JSON (documented setup)
├─ e2e/                             # Playwright tests
├─ docs/                            # PRD.md, phases.md, TEST_PLAN.md
├─ docker-compose.yml               # postgres + minio
├─ pnpm-workspace.yaml
└─ .github/workflows/ci.yml
```

`infra/aws/` keeps every AWS setting as reviewable JSON, so a stranger can recreate the bucket and IAM user exactly. Turning it into Terraform is a roadmap item.

---

## 12. Testing strategy

**Test pyramid:** many fast unit tests on pure domain logic, a focused set of integration tests on database and HTTP guarantees, and 1–3 E2E tests for the critical paths.

### 12.1 Unit tests (Vitest), target 100% on `apps/api/src/domain`

| Area | Cases |
|---|---|
| `transition()` state machine | Every valid transition. Every invalid one throws (`ACCEPTED → SUBMIT` from the owner, `PENDING → ACCEPT`). Requesting changes without a comment is rejected. The SYSTEM actor can move `SUBMITTED → CHANGES_REQUESTED`. |
| `computeReminderKind()` | T-7/T-3/T-1/T-0. Overdue +3/+6. Not-due days return null. **Timezone edges** (dates are compared in UTC date-only, with IST due dates around midnight). Leap day. Due date in the past at creation. |
| `isOverdue()` | Due today = not overdue. Yesterday + PENDING = overdue. Yesterday + SUBMITTED = not overdue. |
| `decideScanOutcome()` | `NO_THREATS_FOUND` → promote. `THREATS_FOUND`, `UNSUPPORTED`, `FAILED` → reject. No tag and under 30 min → wait. No tag and over 30 min → reject as `FAILED`. |
| Token service | Generated tokens are unique and high-entropy. Only the hash is persisted. Expired/revoked tokens are rejected. Timing-safe compare. |
| Presigned POST policy builder | The policy always contains the exact key, the declared content type, `content-length-range` 1…25 MB and a 5-minute expiry |
| CSV import validator (shared) | Valid file. Bad email on row 7 → error lists row 7. Missing column. Duplicate controlRef. BOM/Excel quoting. Empty file. > 500 rows rejected. |
| File rules | Disallowed extension, extension/MIME mismatch, **magic bytes don't match the extension**, non-UTF-8 "CSV", 0-byte file, > 25 MB, > 10 files |

### 12.2 Integration tests (Supertest + real Postgres + fake storage and mailer)

- **Reminder idempotency:** run the reminder job twice and assert the fake mailer was called once per owner.
- **Digest grouping:** one owner with 3 due requests gets 1 email listing all 3.
- **Send failure retry:** the mailer throws, so the log rows are removed and the next run sends.
- **Atomic submit:** force an error mid-transaction and assert no orphan `Submission`, the files stay `PENDING_UPLOAD`, and the status is unchanged.
- **Upload ownership:** submitting a `fileId` that belongs to a different request's token gets `404`.
- **Spoofed file:** an executable uploaded as `.pdf` gets `422`, and the object is deleted from quarantine.
- **Clean scan:** fake tag `NO_THREATS_FOUND` → the file is copied to `evidence/`, marked `VERIFIED`, given a retention date, and the quarantine copy is deleted.
- **Infected scan:** fake tag `THREATS_FOUND` → the file is `REJECTED`, the request moves to `CHANGES_REQUESTED` with a SYSTEM log entry, and the owner is emailed.
- **Promotion is repeatable:** run the scan check twice (and once with a simulated crash after the copy) → exactly one `VERIFIED` file at the expected key.
- **Accept blocked while scanning:** accepting a request with an `AWAITING_SCAN` file gets `409`.
- **Optimistic lock:** two concurrent reviews, where exactly one succeeds and the other gets `409`.
- **Authorization (IDOR):** manager B gets `404` on manager A's audit, requests and files.
- **Auth and CSRF:** no session → `401`. Wrong `Origin` on a POST → `403`. Login rate limit → `429`.
- **Cron auth:** missing or wrong `CRON_SECRET` → `401`.

### 12.3 E2E (Playwright)

1. Manager signs up, creates an audit, imports a CSV of 3 requests and sends them.
2. Open the owner link captured from the console mailer, upload a PDF and submit. The status shows *Submitted*.
3. The manager requests changes, then the owner resubmits and the manager accepts. The dashboard shows 33% complete and the export downloads a ZIP containing `index.csv`.

The E2E run uses MinIO with scanning switched off. Scanning is covered by integration tests and a manual production check.

### 12.4 Manual production checks (recorded in `docs/TEST_PLAN.md`)
- Upload the **EICAR test file** → within a minute the request flips to *Changes requested* with "A file failed the malware scan".
- Try a 30 MB file → S3 refuses the upload (policy limit) and the UI explains why.
- Using the API's IAM key with the AWS CLI, try to delete an object under `evidence/` → *Access Denied*.
- Error states: expired link · revoked link · upload network failure mid-file (retry button) · rejected file type with the reason · **API cold start** (skeleton loaders plus a "waking up the server…" message after 3 s) · empty states · 409 conflict toast ("This request changed. Refreshing.") · email provider down (request still saved, banner shown) · session expired (redirect to login, then back).

---

## 13. Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Email deliverability / Resend domain verification delay | Med | High (demo depends on it) | Verify the domain on day 1. Fallback: a "copy link" button next to every request so the demo never blocks on email. |
| **AWS setup takes longer than planned** (IAM, bucket, CORS, GuardDuty) | Med | Med | All of it is in the prerequisites checklist, done before coding. The settings live as JSON in `infra/aws/`. |
| **Leaked AWS access key** | Low | High | Least-privilege IAM user (can't list, can't delete evidence), key only in Render env vars, gitleaks in CI, rotate on suspicion, Budgets alert |
| **GuardDuty slow or unavailable** | Low | Med | The owner never waits for it (asynchronous design). `MALWARE_SCAN_ENABLED` flag lets files skip scanning if the service has problems. Check it's available on the AWS account in the prerequisites. |
| **Object Lock blocks cleanup** | Low | Low | GOVERNANCE mode (an admin can bypass it), a 90-day default, and demo data kept small |
| Unexpected AWS charges | Low | Med | AWS Budgets alerts at $1 and $5. Demo volumes cost cents. |
| **Render free instance sleeps → evaluator waits 30–60 s** | High | Med | cron-job.org calls the API every 5 minutes. Friendly "waking up" UI. Wake it before recording the demo. |
| **Render Postgres free tier expires 30 days after creation** | Certain | High after about 22 Nov | It's outside the evaluation window. Calendar reminder plus a `pg_dump` backup. Upgrade or migrate if the project continues. |
| Cross-site cookie problems | Med | High | Same-origin Vercel rewrite. Tested in Safari and Chrome during Phase 1. |
| Real client IP hidden behind two proxies (Vercel → Render) | Med | Med (rate limits) | Configure `trust proxy` for the hop chain and verify `req.ip` in logs during Phase 0 |
| Timezone bugs in due dates | Med | Med | Store `dueDate` as a `DATE` (not a timestamp), `TZ=UTC` on the API, compare in UTC, dedicated unit tests |
| Scope creep within 3 days | High | High | P0/P1/P2 tiers (§4.2) and the cut line in `phases.md` |
| Magic-link forwarding | Low | Low | Links are scoped to one request, every upload is scanned and reviewed, links are revocable, and the activity log records IP and user agent |

---

## 14. Delivery plan and conventions

The detailed, phase-by-phase plan (prerequisites, tasks, tests, "done when" criteria, example commits and a cut line) is in [`phases.md`](./phases.md). Summary:

| When | Phases |
|---|---|
| **23 Oct (evening)** | Prerequisites (including the AWS setup) and Phase 0: monorepo, CI, both apps deployed and talking to each other |
| **24 Oct** | Phases 1–3: schema, auth, audits and requests, owner portal and the secure upload pipeline (S3, scanning, promotion) |
| **25 Oct** | Phases 4–7: review loop, reminders, dashboard, export, hardening and E2E |
| **26 Oct (morning)** | Phase 8: README, write-up, demo video, submit by 10:00 AM IST |

**Commit conventions:** Conventional Commits with a scope (`feat(api): …`, `feat(web): …`, `chore(infra): …`), small and focused, no "final fix final v2".
**Code conventions:** strict TS, no `any`, named exports, `camelCase` functions, `PascalCase` components, one service per file, schemas only in `packages/shared`, errors as typed `DomainError` subclasses.

---

## 15. Submission plan

### README.md outline
1. EvidenceChase: one-line pitch, **live URL**, **demo account** credentials, demo video link, CI badge
2. The problem and the user (from §2–3)
3. Features and screenshots
4. Architecture diagram (§8.1), how files are stored and protected (§8.4) and tech stack summary (§9.10)
5. Local setup: `pnpm i` → copy each `.env.example` → `docker compose up -d` (Postgres + MinIO) → `pnpm db:migrate && pnpm db:seed` → `pnpm dev` (runs web + API)
6. AWS setup for your own deployment (points to `infra/aws/`)
7. Running tests: `pnpm test`, `pnpm test:integration`, `pnpm test:e2e`
8. Known limitations (from §4.3 and §13), including "the first request may take up to a minute if the API is asleep" and "the scan usually takes under a minute"
9. Attributions (shadcn/ui, templates used, AI assistants used)
10. Product write-up (≤ 400 words) or a link to `WRITEUP.md`

### Product write-up skeleton (≤ 400 words)
1. **Problem and user:** compliance managers waste audit-prep time chasing owners for evidence over spreadsheets and email.
2. **Key decisions:** (a) no login for owners, (b) automatic idempotent reminders, (c) review as a state machine with an audit trail.
3. **Cut and next:** SSO, orgs/RBAC, Slack, recurring evidence, auditor portal, CloudTrail logging, KMS keys.
4. **What broke or surprised me:** *(fill in honestly during the build. Likely candidates: cross-site cookies between Vercel and Render, GuardDuty scans finishing after the submit so a new `AWAITING_SCAN` state was needed, Object Lock needing to be on from bucket creation, Render cold starts, timezone off-by-one errors in reminder dates.)*

### Demo video script (2–3 minutes)
- 0:00 Problem in one sentence and who it's for
- 0:15 Create an audit → import CSV → send requests
- 0:50 Switch to the owner inbox → open the link (no login) → drag a file → submit
- 1:15 Upload the EICAR test file on another request → show it flagged and sent back automatically
- 1:35 Manager reviews → request changes with a comment → owner resubmits → accept
- 2:00 Dashboard progress, overdue list, trigger the reminder job and show the digest email
- 2:20 Export ZIP and open `index.csv` with SHA-256 hashes. Show the Object Lock retention date in the S3 console.
- 2:40 Wrap up: architecture in one slide, what's next

---

## 16. Success metrics (how I'd measure it as a real product)

| Metric | Target | Why |
|---|---|---|
| **Owner response time** (request sent → first submission) | Median < 3 days | The core value is less chasing |
| **% requests completed before due date** | > 80% | Audit readiness |
| **Manual follow-ups per audit** | ~0 (reminders do it) | Directly measures the pain removed |
| **First-pass acceptance rate** | > 70% | Clear instructions mean fewer rejection cycles |
| **Owner portal completion rate** (link opened → submitted) | > 85% | Validates the "no login" decision |

---

## 17. Interview prep: likely questions and short answers

| Question | Answer |
|---|---|
| *Why did you pick this problem?* | It's VComply's customers' pain, it's validated by how many teams still run audits on spreadsheets, and it has a clear wedge: the **chasing** step, not all of GRC. |
| *Why separate the frontend and backend?* | Each runs where it fits best: a CDN-served UI on Vercel and a long-running Node server on Render for streaming exports and background jobs. The API has a clear contract (shared Zod schemas) and can serve other clients later. The cost is two deployments and cross-origin issues, which I solved with a same-origin rewrite. |
| *Why the Vercel rewrite instead of CORS?* | Different domains make the session cookie third-party, and browsers block those. Proxying `/api/*` makes it first-party, so I can use a simple `httpOnly`, `sameSite=lax` cookie with no tokens in localStorage. |
| *How are files stored?* | Bytes in a private, versioned, encrypted S3 bucket under server-generated keys (`evidence/{audit}/{request}/{submission}/{fileId}`). Metadata (original name, size, real type, SHA-256, scan result, retention date) in Postgres, which is the source of truth. Files land in `quarantine/` first and are promoted only after the checks and the malware scan pass. |
| *Why S3 and not R2, or files in Postgres?* | S3 enforces the size limit before upload, scans for malware with GuardDuty, and locks evidence with Object Lock. Those are compliance features I'd otherwise build or go without. Files in Postgres would bloat the 1 GB database and every backup. |
| *How do you know an uploaded file is what it claims?* | S3 rejects anything over 25 MB or with the wrong key or content type. Then the API checks the extension, the declared MIME type and the **magic bytes**, and computes its own SHA-256. Then GuardDuty scans it. The client is never trusted. |
| *How does malware scanning work?* | GuardDuty watches `quarantine/` and tags each new object with its result. The API reads that tag right after submit, every 5 minutes, and when the manager opens the request. Clean files move to `evidence/`. Anything else is deleted and the request goes back to the owner automatically. I chose checking (polling) over EventBridge webhooks to keep the setup small, and the checks are idempotent. |
| *What happens if your AWS key leaks?* | The IAM user can't list the bucket, can't delete anything in `evidence/` and can't bypass Object Lock, so evidence survives. I'd rotate the key straight away. Long-term, I'd replace the long-lived key with short-lived credentials (IAM Roles Anywhere, or running the API on AWS with an IAM role). |
| *Why GOVERNANCE and not COMPLIANCE mode?* | In COMPLIANCE mode nobody, not even root, can delete a locked object before the retention date, which is right for customers but would trap a demo bucket. GOVERNANCE still blocks the API, while an admin can clean up. |
| *How is a magic link secure?* | 256-bit random token, only the SHA-256 hash stored, scoped to one request, 30-day expiry, revocable, rate-limited, sent in a header (not logged), every file scanned and reviewed by a human, `no-referrer` policy. |
| *Why SHA-256 for tokens but bcrypt for passwords?* | Tokens are high-entropy random values, so brute force is infeasible and a fast hash is correct (and allows an indexed lookup). Passwords are low-entropy, so they need a deliberately *slow* hash like bcrypt. |
| *How do reminders avoid duplicates?* | Insert into `ReminderLog` with `UNIQUE(requestId, kind, sentOn)` and `ON CONFLICT DO NOTHING` first, then send only what was inserted. The DB constraint is the lock. |
| *Your API sleeps on the free tier. How do you handle that?* | The 5-minute scan-check call keeps it awake, there's a "waking up" UI state, and uploads and downloads go straight to S3, so they don't depend on the API being warm mid-transfer. In production I'd use a paid instance. |
| *Why is in-memory rate limiting OK?* | There's exactly one API instance, so the counters are accurate. With more than one instance I'd move them to Redis or Postgres. Knowing that limit is the point. |
| *Why is "overdue" not a status?* | It's a function of time, so storing it would need a job to keep it fresh and could go stale. Deriving it in the query is always correct. |
| *How would you scale reminders and scanning?* | Replace the in-process jobs with a queue (Amazon SQS). Scan results would arrive through EventBridge instead of polling, workers would retry with backoff, and the same idempotency keys protect against duplicates. |
| *How do you handle concurrent edits?* | Optimistic locking with a `version` column, and a 409 on conflict. |
| *What would you change for multi-tenancy?* | Add `Organization` + `Membership(role)`, scope every repository query by `orgId` (enforced in one place), consider Postgres Row-Level Security, and give each tenant its own S3 prefix and KMS key. |
| *What did you test and why there?* | Pure domain logic gets exhaustive unit tests (cheap, deterministic). DB and HTTP guarantees (idempotency, transactions, scan outcomes, IDOR, CSRF) get Supertest integration tests on real Postgres because mocks would lie about them. One E2E covers the main path, and the EICAR file proves scanning in production. |
| *What's the weakest part of the system?* | A long-lived AWS access key, links that are bearer tokens, and free-tier cold starts. I know the fixes (short-lived credentials, optional owner email OTP, a paid instance) and chose not to build them in 3 days. |
| *Did you use AI? Can you explain the code?* | Yes, as an assistant. Every layer follows the structure in this PRD, and I can walk through any file: route → validation → service → domain → repository/adapter. |
