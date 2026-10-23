import type { FieldErrors } from '@evidencechase/shared';
import { z, type ZodError, type ZodTypeAny } from 'zod';
import { NotFoundError, ValidationError } from '../errors';

/** Parses untrusted input with a Zod schema, turning failures into a 422 with per-field messages. */
export function parseInput<T extends ZodTypeAny>(schema: T, input: unknown): z.output<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ValidationError('Some fields are invalid', toFieldErrors(result.error));
  }
  return result.data;
}

export function toFieldErrors(error: ZodError): FieldErrors {
  const fields: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_form';
    (fields[key] ??= []).push(issue.message);
  }
  return fields;
}

const uuidSchema = z.string().uuid();

/**
 * Validates an ID from the URL. A malformed ID gets the same 404 as a missing one, so the API
 * never reveals anything about IDs that don't belong to the caller.
 */
export function parseId(value: unknown, resource: string): string {
  const result = uuidSchema.safeParse(value);
  if (!result.success) throw new NotFoundError(resource);
  return result.data;
}
