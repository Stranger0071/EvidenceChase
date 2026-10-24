# EvidenceChase: product write-up

## 1. The problem and the user

Before an audit, a compliance manager at a 50–500 person company has to collect dozens of pieces of
evidence (screenshots, access reviews, signed policies) from people across the business. It runs on a
spreadsheet, email threads and a shared drive, so most of the time goes on chasing, not reviewing. EvidenceChase is for that manager, and for the control owners who just want to
send one file and be left alone.

## 2. The most important product decisions

- **Owners never get an account.** Every request has its own magic link. A login screen is a reason
  not to respond, so I removed it, and contained the risk instead: only a hash of each token is stored,
  links expire, are scoped to one request, can be revoked, are rate-limited, and every file is reviewed.
- **Reminders need no clicks.** A daily job sends each owner one digest, and stops as soon as evidence
  arrives. Each reminder is claimed in the database before it's sent, so a re-run never sends twice.
- **Evidence is treated as untrusted until proven otherwise.** Files land in quarantine, are checked by
  content rather than extension, fingerprinted by the server, scanned for malware, and only then moved
  to write-once storage. The export re-checks every fingerprint.

## 3. What I cut, and what's next

I cut teams and roles, SSO, Slack reminders, recurring evidence and an auditor portal, to spend the
time on the core loop and its tests. Next: the auditor portal, teams, and short-lived AWS credentials.

## 4. What broke or surprised me

- **File uploads silently did nothing** when chosen through the file picker. The end-to-end test found
  it: the browser's file list is "live" and was emptied before React read it. Copying it first fixed it.
- **Reviews could overwrite each other.** A version number was sent but never checked. I moved status
  changes into one transaction that checks it, and wrote a test with two reviews at once.
- **The MinIO images were no longer published**, which broke local setup. I switched to RustFS after
  checking it supports every S3 feature I use.
- **Malware scans are asynchronous**, so "verified" needed a new in-between state and a job to finish it.
- **Magic-link tokens would have appeared in access logs.** Moving them into the URL fragment keeps them
  off every server.
