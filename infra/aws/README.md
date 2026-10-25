# AWS setup

These files document every AWS setting EvidenceChase depends on, so the bucket and IAM user can be
reviewed and recreated exactly. The main [README](../../README.md#how-uploaded-files-are-checked)
explains how the upload pipeline uses them.

| File                 | Applied to                            | Purpose                                                                |
| -------------------- | ------------------------------------- | ---------------------------------------------------------------------- |
| `bucket-policy.json` | Bucket → Permissions → Bucket policy  | Rejects every non-HTTPS request                                        |
| `cors.json`          | Bucket → Permissions → CORS           | Lets the browser upload to and download from S3 directly               |
| `lifecycle.json`     | Bucket → Management → Lifecycle rules | Removes anything left in `quarantine/` after 1 day                     |
| `api-policy.json`    | IAM user `evidencechase-api-prod`     | Least privilege: no listing, no deleting evidence, no retention bypass |

Bucket settings that are chosen at creation time and have no JSON file:

- Region `ap-southeast-2` (the live deployment's bucket)
- **Object Lock enabled**, which also turns on versioning
- Block Public Access: all four settings on
- Object Ownership: bucket owner enforced (ACLs disabled)
- Default encryption: SSE-S3

Replace `evidencechase-prod` and the Vercel origin with your own values before applying.
