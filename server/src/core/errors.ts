// Known errors keep their status and code; the error handler turns them into the
// JSON error shape of SDS 6.5. Feature contracts add rule-specific 409 codes.

export interface ErrorDetail {
  field: string;
  issue: string;
}

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: ErrorDetail[],
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** 400: malformed input, unknown fields, or a reference outside the target record (SDS 6.4). */
export class ValidationError extends AppError {
  constructor(details?: ErrorDetail[], message = "The request is not valid.") {
    super(400, "VALIDATION_FAILED", message, details);
  }
}

/** 401: no valid session. */
export class UnauthenticatedError extends AppError {
  constructor(message = "Please sign in to continue.") {
    super(401, "UNAUTHENTICATED", message);
  }
}

/** 401: wrong sign-in credentials (same message for unknown user and wrong password, FR-01). */
export class InvalidCredentialsError extends AppError {
  constructor(message = "Username or password is incorrect.") {
    super(401, "INVALID_CREDENTIALS", message);
  }
}

/** 403: signed in, but the role may not perform the operation. */
export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to do this.") {
    super(403, "FORBIDDEN", message);
  }
}

/** 404: the record does not exist or is outside the caller's scope (DD-06). */
export class NotFoundError extends AppError {
  constructor(message = "The requested resource was not found.", details?: ErrorDetail[]) {
    super(404, "NOT_FOUND", message, details);
  }
}

/** 409: well-formed input, but a business rule or the current state forbids the action (DD-10). */
export class ConflictError extends AppError {
  constructor(code: string, message: string, details?: ErrorDetail[]) {
    super(409, code, message, details);
  }
}

/** 415: POST or PATCH body is not JSON. */
export class UnsupportedMediaTypeError extends AppError {
  constructor(message = "Request body must be JSON (Content-Type: application/json).") {
    super(415, "UNSUPPORTED_MEDIA_TYPE", message);
  }
}

/** 503: readiness check cannot reach the database. */
export class NotReadyError extends AppError {
  constructor(message = "The service is not ready. The database cannot be reached.") {
    super(503, "NOT_READY", message);
  }
}
