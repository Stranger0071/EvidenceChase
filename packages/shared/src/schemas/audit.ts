import { z } from 'zod';
import { AUDIT_FRAMEWORKS } from '../constants';
import { isoDateSchema } from '../dates';

/** Optional date from a form: an empty string means "no date". */
const optionalIsoDate = z
  .union([isoDateSchema, z.literal(''), z.null()])
  .optional()
  .transform((value) => (value ? value : null));

export const auditInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120, 'Name is too long'),
  framework: z.enum(AUDIT_FRAMEWORKS, { message: 'Choose a framework' }),
  auditDate: optionalIsoDate,
  remindersOn: z.boolean().default(true),
});
export type AuditInput = z.input<typeof auditInputSchema>;
export type AuditData = z.output<typeof auditInputSchema>;

export const auditUpdateSchema = z
  .object({
    name: auditInputSchema.shape.name,
    framework: auditInputSchema.shape.framework,
    auditDate: optionalIsoDate,
    remindersOn: z.boolean(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Nothing to update');
export type AuditUpdateInput = z.input<typeof auditUpdateSchema>;
export type AuditUpdateData = z.output<typeof auditUpdateSchema>;
