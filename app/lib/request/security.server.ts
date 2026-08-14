import { createHmac, timingSafeEqual } from "node:crypto";

import { AppError } from "~/lib/errors/AppError";

export const CSRF_COOKIE_NAME = "sakustudi_csrf";
export const CSRF_FIELD_NAME = "csrfToken";
export const CSRF_HEADER_NAME = "x-csrf-token";

const DEFAULT_BASE_URL = "http://localhost:3000";
const KNOWN_DEV_SECRET = "dev-secret-change-me-before-deploy";
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const CSRF_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const CSRF_SECRET =
  process.env.CSRF_SECRET ??
  process.env.BETTER_AUTH_SECRET ??
  (IS_PRODUCTION ? "" : KNOWN_DEV_SECRET);

// CSRF tokens must never be forgeable: fail fast at boot when running in
// production without a strong secret, independent of the auth boot guard.
if (IS_PRODUCTION && (!CSRF_SECRET || CSRF_SECRET === KNOWN_DEV_SECRET)) {
  throw new Error(
    "CSRF_SECRET must be set to a strong random secret in production. " +
      "Generate one with `openssl rand -base64 32`.",
  );
}

function getCsrfSecret(): string {
  return CSRF_SECRET;
}

/**
 * Configured application origins, used to validate the Origin header on
 * cookie-authenticated mutations (application-level boundary on top of
 * Better Auth's own origin checks for auth endpoints).
 */
export function getAllowedOrigins(): string[] {
  const configured = (process.env.APP_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const baseUrl = process.env.BETTER_AUTH_URL ?? DEFAULT_BASE_URL;
  const origins = new Set(configured.length > 0 ? configured : [baseUrl]);
  return [...origins];
}

export function isTrustedOrigin(origin: string | null): boolean {
  // Browsers always send Origin on cross-site requests and cannot suppress
  // it; a missing Origin (server-to-server, curl, tests) is still protected
  // by the signed CSRF token requirement on mutations.
  if (origin === null) return true;
  return getAllowedOrigins().includes(origin);
}

export function assertTrustedOrigin(request: Request): void {
  if (!isTrustedOrigin(request.headers.get("origin"))) {
    throw new AppError("FORBIDDEN", "Untrusted request origin.");
  }
}

function hmacFor(payload: string): string {
  return createHmac("sha256", getCsrfSecret()).update(payload).digest("base64url");
}

/**
 * Signed per-user CSRF token: base64url(userId:expiresAt) + HMAC. Tying the
 * token to the session user prevents token reuse across accounts.
 */
export function createCsrfToken(userId: string, now = Date.now()): string {
  const expiresAt = now + CSRF_MAX_AGE_MS;
  const payload = Buffer.from(`${userId}:${expiresAt}`, "utf8").toString("base64url");
  return `${payload}.${hmacFor(payload)}`;
}

export function verifyCsrfToken(
  token: string | null | undefined,
  userId: string,
  now = Date.now(),
): boolean {
  if (!token) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;

  const expected = Buffer.from(hmacFor(payload), "utf8");
  const actual = Buffer.from(signature, "utf8");
  if (expected.length !== actual.length) return false;
  if (!timingSafeEqual(expected, actual)) return false;

  const decoded = Buffer.from(payload, "base64url").toString("utf8");
  const separator = decoded.lastIndexOf(":");
  if (separator < 0) return false;
  const tokenUserId = decoded.slice(0, separator);
  const expiresAt = Number(decoded.slice(separator + 1));
  return tokenUserId === userId && Number.isFinite(expiresAt) && expiresAt > now;
}

export function createCsrfCookie(userId: string, now = Date.now()): string {
  const token = createCsrfToken(userId, now);
  const secure =
    process.env.BETTER_AUTH_SECURE_COOKIES === "true" ||
    (process.env.BETTER_AUTH_URL ?? "").startsWith("https://");
  return [
    `${CSRF_COOKIE_NAME}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.floor(CSRF_MAX_AGE_MS / 1000)}`,
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}

function cookieValue(cookieHeader: string | null, name: string): string | null {
  for (const part of (cookieHeader ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}

/**
 * Application-level CSRF boundary for cookie-authenticated mutations: safe
 * methods pass through, mutations must come from a trusted Origin and carry a
 * valid signed token matching the session user in both the cookie and the
 * form field (or header). Throws AppError(FORBIDDEN) otherwise.
 *
 * Body contract for route actions: this check reads the token from a clone
 * of the request, so the caller's request body is NOT consumed. Actions can
 * (and must) call `await request.formData()` afterwards to parse their own
 * form data, in any order:
 *
 *   const user = await requireSessionUser(request);
 *   await assertCsrfMutation(request, user.id);
 *   const parsed = parseForm(schema, await request.formData());
 */
export async function assertCsrfMutation(request: Request, userId: string): Promise<void> {
  const method = request.method.toUpperCase();
  if (SAFE_METHODS.has(method)) return;

  assertTrustedOrigin(request);

  const cookieToken = cookieValue(request.headers.get("cookie"), CSRF_COOKIE_NAME);
  const csrfRequest = request.clone();
  const formData = await csrfRequest.formData();
  const fieldToken =
    formData.get(CSRF_FIELD_NAME) ?? request.headers.get(CSRF_HEADER_NAME);

  if (!cookieToken || typeof fieldToken !== "string" || fieldToken === "") {
    throw new AppError("FORBIDDEN", "Invalid CSRF token.");
  }
  if (cookieToken !== fieldToken) {
    throw new AppError("FORBIDDEN", "Invalid CSRF token.");
  }
  if (!verifyCsrfToken(fieldToken, userId)) {
    throw new AppError("FORBIDDEN", "Invalid CSRF token.");
  }
}
