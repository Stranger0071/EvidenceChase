import { z } from 'zod';
import { isoDateSchema } from '../dates';
import { emailSchema, optionalText } from './common';

export const requestInputSchema = z.object({
  controlRef: z
    .string()
    .trim()
    .min(1, 'Control ID is required')
    .max(40, 'Control ID must be 40 characters or fewer'),
  title: z.string().trim().min(1, 'Title is required').max(200, 'Title is too long'),
  instructions: optionalText(2000),
  ownerName: optionalText(100),
  ownerEmail: emailSchema,
  dueDate: isoDateSchema,
});
export type RequestInput = z.input<typeof requestInputSchema>;
export type RequestData = z.output<typeof requestInputSchema>;

// `.partial()` wraps each field in `.optional()`, so a missing field stays undefined (unchanged)
// instead of running the "blank → null" transform.
export const requestUpdateSchema = requestInputSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Nothing to update');
export type RequestUpdateInput = z.input<typeof requestUpdateSchema>;
export type RequestUpdateData = z.output<typeof requestUpdateSchema>;

/**
 * Who "Send requests" emails. Every audience is limited to requests that still owe evidence:
 * "overdue" and "changes_requested" narrow that to those requests, "selected" to the chosen owners.
 */
export const SEND_AUDIENCES = ['all', 'overdue', 'changes_requested', 'selected'] as const;
export type SendAudience = (typeof SEND_AUDIENCES)[number];

export const sendRequestsSchema = z
  .object({
    audience: z.enum(SEND_AUDIENCES).default('all'),
    ownerEmails: z.array(emailSchema).max(500, 'Too many people selected').default([]),
  })
  .refine((value) => value.audience !== 'selected' || value.ownerEmails.length > 0, {
    message: 'Choose at least one person',
    path: ['ownerEmails'],
  });
export type SendRequestsInput = z.input<typeof sendRequestsSchema>;
export type SendRequestsData = z.output<typeof sendRequestsSchema>;

export const csvImportInputSchema = z.object({
  csv: z.string().min(1, 'The file is empty'),
});
export type CsvImportInput = z.infer<typeof csvImportInputSchema>;
