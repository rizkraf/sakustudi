import { describe, expect, it } from "vitest";

import { buildRules, matchRateLimitRule } from "~/lib/rate-limit/rules";

describe("buildRules", () => {
  it("applies env overrides, defaulting on missing or invalid values", () => {
    const rules = buildRules({
      RATE_LIMIT_LOGIN_IP_MAX: "7",
      RATE_LIMIT_UPLOAD_MAX: "0",
      RATE_LIMIT_REGISTER_IP_MAX: "not-a-number",
      RATE_LIMIT_API_IP_MAX: "",
    } as NodeJS.ProcessEnv);

    expect(rules.get("POST /login")?.limit).toBe(7);
    expect(rules.get("POST /register")?.limit).toBe(5);
    expect(rules.get("* /api/auth/")?.limit).toBe(60);
  });
});

describe("matchRateLimitRule", () => {
  const rules = buildRules();

  it("matches exact POST routes", () => {
    expect(matchRateLimitRule("POST", "/login", rules)).toMatchObject({
      keyPrefix: "auth:login:ip",
      windowMs: 600_000,
      limit: 20,
    });
    expect(matchRateLimitRule("POST", "/register", rules)).toMatchObject({
      keyPrefix: "auth:register:ip",
    });
    expect(matchRateLimitRule("POST", "/forgot-password", rules)).toMatchObject({
      keyPrefix: "auth:forgot:ip",
    });
  });

  it("matches reset-password by prefix", () => {
    expect(matchRateLimitRule("POST", "/reset-password/abc123", rules)).toMatchObject({
      keyPrefix: "auth:reset:ip",
    });
  });

  it("matches any method on /api/auth prefix", () => {
    expect(matchRateLimitRule("GET", "/api/auth/get-session", rules)).toMatchObject({
      keyPrefix: "auth:api:ip",
    });
    expect(matchRateLimitRule("POST", "/api/auth/sign-in/email", rules)).toMatchObject({
      keyPrefix: "auth:api:ip",
    });
  });

  it("is case-insensitive for method", () => {
    expect(matchRateLimitRule("post", "/login", rules)).toMatchObject({
      keyPrefix: "auth:login:ip",
    });
  });

  it("returns null for unprotected routes and non-POST exact routes", () => {
    expect(matchRateLimitRule("GET", "/login", rules)).toBeNull();
    expect(matchRateLimitRule("POST", "/dashboard", rules)).toBeNull();
    expect(matchRateLimitRule("POST", "/api/auth/anything", rules)).not.toBeNull();
  });
});
