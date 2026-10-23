/** Plain-language versions of the S3 errors an owner might hit. */
const S3_ERRORS: Record<string, string> = {
  EntityTooLarge: 'The file changed size after it was chosen. Choose it again.',
  EntityTooSmall: 'The file is empty.',
  AccessDenied: 'The upload link expired. Press Submit again to get a fresh one.',
  InvalidPolicyDocument: "The file doesn't match what was expected. Choose it again.",
};

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
      const code = /<Code>([^<]+)<\/Code>/.exec(xhr.responseText)?.[1];
      reject(
        new Error((code && S3_ERRORS[code]) ?? `The upload failed (${xhr.status}). Try again.`),
      );
    };
    xhr.onerror = () =>
      reject(new Error('The upload was interrupted. Check your connection and try again.'));
    xhr.send(form);
  });
}
