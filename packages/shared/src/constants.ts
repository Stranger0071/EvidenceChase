/** Name of the manager session cookie. The web app's middleware checks for it before rendering. */
export const SESSION_COOKIE_NAME = 'ec_sid';

export const AUDIT_FRAMEWORKS = [
  'SOC2',
  'ISO27001',
  'HIPAA',
  'PCI_DSS',
  'GDPR',
  'INTERNAL',
  'OTHER',
] as const;
export type AuditFramework = (typeof AUDIT_FRAMEWORKS)[number];

export const FRAMEWORK_LABELS: Record<AuditFramework, string> = {
  SOC2: 'SOC 2',
  ISO27001: 'ISO 27001',
  HIPAA: 'HIPAA',
  PCI_DSS: 'PCI DSS',
  GDPR: 'GDPR',
  INTERNAL: 'Internal audit',
  OTHER: 'Other',
};

export const REQUEST_STATUSES = ['PENDING', 'SUBMITTED', 'CHANGES_REQUESTED', 'ACCEPTED'] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const STATUS_LABELS: Record<RequestStatus, string> = {
  PENDING: 'Pending',
  SUBMITTED: 'Submitted',
  CHANGES_REQUESTED: 'Changes requested',
  ACCEPTED: 'Accepted',
};

/** Upload limits. Enforced in the browser, by the S3 upload policy and again by the API (Phase 3). */
export const FILE_LIMITS = {
  maxFileBytes: 25 * 1024 * 1024,
  maxFilesPerSubmission: 10,
} as const;

/** Allowed evidence file types: extension → accepted MIME types. */
export const ALLOWED_FILE_TYPES: Record<string, readonly string[]> = {
  pdf: ['application/pdf'],
  png: ['image/png'],
  jpg: ['image/jpeg'],
  jpeg: ['image/jpeg'],
  csv: ['text/csv', 'application/vnd.ms-excel'],
  txt: ['text/plain'],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
};

export const CSV_IMPORT_LIMITS = {
  maxRows: 500,
  maxBytes: 1024 * 1024,
} as const;

/** CSV columns for bulk request import, in the order used by the sample file. */
export const CSV_COLUMNS = [
  'controlRef',
  'title',
  'instructions',
  'ownerName',
  'ownerEmail',
  'dueDate',
] as const;
export type CsvColumn = (typeof CSV_COLUMNS)[number];

export const REQUIRED_CSV_COLUMNS: readonly CsvColumn[] = [
  'controlRef',
  'title',
  'ownerEmail',
  'dueDate',
];
