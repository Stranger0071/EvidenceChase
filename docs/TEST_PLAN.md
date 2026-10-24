# EvidenceChase — Test Plan and Results

> Companion to [`PRD.md`](./PRD.md) §12. It records what is tested automatically, what was checked by
> hand (with results), and what can only be checked on the live deployment.
>
> Last updated: 24 Oct 2026. Environment: Windows 11, Node 24, Postgres 16 and RustFS (S3-compatible)
> in Docker, Chromium via Playwright.

## 1. Automated tests

Every push runs all of these in GitHub Actions (`.github/workflows/ci.yml`).

| Suite | Count | Runs against | What it covers |
|---|---|---|---|
| Unit (`pnpm test`) | 162 | Pure functions | Request state machine (every valid and invalid transition); reminder schedule (each offset, leap day, year boundary, UTC vs IST); overdue rule; readiness and per-owner roll-ups; CSV parsing (row numbers, BOM, quoting, duplicates, limits); file-type rules (magic bytes vs extension); scan decisions (fail closed); streaming hash + UTF-8 inspection; HTML escaping; `Content-Disposition`; signed links (tampering, expiry); CSV formula defusing; ZIP path safety (zip slip); email templates |
| Integration (`pnpm test:integration`) | 81 | Express app + **real Postgres** (in-memory S3 fake) | Auth, sessions, rate limits, CSRF origin check; IDOR between managers on every resource; archived audits read-only; CSV import all-or-nothing; owner links (invalid / revoked / expired, hash-only storage, rate limit); uploads (renamed `.exe`, non-UTF-8 CSV, missing upload, size mismatch, another request's file, stale version); promotion retry after a failed copy; malware-scan outcomes (clean, threat, never finishes); review with optimistic locking (two simultaneous reviews: exactly one wins); reminders (one digest per owner, re-run and overlapping runs send once, failed email retried, cap shared with "Nudge now"); dashboard figures match the summary; export ZIP contents, hash verdicts (OK / MISMATCH / MISSING), formula defusing, link forgery and expiry |
| End-to-end (`pnpm test:e2e`) | 4 | Real browser → Next.js → Express → Postgres → RustFS | The full lifecycle: sign up → import CSV → copy owner link → owner uploads (no account) → request changes → owner sees the comment and resubmits → accept → dashboard updates → export ZIP opens and its index says `OK`. Plus axe-core WCAG 2.1 AA scans of every screen and dialog, and keyboard-only file choosing. **Any console error or CSP violation fails the test.** |

## 2. Checks done by hand (with results)

| # | Check | How | Result |
|---|---|---|---|
| 1 | Production security headers | `next build && next start`, then `curl -I /login` | ✅ CSP, `nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, COOP `same-origin`, `Permissions-Policy`, HSTS all present |
| 2 | Production CSP doesn't break the app | E2E suite against the production builds (`CI=1 pnpm test:e2e`) | ✅ 4/4 passed with no console errors or CSP violations |
| 3 | Presigned POST rules enforced by the storage server itself | Probe against RustFS: right size, oversized body, wrong content type | ✅ 204 / 400 `EntityTooLarge` / 400 `InvalidPolicyDocument` |
| 4 | Renamed executable caught after a real upload | Smoke test through the proxy with real S3 uploads | ✅ 422 "the file is really application/x-msdownload, not a .pdf file" |
| 5 | Verified evidence gets Object Lock | `GetObjectRetention` on the promoted object | ✅ `GOVERNANCE` until +90 days |
| 6 | Signed export link can't be widened | Change `scope=accepted` → `all` on a real link | ✅ 403 |
| 7 | Reminder job and per-owner cap with real data | Cron call, then "Nudge now" on every open request | ✅ 202; owners already reminded today got 409 `ALREADY_REMINDED_TODAY`, others got their reminder |
| 8 | Dashboard layout | Screenshots at 1280 px and 390 px of the seeded demo audit | ✅ after two fixes (owner bars made equal length; overdue titles no longer truncated on phones) |
| 9 | Chart colours | dataviz palette validator, all pairs, colour-blind simulation | ✅ separation passes; warning amber is below 3:1 by design, so every chart has a visible legend with counts and a table view |
| 10 | No secrets in git history | `gitleaks git` over the full history | ✅ no leaks (working-tree hits are only git-ignored `.next/` build files) |
| 11 | Error states (PRD §12.4) | Integration and E2E tests above, plus the UI paths below | ✅ see §3 |

### Bugs these checks found and fixed

- **Choosing a file through the file picker didn't work** (E2E). The drop zone passed the browser's live
  `FileList` to state and then reset the input, which empties that list before React reads it. Fixed by
  copying the files first.
- **Toasts failed WCAG contrast** (axe). Sonner's `richColors` mode put green text on light green. Switched
  to the default dark-on-white style with icons.
- **Local dev database missed a migration** (smoke test). Not a code bug: production applies migrations
  in the build. The README now says to re-run `pnpm db:migrate` after pulling.
- **Graceful shutdown would always time out** (code review). Idle keep-alive connections from the proxy
  held `server.close()` open until the 10-second force-exit. Idle connections are now closed immediately.
- **Owner tokens and export signatures could land in access logs** (security review). Owner links now
  carry the token in the URL fragment (`/e#<token>`), which browsers never send to a server, and the
  API strips the query string from logged export URLs.

## 3. Error states (PRD §12.4)

| State | Where it's verified |
|---|---|
| Invalid / revoked / expired link | Integration: `owner.test.ts`; E2E: invalid-link page (also checked with axe) |
| Upload interrupted mid-file | UI: per-file error with "try again"; uploaded files keep their ID so they aren't re-sent |
| File refused (type, size, content) | Integration: `owner.test.ts`; UI shows the reason next to the file |
| Malware found | Integration: `scan.test.ts` (request sent back, owner emailed, reason shown on the portal) |
| API cold start | UI: loading state switches to "Waking up the server…" after 3 s (`components/ui/states.tsx`) |
| Empty states | E2E: empty audits list; dashboard hides itself until there are requests |
| Two people editing at once | Integration: simultaneous reviews; stale submit → 409, the UI refetches and explains |
| Email provider down | Integration: `reminders.test.ts` (retried next run), `owner.test.ts` (failed recipients reported) |
| Session expired | UI: any 401 in the manager app goes to `/login?next=…` and back afterwards |

## 4. To check on the live deployment

These need the real AWS, Render, Vercel and Resend accounts. Record the result and date next to each.

### AWS permissions (run with the **API's** IAM access key, not an admin's)

```bash
export AWS_ACCESS_KEY_ID=<api key> AWS_SECRET_ACCESS_KEY=<api secret> AWS_REGION=ap-southeast-1
B=evidencechase-prod
K=$(aws s3api list-objects-v2 --bucket $B --prefix evidence/ --max-items 1 --query 'Contents[0].Key' --output text)  # run this one with an ADMIN key

aws s3api delete-object --bucket $B --key "$K"                       # expect: AccessDenied
aws s3 ls s3://$B                                                    # expect: AccessDenied
curl -s -o /dev/null -w '%{http_code}\n' "http://$B.s3.ap-southeast-1.amazonaws.com/$K"   # expect: 403 (bucket policy denies non-HTTPS)
aws s3api get-object-retention --bucket $B --key "$K"                # expect: Mode GOVERNANCE, RetainUntilDate ≈ +90 days
```

| Check | Expected | Result |
|---|---|---|
| API key deletes an evidence object | AccessDenied | ☐ |
| API key lists the bucket | AccessDenied | ☐ |
| Plain-HTTP request to the bucket | 403 | ☐ |
| Verified object has retention | GOVERNANCE, +90 days | ☐ |
| Upload the EICAR test file through the owner portal | Within ~1 min: request sent back, "malware scan found a threat", file deleted | ☐ |

### Everything else

| Check | Expected | Result |
|---|---|---|
| Live URL in an incognito window after 20+ idle minutes | "Waking up the server…" then the page loads | ☐ |
| Sign in with the demo account in Chrome and Safari | Works in both (proves the first-party cookie via the rewrite) | ☐ |
| `req.ip` in Render logs for `/health` | The real client IP, not Vercel's (adjust `TRUST_PROXY` if not) | ☐ |
| "Send requests" to your own email | Email arrives from your Resend domain; link opens the portal | ☐ |
| cron-job.org "test run" of `/internal/cron/reminders` twice | One digest, then nothing | ☐ |
| cron-job.org scan-check every 5 minutes | Render logs show `Job scan-check finished` | ☐ |
| Render redeploy | Logs show `Shutting down` then `Shutdown complete` (exit code 0) | ☐ |
| Export on the live demo audit | ZIP downloads; every row in `index.csv` says `OK` | ☐ |
| A tester who has never seen the app completes the owner flow unassisted | Done without help | ☐ |
