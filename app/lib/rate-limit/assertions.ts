import { AppError } from "~/lib/errors/AppError";
import { consumeRateLimit } from "./rate-limiter";

const LOGIN_EMAIL_WINDOW_MS = 600_000;
const LOGIN_EMAIL_LIMIT = 5;
const UPLOAD_WINDOW_MS = 3_600_000;
const UPLOAD_LIMIT = 60;

function loginEmailLimit(): number {
  const raw = process.env.RATE_LIMIT_LOGIN_EMAIL_MAX;
  if (raw === undefined || raw === "") return LOGIN_EMAIL_LIMIT;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : LOGIN_EMAIL_LIMIT;
}

function uploadLimit(): number {
  const raw = process.env.RATE_LIMIT_UPLOAD_MAX;
  if (raw === undefined || raw === "") return UPLOAD_LIMIT;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : UPLOAD_LIMIT;
}

/**
 * Route-action guard for the login form: per-email counter that stops
 * password brute force on a single account even from many IPs.
 */
export async function assertLoginRateLimit(email: string): Promise<void> {
  const result = await consumeRateLimit(
    `auth:login:email:${email.trim().toLowerCase()}`,
    LOGIN_EMAIL_WINDOW_MS,
    loginEmailLimit(),
  );
  if (!result.allowed) {
    throw new AppError("RATE_LIMITED", "Too many sign-in attempts. Try again later.");
  }
}

/** Route-action guard for uploads: per-user upload quota per hour. */
export async function assertUploadRateLimit(userId: string): Promise<void> {
  const result = await consumeRateLimit(
    `upload:user:${userId}`,
    UPLOAD_WINDOW_MS,
    uploadLimit(),
  );
  if (!result.allowed) {
    throw new AppError("RATE_LIMITED", "Too many uploads. Try again later.");
  }
}
