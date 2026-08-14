import { afterEach, describe, expect, it, vi } from "vitest";

import { AppError } from "~/lib/errors/AppError";
import {
  isFieldErrorResponse,
  toActionResponse,
  type FieldErrorResponse,
} from "~/lib/errors/response";
import { requireOwnedUser } from "~/lib/authorization/ownership.server";
import {
  assertCsrfMutation,
  assertTrustedOrigin,
  createCsrfCookie,
  createCsrfToken,
  CSRF_COOKIE_NAME,
  isTrustedOrigin,
  verifyCsrfToken,
} from "~/lib/request/security.server";
import {
  formatRequestLog,
  getOrCreateRequestId,
  getRequestId,
  hashUserId,
  runWithRequestContext,
  setRequestErrorCode,
  setRequestUserId,
} from "~/lib/request/request-id.server";
import { parseForm } from "~/lib/validation/form-data";
import { z } from "zod";

function withRequestId<T>(requestId: string, fn: () => T): T {
  return runWithRequestContext({ requestId, route: "/notes" }, fn);
}

describe("AppError", () => {
  it("carries code, message, and optional field errors", () => {
    const error = new AppError("VALIDATION_FAILED", "Fix fields", {
      fieldErrors: { title: ["Required"] },
    });
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("AppError");
    expect(error.code).toBe("VALIDATION_FAILED");
    expect(error.fieldErrors).toEqual({ title: ["Required"] });
  });

  it("preserves the cause for chained failures", () => {
    const cause = new Error("db down");
    const error = new AppError("DEPENDENCY_UNAVAILABLE", "Unavailable", { cause });
    expect(error.cause).toBe(cause);
  });
});

