import { describe, expect, it, vi, beforeEach } from "vitest";
import type { NextFunction, Request, Response } from "express";

import {
  clientIpFrom,
  rateLimitMiddleware,
  isRateLimitEnabled,
} from "~/lib/rate-limit/middleware";
import { consumeRateLimit } from "~/lib/rate-limit/rate-limiter";

vi.mock("~/lib/rate-limit/rate-limiter", () => ({
  consumeRateLimit: vi.fn(),
}));

const mockedConsume = vi.mocked(consumeRateLimit);

function makeRequest(method: string, path: string, headers: Record<string, string> = {}): Request {
  return {
    method,
    path,
    headers,
    socket: { remoteAddress: "10.0.0.1" },
  } as unknown as Request;
}

function makeResponse() {
  const res = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    status: vi.fn(function (this: typeof res, code: number) {
      this.statusCode = code;
      return this;
    }),
    set: vi.fn(function (this: typeof res, name: string, value: string) {
      this.headers[name] = value;
      return this;
    }),
    json: vi.fn(),
    send: vi.fn(),
    type: vi.fn(function (this: typeof res) {
      return this;
    }),
  };
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("clientIpFrom", () => {
  it("takes the first x-forwarded-for hop", () => {
    const req = makeRequest("POST", "/login", {
      "x-forwarded-for": "203.0.113.5, 10.0.0.1",
    });
    expect(clientIpFrom(req)).toBe("203.0.113.5");
  });

  it("falls back to remoteAddress", () => {
    expect(clientIpFrom(makeRequest("POST", "/login"))).toBe("10.0.0.1");
  });
});

describe("rateLimitMiddleware", () => {
  it("passes through unprotected routes", async () => {
    const next = vi.fn();
    const res = makeResponse();
    await rateLimitMiddleware(
      makeRequest("POST", "/dashboard"),
      res as unknown as Response,
      next as unknown as NextFunction,
    );
    expect(next).toHaveBeenCalled();
    expect(mockedConsume).not.toHaveBeenCalled();
  });

  it("consumes a slot and calls next when allowed", async () => {
    mockedConsume.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
    const next = vi.fn();
    const res = makeResponse();
    await rateLimitMiddleware(
      makeRequest("POST", "/login", { "x-forwarded-for": "198.51.100.9" }),
      res as unknown as Response,
      next as unknown as NextFunction,
    );
    expect(mockedConsume).toHaveBeenCalledWith("auth:login:ip:198.51.100.9", 600_000, 20);
    expect(next).toHaveBeenCalled();
  });

  it("rejects with 429 and Retry-After when blocked", async () => {
    mockedConsume.mockResolvedValue({ allowed: false, retryAfterSeconds: 42 });
    const next = vi.fn();
    const res = makeResponse();
    await rateLimitMiddleware(
      makeRequest("POST", "/login"),
      res as unknown as Response,
      next as unknown as NextFunction,
    );
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.set).toHaveBeenCalledWith("Retry-After", "42");
    expect(res.send).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("never rejects when consumeRateLimit throws", async () => {
    mockedConsume.mockRejectedValue(new Error("redis down"));
    const next = vi.fn();
    const res = makeResponse();
    await expect(
      rateLimitMiddleware(
        makeRequest("POST", "/login"),
        res as unknown as Response,
        next as unknown as NextFunction,
      ),
    ).resolves.toBeUndefined();
    expect(next).toHaveBeenCalled();
  });

  it("is enabled by default", () => {
    expect(isRateLimitEnabled).toBe(true);
  });
});
