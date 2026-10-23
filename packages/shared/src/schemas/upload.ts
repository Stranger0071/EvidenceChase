import { z } from 'zod';
import { FILE_LIMITS } from '../constants';
import { optionalText } from './common';

const MAX_FILE_MB = FILE_LIMITS.maxFileBytes / 1024 / 1024;

export const uploadBatchItemSchema = z.object({
  name: z.string().trim().min(1, 'File name is required').max(255, 'File name is too long'),
  size: z
    .number()
    .int()
    .positive('File must not be empty')
    .max(FILE_LIMITS.maxFileBytes, `Files must be ${MAX_FILE_MB} MB or smaller`),
  type: z.string().min(1, 'File type is required').max(255),
});
export type UploadBatchItem = z.infer<typeof uploadBatchItemSchema>;

export const prepareUploadsSchema = z.object({
  files: z
    .array(uploadBatchItemSchema)
    .min(1, 'Choose at least one file')
    .max(
      FILE_LIMITS.maxFilesPerSubmission,
      `Upload at most ${FILE_LIMITS.maxFilesPerSubmission} files at a time`,
    ),
});
export type PrepareUploadsInput = z.infer<typeof prepareUploadsSchema>;

export const submitEvidenceSchema = z.object({
  fileIds: z
    .array(z.string().uuid())
    .min(1, 'Add at least one file')
    .max(
      FILE_LIMITS.maxFilesPerSubmission,
      `Submit at most ${FILE_LIMITS.maxFilesPerSubmission} files at a time`,
    )
    .refine((ids) => new Set(ids).size === ids.length, 'Each file can only be submitted once'),
  note: optionalText(2000),
  /** The request version the owner saw, for optimistic locking. */
  version: z.number().int().min(0),
});
export type SubmitEvidenceInput = z.input<typeof submitEvidenceSchema>;
export type SubmitEvidenceData = z.output<typeof submitEvidenceSchema>;

export const REVIEW_ACTIONS = ['ACCEPT', 'REQUEST_CHANGES', 'REOPEN'] as const;
export type ReviewAction = (typeof REVIEW_ACTIONS)[number];

export const reviewRequestSchema = z.object({
  action: z.enum(REVIEW_ACTIONS),
  comment: optionalText(2000),
  /** The request version the manager saw, for optimistic locking. */
  version: z.number().int().min(0),
});
export type ReviewRequestInput = z.input<typeof reviewRequestSchema>;