describe("toActionResponse", () => {
  it("maps every AppError code to its HTTP status", async () => {
    const cases: Array<[AppError, number]> = [
      [new AppError("VALIDATION_FAILED", "fix"), 400],
      [new AppError("UNAUTHENTICATED", "sign in"), 401],
      [new AppError("FORBIDDEN", "no"), 403],
      [new AppError("NOT_FOUND", "missing"), 404],
      [new AppError("CONFLICT", "dupe"), 409],
      [new AppError("LIMIT_EXCEEDED", "cap"), 422],
      [new AppError("RATE_LIMITED", "slow down"), 429],
      [new AppError("DEPENDENCY_UNAVAILABLE", "down"), 503],
    ];
    for (const [error, status] of cases) {
      const response = withRequestId("req-1", () => toActionResponse(error));
      expect(response.status).toBe(status);
      const body = (await response.json()) as
        | FieldErrorResponse
        | { ok: boolean; error?: { code: string } };
      expect(body.ok).toBe(false);
      if (error.code === "VALIDATION_FAILED") {
        expect(isFieldErrorResponse(body)).toBe(true);
      } else {
        expect((body as { error: { code: string } }).error?.code).toBe(error.code);
      }
      expect(response.headers.get("x-request-id")).toBe("req-1");
    }
  });

  it("returns field errors for validation failures", async () => {
    const response = withRequestId("req-2", () =>
      toActionResponse(
        new AppError("VALIDATION_FAILED", "Please fix the highlighted fields.", {
          fieldErrors: { email: ["Invalid email"] },
        }),
      ),
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as FieldErrorResponse;
    expect(body).toEqual({
      ok: false,
      fieldErrors: { email: ["Invalid email"] },
      formErrors: ["Please fix the highlighted fields."],
    });
    expect(isFieldErrorResponse(body)).toBe(true);
  });

  it("passes through a raw FieldErrorResponse", async () => {
    const response = withRequestId("req-3", () =>
      toActionResponse({
        ok: false,
        fieldErrors: { title: ["Too short"] },
        formErrors: [],
      }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      fieldErrors: { title: ["Too short"] },
      formErrors: [],
    });
  });

  it("never leaks internal details of unexpected errors", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    try {
      const response = withRequestId("req-4", () =>
        toActionResponse(new Error("postgres: connection refused secret-detail")),
      );
      expect(response.status).toBe(500);
      const body = (await response.json()) as { error: { code: string; message?: string } };
      expect(body.error.code).toBe("INTERNAL");
      expect(body.error.message).toBeUndefined();
      expect(JSON.stringify(body)).not.toContain("secret-detail");
      expect(response.headers.get("x-request-id")).toBe("req-4");
      expect(consoleError).toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });

  it("stays generic for non-validation failures", async () => {
    const response = toActionResponse(new AppError("NOT_FOUND", "leaky detail"));
    const body = (await response.json()) as { error: { message: string } };
    expect(body.error.message).toBe("Not found.");
  });
});

describe("parseForm", () => {
  const schema = z.object({
    title: z.string().min(3, "Title is too short"),
    count: z.coerce.number().int().min(0, "Count must be non-negative"),
    tags: z.array(z.string()),
  });

  it("returns parsed data on success", () => {
    const formData = new FormData();
    formData.set("title", "Study plan");
    formData.set("count", "3");
    formData.append("tags", "math");
    formData.append("tags", "physics");

    const result = parseForm(schema, formData);
    expect(result).toEqual({ title: "Study plan", count: 3, tags: ["math", "physics"] });
  });

  it("returns a FieldErrorResponse with per-field errors on failure", () => {
    const formData = new FormData();
    formData.set("title", "ab");
    formData.set("count", "-1");

    const result = parseForm(schema, formData);
    expect(isFieldErrorResponse(result)).toBe(true);
    if (isFieldErrorResponse(result)) {
      expect(result.ok).toBe(false);
      expect(result.fieldErrors.title).toEqual(["Title is too short"]);
      expect(result.fieldErrors.count).toEqual(["Count must be non-negative"]);
      expect(result.fieldErrors.tags).toBeDefined();
      expect(result.formErrors).toEqual([]);
    }
  });

  it("returns root-level issues as formErrors", () => {
    const acceptSchema = z
      .object({ accept: z.string() })
      .refine((value) => value.accept === "on", { message: "You must accept." });

    const formData = new FormData();
    formData.set("accept", "");

    const result = parseForm(acceptSchema, formData);
    expect(isFieldErrorResponse(result)).toBe(true);
    if (isFieldErrorResponse(result)) {
      expect(result.fieldErrors).toEqual({});
      expect(result.formErrors).toEqual(["You must accept."]);
    }
  });
});

describe("requireOwnedUser", () => {
  it("passes when the row belongs to the caller", () => {
    expect(() => requireOwnedUser("user-a", { userId: "user-a" })).not.toThrow();
  });

  it("throws generic NOT_FOUND for another user's row", () => {
    try {
      requireOwnedUser("user-a", { userId: "user-b" });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe("NOT_FOUND");
      expect((error as AppError).message).toBe("Not found.");
    }
  });

  it("throws NOT_FOUND for missing or partial rows", () => {
    expect(() => requireOwnedUser("user-a", null)).toThrow(AppError);
    expect(() => requireOwnedUser("user-a", undefined)).toThrow(AppError);
    expect(() => requireOwnedUser("user-a", {})).toThrow(AppError);
    expect(() => requireOwnedUser("user-a", { userId: null })).toThrow(AppError);
  });
});

describe("request IDs and logging context", () => {
  it("preserves a valid inbound x-request-id", () => {
    expect(getOrCreateRequestId("trace-abc-123")).toBe("trace-abc-123");
  });

  it("generates an ID when absent", () => {
    expect(getOrCreateRequestId(null)).toMatch(/^[0-9a-f-]{36}$/);
    expect(getOrCreateRequestId("")).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("replaces unsafe inbound IDs (header injection attempts)", () => {
    expect(getOrCreateRequestId("abc\r\nSet-Cookie: evil=1")).toMatch(
      /^[0-9a-f-]{36}$/,
    );
  });

  it("propagates context and lets middleware attach user and error code", () => {
    const context = runWithRequestContext({ requestId: "req-9", route: "/notes" }, () => {
      setRequestUserId("user-123");
      setRequestErrorCode("CONFLICT");
      return getRequestId();
    });
    expect(context).toBe("req-9");
  });

  it("formats a structured log line with hashed user id and duration", () => {
    const line = formatRequestLog({
      level: "info",
      requestId: "req-10",
      method: "POST",
      route: "/notes",
      status: 201,
      durationMs: 4,
      userIdHash: hashUserId("user-123"),
      errorCode: null,
    });
    const parsed = JSON.parse(line) as Record<string, unknown>;
    expect(parsed.requestId).toBe("req-10");
    expect(parsed.userIdHash).not.toContain("user-123");
    expect(parsed.errorCode).toBeNull();
  });

  it("hashes user ids one-way and deterministically", () => {
    const hash = hashUserId("user-123");
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
    expect(hashUserId("user-123")).toBe(hash);
    expect(hashUserId("user-456")).not.toBe(hash);
    expect(hashUserId(null)).toBeNull();
  });
});

describe("origin and CSRF boundaries", () => {
  const PREV_ORIGINS = process.env.APP_ORIGINS;
  const PREV_BASE_URL = process.env.BETTER_AUTH_URL;

  afterEach(() => {
    if (PREV_ORIGINS === undefined) delete process.env.APP_ORIGINS;
    else process.env.APP_ORIGINS = PREV_ORIGINS;
    if (PREV_BASE_URL === undefined) delete process.env.BETTER_AUTH_URL;
    else process.env.BETTER_AUTH_URL = PREV_BASE_URL;
  });

  it("rejects untrusted origins and accepts trusted or missing origins", () => {
    process.env.APP_ORIGINS = "http://localhost:3000";
    expect(isTrustedOrigin("http://localhost:3000")).toBe(true);
    expect(isTrustedOrigin("https://evil.example")).toBe(false);
    expect(isTrustedOrigin(null)).toBe(true);

    const evil = new Request("http://localhost:3000/notes", {
      method: "POST",
      headers: { Origin: "https://evil.example" },
    });
    expect(() => assertTrustedOrigin(evil)).toThrow(AppError);
  });

  it("round-trips a CSRF token for the right user", () => {
    const token = createCsrfToken("user-a");
    expect(verifyCsrfToken(token, "user-a")).toBe(true);
    expect(verifyCsrfToken(token, "user-b")).toBe(false);
    expect(verifyCsrfToken(token, "user-a", Date.now() + 24 * 60 * 60 * 1000 + 1000)).toBe(
      false,
    );
  });

  it("rejects tampered tokens and malformed input", () => {
    const token = createCsrfToken("user-a");
    const tampered = `${token.slice(0, -2)}zz`;
    expect(verifyCsrfToken(tampered, "user-a")).toBe(false);
    expect(verifyCsrfToken(null, "user-a")).toBe(false);
    expect(verifyCsrfToken("no-dot-here", "user-a")).toBe(false);
    expect(verifyCsrfToken("bad.signature", "user-a")).toBe(false);
  });

  it("builds an http-only lax cookie containing the token", () => {
    const cookie = createCsrfCookie("user-a");
    expect(cookie).toContain(`${CSRF_COOKIE_NAME}=`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    const token = cookie.split(`${CSRF_COOKIE_NAME}=`)[1]!.split(";")[0]!;
    expect(verifyCsrfToken(token, "user-a")).toBe(true);
  });

  it("lets safe methods through without any token", async () => {
    await expect(assertCsrfMutation(new Request("http://localhost/notes"), "user-a")).resolves.toBeUndefined();
  });

  it("accepts a valid mutation from a trusted origin", async () => {
    const token = createCsrfToken("user-a");
    const formData = new FormData();
    formData.set("csrfToken", token);
    const request = new Request("http://localhost/notes", {
      method: "POST",
      headers: {
        Origin: "http://localhost:3000",
        Cookie: `${CSRF_COOKIE_NAME}=${token}`,
      },
      body: formData,
    });
    await expect(assertCsrfMutation(request, "user-a")).resolves.toBeUndefined();
  });

  it("rejects a mutation from an untrusted origin", async () => {
    const token = createCsrfToken("user-a");
    const formData = new FormData();
    formData.set("csrfToken", token);
    const request = new Request("http://localhost/notes", {
      method: "POST",
      headers: {
        Origin: "https://evil.example",
        Cookie: `${CSRF_COOKIE_NAME}=${token}`,
      },
      body: formData,
    });
    await expect(assertCsrfMutation(request, "user-a")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("rejects a mutation with a missing or mismatched cookie", async () => {
    const token = createCsrfToken("user-a");
    const withoutCookie = new Request("http://localhost/notes", {
      method: "POST",
      headers: { Origin: "http://localhost:3000" },
      body: new FormData(),
    });
    await expect(assertCsrfMutation(withoutCookie, "user-a")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    const mismatched = new Request("http://localhost/notes", {
      method: "POST",
      headers: {
        Origin: "http://localhost:3000",
        Cookie: `${CSRF_COOKIE_NAME}=some-other-token`,
      },
      body: (() => {
        const fd = new FormData();
        fd.set("csrfToken", token);
        return fd;
      })(),
    });
    await expect(assertCsrfMutation(mismatched, "user-a")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("rejects a mutation whose signed token is for another user", async () => {
    const token = createCsrfToken("user-b");
    const formData = new FormData();
    formData.set("csrfToken", token);
    const request = new Request("http://localhost/notes", {
      method: "POST",
      headers: {
        Origin: "http://localhost:3000",
        Cookie: `${CSRF_COOKIE_NAME}=${token}`,
      },
      body: formData,
    });
    await expect(assertCsrfMutation(request, "user-a")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("does not consume the request body, so actions can read form data afterwards", async () => {
    const token = createCsrfToken("user-a");
    const formData = new FormData();
    formData.set("csrfToken", token);
    formData.set("title", "Body still intact");
    const request = new Request("http://localhost/notes", {
      method: "POST",
      headers: {
        Origin: "http://localhost:3000",
        Cookie: `${CSRF_COOKIE_NAME}=${token}`,
      },
      body: formData,
    });

    await assertCsrfMutation(request, "user-a");

    const body = await request.formData();
    expect(body.get("csrfToken")).toBe(token);
    expect(body.get("title")).toBe("Body still intact");
  });
});
