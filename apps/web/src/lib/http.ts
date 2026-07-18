import "server-only";

import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { DomainError, ValidationFailedError } from "@ingressos/core";

/**
 * Error boundary for every route handler. Domain errors map to generic,
 * user-safe messages; anything unexpected becomes an opaque 500 — stack
 * traces and internals never reach the client (CLAUDE_SECURITY_RULES §15).
 */

export function correlationIdFrom(request: Request): string {
  // Accept only well-formed ids from the edge; anything else is replaced.
  const incoming = request.headers.get("x-correlation-id");
  if (incoming && /^[A-Za-z0-9_-]{8,64}$/.test(incoming)) return incoming;
  return crypto.randomUUID();
}

export function requestMetaFrom(request: Request, correlationId: string) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  return {
    ip: forwardedFor?.split(",")[0]?.trim(),
    userAgent: request.headers.get("user-agent") ?? undefined,
    correlationId,
  };
}

const DOMAIN_ERROR_STATUS: Record<string, { status: number; exposeMessage: boolean }> = {
  UNAUTHENTICATED: { status: 401, exposeMessage: false },
  RATE_LIMITED: { status: 429, exposeMessage: false },
  NOT_FOUND_OR_FORBIDDEN: { status: 404, exposeMessage: false },
  VALIDATION_FAILED: { status: 400, exposeMessage: true },
  CONFLICT: { status: 409, exposeMessage: true },
  INVALID_TRANSITION: { status: 409, exposeMessage: true },
};

const GENERIC_MESSAGES: Record<number, string> = {
  401: "Autenticação necessária.",
  404: "Recurso não encontrado.",
  429: "Muitas tentativas. Tente novamente em alguns minutos.",
  500: "Não foi possível processar a solicitação.",
};

/**
 * instanceof PLUS structural check: bundlers (Turbopack HMR in particular)
 * can duplicate the core module, breaking instanceof across copies. A typed
 * `code` present in our map is authoritative either way.
 */
function asDomainError(error: unknown): { code: string; message: string } | null {
  if (error instanceof DomainError) return error;
  if (error instanceof Error) {
    const code = (error as unknown as { code?: unknown }).code;
    if (typeof code === "string" && code in DOMAIN_ERROR_STATUS) {
      return { code, message: error.message };
    }
  }
  return null;
}

export function errorResponse(error: unknown, correlationId: string): NextResponse {
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: "Dados inválidos.",
        issues: error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
        correlationId,
      },
      { status: 400 },
    );
  }

  const domainError = asDomainError(error);
  if (domainError) {
    const mapping = DOMAIN_ERROR_STATUS[domainError.code] ?? {
      status: 500,
      exposeMessage: false,
    };
    const message = mapping.exposeMessage
      ? domainError.message
      : (GENERIC_MESSAGES[mapping.status] ?? GENERIC_MESSAGES[500]);
    return NextResponse.json(
      { error: message, correlationId },
      { status: mapping.status },
    );
  }

  // Unexpected: log internally with correlation, answer opaquely.
  console.error(`[unhandled] correlationId=${correlationId}`, error);
  return NextResponse.json(
    { error: GENERIC_MESSAGES[500], correlationId },
    { status: 500 },
  );
}

type RouteContext<P> = { params: Promise<P> };

/** Wraps a route handler with correlation id + error mapping. */
export function route<P = Record<string, never>>(
  handler: (
    request: Request,
    helpers: { params: P; correlationId: string },
  ) => Promise<NextResponse>,
) {
  return async (request: Request, context: RouteContext<P>): Promise<NextResponse> => {
    const correlationId = correlationIdFrom(request);
    try {
      const params = await context.params;
      const response = await handler(request, { params, correlationId });
      response.headers.set("x-correlation-id", correlationId);
      return response;
    } catch (error) {
      return errorResponse(error, correlationId);
    }
  };
}

/** Body parser with a hard size cap (CLAUDE_SECURITY_RULES §20 — payload limits). */
export async function readJsonBody(request: Request, maxBytes = 64 * 1024): Promise<unknown> {
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new ValidationFailedError("Payload exceeds the maximum allowed size");
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {};
  }
}
