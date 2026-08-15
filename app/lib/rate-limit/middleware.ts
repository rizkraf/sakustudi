import type { IncomingHttpHeaders } from "node:http";
import type { NextFunction, Request, Response } from "express";

import { consumeRateLimit } from "./rate-limiter";
import { matchRateLimitRule } from "./rules";

export const isRateLimitEnabled = process.env.RATE_LIMIT_ENABLED !== "false";

type HeaderShape = {
  headers: IncomingHttpHeaders;
  socket?: { remoteAddress?: string };
};

/** First hop of X-Forwarded-For (set by the proxy), else the socket address. */
export function clientIpFrom(req: HeaderShape): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim() !== "") {
    return forwarded.split(",")[0]!.trim();
  }
  return req.socket?.remoteAddress ?? "unknown";
}

/**
 * Express middleware protecting auth routes by client IP. Runs before the
 * React Router handler; blocked requests get a raw 429 + Retry-After. Fails
 * open on Redis errors and when disabled.
 */
export async function rateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!isRateLimitEnabled) {
    next();
    return;
  }
  try {
    const rule = matchRateLimitRule(req.method, req.path);
    if (!rule) {
      next();
      return;
    }
    const result = await consumeRateLimit(
      `${rule.keyPrefix}:${clientIpFrom(req)}`,
      rule.windowMs,
      rule.limit,
    );
    if (result.allowed) {
      next();
      return;
    }
    res.status(429).set("Retry-After", String(result.retryAfterSeconds));
    if (req.path.startsWith("/api/")) {
      res.type("application/json").json({
        error: "Too many requests. Try again later.",
        retryAfterSeconds: result.retryAfterSeconds,
      });
    } else {
      res.type("text/plain").send("Too many requests. Try again later.");
    }
    console.warn(`rate-limit: blocked ${req.method} ${req.path} from ${clientIpFrom(req)}`);
  } catch (error) {
    console.warn("rate-limit: middleware error, failing open", error);
    next();
  }
}
