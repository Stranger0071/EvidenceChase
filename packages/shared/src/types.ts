import type { AuditFramework, RequestStatus } from './constants';
import type { CsvRowError } from './csv';

/** JSON shapes returned by the API. Dates are ISO strings; due and audit dates are YYYY-MM-DD. */

export interface UserDto {
  id: string;
  email: string;
  name: string;
}

export interface AuditSummary {
  total: number;
  pending: number;
  submitted: number;
  changesRequested: number;
  accepted: number;
  overdue: number;
  /** Accepted ÷ total, as a whole-number percentage. */
  percentComplete: number;
}

export interface AuditDto {
  id: string;
  name: string;
  framework: AuditFramework;
  auditDate: string | null;
  remindersOn: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  summary: AuditSummary;
}

export interface EvidenceRequestDto {
  id: string;
  auditId: string;
  controlRef: string;
  title: string;
  instructions: string | null;
  ownerName: string | null;
  ownerEmail: string;
  dueDate: string;
  status: RequestStatus;
  isOverdue: boolean;
  hasSubmissions: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CsvImportResultDto {
  imported: number;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/** `details` of a 422 response from the CSV import endpoint. */
export interface CsvImportErrorDetails {
  rows: CsvRowError[];
}

/** `details` of a 422 response for an invalid request body: field name → messages. */
export type FieldErrors = Record<string, string[]>;

export type FileState = 'PENDING_UPLOAD' | 'AWAITING_SCAN' | 'VERIFIED' | 'REJECTED';
export type ScanStatus =
  'NOT_SCANNED' | 'NO_THREATS_FOUND' | 'THREATS_FOUND' | 'UNSUPPORTED' | 'FAILED';

/** File metadata. Storage keys are internal and never leave the API. */
export interface EvidenceFileDto {
  id: string;
  originalName: string;
  sizeBytes: number;
  /** The type found in the file's content (magic bytes), falling back to the declared type. */
  contentType: string;
  state: FileState;
  scanStatus: ScanStatus;
  sha256: string | null;
  retainUntil: string | null;
  rejectReason: string | null;
  createdAt: string;
  verifiedAt: string | null;
  /** True for images and PDFs, which can be shown inline in a sandboxed frame. */
  previewable: boolean;
}

export interface SubmissionDto {
  id: string;
  note: string | null;
  submittedAt: string;
  isCurrent: boolean;
  files: EvidenceFileDto[];
}

/** What a control owner sees through their magic link. */
export interface OwnerPortalDto {
  request: {
    id: string;
    controlRef: string;
    title: string;
    instructions: string | null;
    ownerName: string | null;
    dueDate: string;
    status: RequestStatus;
    isOverdue: boolean;
    version: number;
  };
  auditName: string;
  /** False once evidence is accepted or the audit is archived: the page is then read-only. */
  canSubmit: boolean;
  /** The comment that sent the request back to the owner, while changes are requested. */
  changesComment: string | null;
  currentSubmission: SubmissionDto | null;
}

export interface PreparedUploadDto {
  fileId: string;
  originalName: string;
  /** A presigned S3 POST: send `fields` plus the file as multipart form data to `url`. */
  upload: {
    url: string;
    fields: Record<string, string>;
  };
}

export interface ActivityLogDto {
  id: string;
  actorType: 'MANAGER' | 'OWNER' | 'SYSTEM';
  actorEmail: string | null;
  action: string;
  fromStatus: RequestStatus | null;
  toStatus: RequestStatus | null;
  comment: string | null;
  createdAt: string;
}

export interface FileUrlDto {
  url: string;
  expiresInSeconds: number;
}

export interface MagicLinkDto {
  url: string;
  expiresAt: string;
}

export interface SendRequestsResultDto {
  /** Emails sent: one per owner, listing all of their open requests. */
  emailsSent: number;
  requestsIncluded: number;
  /** Owners whose email couldn't be sent. Their links still work via "Copy link". */
  failedRecipients: string[];
}

/** Progress for one control owner within an audit. */
export interface OwnerProgressDto {
  ownerEmail: string;
  ownerName: string | null;
  total: number;
  accepted: number;
  /** Submitted and waiting for the manager's review. */
  inReview: number;
  /** Still owed by the owner: pending or changes requested. */
  waiting: number;
  overdue: number;
}

export interface OverdueRequestDto {
  id: string;
  controlRef: string;
  title: string;
  ownerEmail: string;
  ownerName: string | null;
  dueDate: string;
  daysOverdue: number;
  status: RequestStatus;
}

/** "Are we ready for the auditor?" (Phase 6). */
export interface AuditDashboardDto {
  summary: AuditSummary;
  /** Files submitted but still waiting for the malware scan. */
  filesScanning: number;
  /** Owners with the most outstanding work first. */
  owners: OwnerProgressDto[];
  /** Most overdue first, at most 10. */
  overdue: OverdueRequestDto[];
}

export interface ExportLinkDto {
  /** Goes straight to the API (not through the web app's proxy), signed and valid for 60 seconds. */
  url: string;
  expiresAt: string;
}
