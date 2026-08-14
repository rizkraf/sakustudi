import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomUUID } from "node:crypto";

import type { RequestHandler } from "express";

export const REQUEST_ID_HEADER = "x-request-id";

export type RequestLogContext = {
  requestId: string;
  route: string;
  userId: string | null;
  errorCode: string | null;
};

/**
 * Per-request context propagated through async work (route loaders, actions,
 * middleware) so any layer can attach request metadata for response headers
 * and structured logs without threading a context object everywhere.
 */
const storage = new AsyncLocalStorage<RequestLogContext>();

const EMPTY_CONTEXT: RequestLogContext = {
  requestId: "",
  route: "",
  userId: null,
  errorCode: null,
};

export function getRequestLogContext(): RequestLogContext {
  return storage.getStore() ?? EMPTY_CONTEXT;
}

export function getRequestId(): string {
  return getRequestLogContext().requestId;
}

export function setRequestUserId(userId: string | null): void {
  const context = storage.getStore();
  if (context) context.userId = userId;
}

export function setRequestErrorCode(errorCode: string | null): void {
  const context = storage.getStore();
  if (context) context.errorCode = errorCode;
}

export function runWithRequestContext<T>(
  context: { requestId: string; route: string },
  fn: () => T,
): T {
  return storage.run({ ...EMPTY_CONTEXT, ...context }, fn);
}

// Restrict accepted request IDs to a log/header-safe charset; anything else
// (including CR/LF injection attempts) is replaced with a generated ID.
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;

export function getOrCreateRequestId(inboundRequestId: string | null): string {
  const existing = inboundRequestId?.trim() ?? "";
  if (existing !== "" && REQUEST_ID_PATTERN.test(existing)) {
    return existing;
  }
  return randomUUID();
}

/**
 * One-way hash of the user ID for logs; the raw user ID is never written to
 * structured logs.
 */
export function hashUserId(userId: string | null | undefined): string | null {
  if (!userId) return null;
  return createHash("sha256").update(userId).digest("hex").slice(0, 16);
}

export type RequestLogEntry = {
  level: "info" | "error";
  requestId: string;
  method: string;
  route: string;
  status: number;
  durationMs: number;
  userIdHash: string | null;
  errorCode: string | null;
};

export function formatRequestLog(entry: RequestLogEntry): string {
  return JSON.stringify(entry);
}

export function logRequestLine(entry: RequestLogEntry): void {
  console.log(formatRequestLog(entry));
}

export function logErrorLine(error: unknown, requestId: string): void {
  const name = error instanceof Error ? error.name : "UnknownError";
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  console.error(
    JSON.stringify({ level: "error", requestId, name, message, stack }),
  );
}

/**
 * Express middleware that assigns/preserves the request ID, exposes it on the
 * response, and emits one structured log line per request on completion.
 */
export const requestIdMiddleware: RequestHandler = (request, response, next) => {
  const requestId = getOrCreateRequestId(
    typeof request.headers[REQUEST_ID_HEADER] === "string"
      ? (request.headers[REQUEST_ID_HEADER] as string)
      : null,
  );
  response.setHeader(REQUEST_ID_HEADER, requestId);
  const startedAt = process.hrtime.bigint();

  runWithRequestContext({ requestId, route: request.path }, () => {
    response.on("finish", () => {
      const durationMs = Number((process.hrtime.bigint() - startedAt) / 1_000_000n);
      const context = getRequestLogContext();
      logRequestLine({
        level: "info",
        requestId,
        method: request.method,
        route: context.route || request.path,
        status: response.statusCode,
        durationMs,
        userIdHash: hashUserId(context.userId),
        errorCode: context.errorCode,
      });
    });
    next();
  });
};
