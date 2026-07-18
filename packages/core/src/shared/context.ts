/**
 * Request context resolved by the boundary (session/auth), NEVER from the
 * request body or params (CLAUDE_SECURITY_RULES §6). Every service use case
 * receives it, and every repository query is scoped by organizationId.
 */
export interface RequestContext {
  readonly organizationId: string;
  readonly userId: string;
  readonly role: string;
  /** End-to-end correlation id (NFR-REL-003). */
  readonly correlationId: string;
}

/** Context for public (buyer) flows — no staff session, still correlated. */
export interface PublicContext {
  readonly correlationId: string;
}
