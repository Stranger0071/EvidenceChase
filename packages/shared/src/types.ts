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
