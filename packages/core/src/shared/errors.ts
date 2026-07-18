/**
 * Domain error hierarchy. The HTTP boundary maps these to generic responses —
 * internal details never reach the client (CLAUDE_SECURITY_RULES §15).
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/**
 * Used both when a resource does not exist AND when the caller lacks
 * permission, so responses do not confirm the existence of other tenants'
 * resources (anti-enumeration, CLAUDE_SECURITY_RULES §7).
 */
export class NotFoundOrForbiddenError extends DomainError {
  readonly code = "NOT_FOUND_OR_FORBIDDEN";

  constructor(message = "Resource not found or access denied") {
    super(message);
  }
}

export class ValidationFailedError extends DomainError {
  readonly code = "VALIDATION_FAILED";
}

export class UnauthenticatedError extends DomainError {
  readonly code = "UNAUTHENTICATED";

  constructor(message = "Authentication required") {
    super(message);
  }
}

/** Invalid state machine transition (PRD §11). Never silently corrected. */
export class InvalidTransitionError extends DomainError {
  readonly code = "INVALID_TRANSITION";

  constructor(
    readonly entity: string,
    readonly from: string,
    readonly to: string,
  ) {
    super(`Invalid ${entity} transition: ${from} -> ${to}`);
  }
}

/** Business-rule conflict (e.g. no inventory available, duplicate use). */
export class ConflictError extends DomainError {
  readonly code = "CONFLICT";
}
