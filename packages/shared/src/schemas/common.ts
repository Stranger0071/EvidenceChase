import { z } from 'zod';

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Email is required')
  .max(254, 'Email is too long')
  .email('Enter a valid email address');

/** Optional free text: blank input is stored as null rather than an empty string. */
export function optionalText(maxLength: number) {
  return z
    .string()
    .trim()
    .max(maxLength, `Must be ${maxLength} characters or fewer`)
    .nullish()
    .transform((value) => (value ? value : null));
}
