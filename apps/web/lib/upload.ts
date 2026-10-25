/** Plain-language versions of the S3 errors an owner might hit. */
const S3_ERRORS: Record<string, string> = {
  EntityTooLarge: 'The file changed size after it was chosen. Choose it again.',
  EntityTooSmall: 'The file is empty.',
  // S3 also answers AccessDenied when the link has expired; see s3ErrorMessage.
  AccessDenied:
    'Storage refused the upload. Try again, and if it keeps happening, tell your auditor.',
  InvalidPolicyDocument: "The file doesn't match what was expected. Choose it again.",
};

const LINK_EXPIRED = 'The upload link expired. Press Submit again to get a fresh one.';

/**
 * Picks the message for an S3 error response. AccessDenied covers an expired link, a broken
 * policy condition and missing IAM permissions alike, so only S3's own <Message> tells them apart.
 */
function s3ErrorMessage(status: number, responseText: string): string {
  const code = /<Code>([^<]+)<\/Code>/.exec(responseText)?.[1];
  const message = /<Message>([^<]+)<\/Message>/.exec(responseText)?.[1];
  if (code === 'AccessDenied' && message?.includes('Policy expired')) return LINK_EXPIRED;
  // The reason the owner sees is deliberately plain; keep S3's exact one for whoever debugs it.
  if (code) console.error(`S3 refused the upload (${status} ${code}): ${message ?? 'no message'}`);
  return (code && S3_ERRORS[code]) ?? `The upload failed (${status}). Try again.`;
}

/**
 * Sends one file straight to S3 with a presigned POST (PRD §8.4, step 2). The bytes never pass
 * through our API. XMLHttpRequest rather than fetch, because only XHR reports upload progress.
 */
export function uploadToStorage(
  upload: { url: string; fields: Record<string, string> },
  file: File,
  onProgress: (fraction: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    // S3 requires the policy fields first and the file last.
    for (const [name, value] of Object.entries(upload.fields)) form.append(name, value);
    form.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', upload.url);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(1);
        resolve();
        return;
      }
      reject(new Error(s3ErrorMessage(xhr.status, xhr.responseText)));
    };
    xhr.onerror = () =>
      reject(new Error('The upload was interrupted. Check your connection and try again.'));
    xhr.send(form);
  });
}
