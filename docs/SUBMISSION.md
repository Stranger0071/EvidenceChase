# Submission guide

Everything in the repo is ready. What's left needs your accounts and your judgement, so it's listed
here in order. **Deadline: Sun 26 Oct 2026, 11:00 AM IST. Aim to send by 10:00.**

## 1. Deploy (about 1–2 hours, most of it waiting)

Detailed account setup is in [phases.md](phases.md) under Prerequisites.

1. **AWS:** create the `evidencechase-prod` bucket (Object Lock on), the IAM user with
   [`infra/aws/api-policy.json`](../infra/aws/api-policy.json), the bucket policy, CORS (with your Vercel
   URL), the lifecycle rule, GuardDuty Malware Protection on `quarantine/`, and a $1 / $5 budget alert.
2. **Resend:** verify your sending domain (start this first: DNS can take hours).
3. **Render:** New → Blueprint → this repo. Fill in the values it asks for. Note the API URL.
4. **Vercel:** import the repo, root directory `apps/web`, env `API_ORIGIN` (Render URL) and
   `STORAGE_ORIGIN` (`https://evidencechase-prod.s3.ap-southeast-1.amazonaws.com`). Note the URL, then
   set `WEB_ORIGIN` on Render to it and update the bucket's CORS origin.
5. **Demo data:** run the seed once against production (Render Shell: `pnpm db:seed`).
6. **cron-job.org:** scan-check every 5 minutes and reminders daily at 03:30 UTC, both `POST` with
   `Authorization: Bearer <CRON_SECRET>` (copy the secret from Render's environment tab).
7. **UptimeRobot (optional):** monitors on the Vercel URL and `<api>/health`.
8. Work through §4 of [TEST_PLAN.md](TEST_PLAN.md) on the live site and tick each row.
9. Put the live URL into the README.

## 2. Record the demo (2–3 minutes)

Wake the API first (open the site a minute before), and use two browser windows: the manager, and a
private window for the owner.

| Time | Show |
| --- | --- |
| 0:00 | The problem in one sentence: managers spend audit prep chasing people for evidence. |
| 0:15 | Sign in as the demo manager. The dashboard: 14% ready, who's overdue, who to chase. |
| 0:35 | New audit → import the sample CSV (show one bad row being caught first, if time allows) → Send requests. |
| 0:55 | Owner window: open the link. No login. Drag in a PDF, add a note, submit. |
| 1:15 | Owner: upload the EICAR test file on another request. Within a minute it's flagged and sent back. |
| 1:35 | Manager: review → request changes with a comment. Owner sees it, resubmits. Manager accepts. |
| 2:00 | "Nudge now" on an overdue request; mention the daily digest and the one-email-a-day cap. |
| 2:15 | Export → open the ZIP → `index.csv` with SHA-256 fingerprints all `OK`; show the Object Lock date in the S3 console. |
| 2:40 | Architecture in one sentence, and what's next. |

Upload it unlisted (YouTube or Drive, "anyone with the link") and put the link in the README.

## 3. Final checks

- [ ] Live URL works in an incognito window after the API has been idle
- [ ] Demo login works; the demo audit shows a mix of statuses
- [ ] The GitHub repo is **public**, and the CI badge is green
- [ ] `gitleaks` is clean on the full history (CI runs it; also checked locally on 24 Oct)
- [ ] Render Postgres expiry date is after **5 Nov** (10 days after the deadline)
- [ ] The cron jobs show successful runs; the AWS budget alert is on
- [ ] README has the live URL and the video link; the write-up is ≤ 400 words (it's 395)

## 4. The email

The brief asks for the submission to go to the contact it names (swati.m@v-comply.com). Suggested text:

> **Subject:** Build & Deploy Assignment — EvidenceChase — Aadi
>
> Hi Swati,
>
> Here is my submission for the VComply build and deploy assignment.
>
> - **Live app:** <Vercel URL> (demo login: demo@evidencechase.app / evidence-demo-2026)
> - **Repository:** https://github.com/Stranger0071/EvidenceChase
> - **Write-up:** https://github.com/Stranger0071/EvidenceChase/blob/main/WRITEUP.md
> - **Demo video:** <link>
>
> EvidenceChase helps compliance managers collect audit evidence without chasing people: owners get a
> secure upload link instead of a login, reminders go out automatically, every file is checked and
> scanned before review, and the evidence pack exports with verified fingerprints.
>
> The API is on Render's free tier, so the very first request after a quiet period can take up to a
> minute while it wakes up.
>
> Thanks,
> Aadi
