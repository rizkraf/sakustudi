export type RateLimitRule = {
  keyPrefix: string;
  windowMs: number;
  limit: number;
};

const DEFAULTS: Array<{ key: string; keyPrefix: string; windowMs: number; limit: number }> = [
  { key: "POST /login", keyPrefix: "auth:login:ip", windowMs: 600_000, limit: 20 },
  { key: "POST /register", keyPrefix: "auth:register:ip", windowMs: 3_600_000, limit: 5 },
  { key: "POST /forgot-password", keyPrefix: "auth:forgot:ip", windowMs: 3_600_000, limit: 5 },
  { key: "POST /reset-password/", keyPrefix: "auth:reset:ip", windowMs: 3_600_000, limit: 10 },
  { key: "* /api/auth/", keyPrefix: "auth:api:ip", windowMs: 600_000, limit: 60 },
];

const ENV_OVERRIDES: Record<string, { key: string; envName: string }> = {
  "POST /login": { key: "POST /login", envName: "RATE_LIMIT_LOGIN_IP_MAX" },
  "POST /register": { key: "POST /register", envName: "RATE_LIMIT_REGISTER_IP_MAX" },
  "POST /forgot-password": { key: "POST /forgot-password", envName: "RATE_LIMIT_FORGOT_IP_MAX" },
  "POST /reset-password/": { key: "POST /reset-password/", envName: "RATE_LIMIT_RESET_IP_MAX" },
  "* /api/auth/": { key: "* /api/auth/", envName: "RATE_LIMIT_API_IP_MAX" },
};

function envLimit(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function buildRules(env: NodeJS.ProcessEnv = process.env): Map<string, RateLimitRule> {
  const rules = new Map<string, RateLimitRule>();
  for (const rule of DEFAULTS) {
    const override = ENV_OVERRIDES[rule.key];
    rules.set(rule.key, {
      keyPrefix: rule.keyPrefix,
      windowMs: rule.windowMs,
      limit: override ? envLimit(env, override.envName, rule.limit) : rule.limit,
    });
  }
  return rules;
}

/**
 * Matches a request to its rate-limit rule, or null when the route is not
 * protected. Exact POST routes match first; `/reset-password/<token>` and
 * `/api/auth/*` match by path prefix (reset only for POST, api for any
 * method).
 */
export function matchRateLimitRule(
  method: string,
  pathname: string,
  rules: Map<string, RateLimitRule> = buildRules(),
): RateLimitRule | null {
  const normalized = method.toUpperCase();

  const exact = rules.get(`${normalized} ${pathname}`);
  if (exact) return exact;

  if (normalized === "POST" && pathname.startsWith("/reset-password/")) {
    return rules.get("POST /reset-password/") ?? null;
  }
  if (pathname.startsWith("/api/auth/")) {
    return rules.get("* /api/auth/") ?? null;
  }
  return null;
}
