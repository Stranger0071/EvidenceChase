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

export const csvImportInputSchema = z.object({
  csv: z.string().min(1, 'The file is empty'),
});
export type CsvImportInput = z.infer<typeof csvImportInputSchema>;
