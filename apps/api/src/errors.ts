/**
 * Typed errors thrown by services and the domain. The error handler maps each one to an HTTP
 * response, so business code never deals with status codes or response shapes directly.
 */
export class DomainError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends DomainError {
  constructor(message = 'Some fields are invalid', details?: unknown, code = 'VALIDATION_FAILED') {
    super(422, code, message, details);
  }
}

export class UnauthorizedError extends DomainError {
  constructor(message = 'Please sign in to continue') {
    super(401, 'UNAUTHORIZED', message);
  }
}

export class ForbiddenError extends DomainError {
  constructor(message = 'You are not allowed to do that') {
    super(403, 'FORBIDDEN', message);
  }
}

export class NotFoundError extends DomainError {
  constructor(resource: string) {
    super(404, 'NOT_FOUND', `${resource} not found`);
  }
}

export class ConflictError extends DomainError {
  constructor(message: string, code = 'CONFLICT', details?: unknown) {
    super(409, code, message, details);
  }
}
