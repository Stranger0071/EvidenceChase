import { z } from 'zod';

export const EXPORT_SCOPES = ['accepted', 'all'] as const;
export type ExportScope = (typeof EXPORT_SCOPES)[number];

/** By default the evidence pack holds accepted evidence only; "all" adds anything still in review. */
export const exportLinkSchema = z.object({
  scope: z.enum(EXPORT_SCOPES).default('accepted'),
});
export type ExportLinkInput = z.input<typeof exportLinkSchema>;
