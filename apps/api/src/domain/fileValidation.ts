import { ALLOWED_FILE_TYPES, extensionOf, FILE_LIMITS } from '@evidencechase/shared';

const TEXT_EXTENSIONS = new Set(['csv', 'txt']);
const MAX_FILE_MB = FILE_LIMITS.maxFileBytes / 1024 / 1024;

export function isTextExtension(extension: string): boolean {
  return TEXT_EXTENSIONS.has(extension);
}

/**
 * Checks what the browser *says* a file is, before any upload link is issued: an allowed
 * extension, a content type that belongs to it, and a size within limits. This is only the first
 * gate. It's all client-controlled, so the uploaded bytes are checked again (see below).
 * Returns null when the file is acceptable, otherwise a reason to show the owner.
 */
export function checkDeclaredFile(file: {
  name: string;
  size: number;
  type: string;
}): string | null {
  const extension = extensionOf(file.name);
  if (!extension) return `"${file.name}" has no file extension`;

  const allowedTypes = ALLOWED_FILE_TYPES[extension];
  if (!allowedTypes) return `.${extension} files aren't accepted`;
  if (!allowedTypes.includes(file.type)) {
    return `"${file.name}" is declared as ${file.type || 'an unknown type'}, which doesn't match .${extension}`;
  }

  if (file.size <= 0) return `"${file.name}" is empty`;
  if (file.size > FILE_LIMITS.maxFileBytes)
    return `"${file.name}" is larger than ${MAX_FILE_MB} MB`;
  return null;
}

/**
 * Checks what a file *really* is, from its first bytes ("magic bytes", detected by `file-type`),
 * against its extension. This is what catches a program renamed to .pdf. Text formats have no
 * magic bytes, so `detectedType` is null for them; for those, finding any binary signature is
 * itself a failure. Returns null when the content matches, otherwise the reason.
 */
export function checkDetectedType(extension: string, detectedType: string | null): string | null {
  if (isTextExtension(extension)) {
    return detectedType === null ? null : `the file is really ${detectedType}, not text`;
  }
  if (detectedType === null) return `its contents don't look like a .${extension} file`;

  const allowedTypes = ALLOWED_FILE_TYPES[extension];
  if (!allowedTypes) return `.${extension} files aren't accepted`;
  return allowedTypes.includes(detectedType)
    ? null
    : `the file is really ${detectedType}, not a .${extension} file`;
}
