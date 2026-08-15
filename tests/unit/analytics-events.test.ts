import { afterEach, describe, expect, it, vi } from "vitest";

import { assertValidEvent, FORBIDDEN_PROPERTY_KEYS } from "~/modules/analytics/analytics.events";
import { trackEvent } from "~/modules/analytics/analytics.service";
import { insertAnalyticsEvent } from "~/modules/analytics/analytics.repository";

vi.mock("~/modules/analytics/analytics.repository", () => ({
  insertAnalyticsEvent: vi.fn(),
}));

const mockedInsert = vi.mocked(insertAnalyticsEvent);

afterEach(() => {
  vi.clearAllMocks();
});

describe("assertValidEvent", () => {
  it("accepts a known event name with safe properties", () => {
    expect(() =>
      assertValidEvent("activity_created", { type: "assignment" }),
    ).not.toThrow();
  });

  it("rejects an unknown event name", () => {
    expect(() => assertValidEvent("mystery_event", {})).toThrow(/unknown/i);
  });

  it("rejects a forbidden property key", () => {
    expect(() =>
      assertValidEvent("signup_completed", { email: "a@b.test" }),
    ).toThrow(/forbidden/i);
  });

  it("deny list covers PII keys", () => {
    for (const key of ["email", "content", "title", "name", "url", "path", "token", "ip", "password"]) {
      expect(FORBIDDEN_PROPERTY_KEYS).toContain(key);
    }
  });
});

describe("trackEvent", () => {
  it("inserts a valid event", async () => {
    mockedInsert.mockResolvedValue(undefined);
    await trackEvent("user-1", "note_created", {});
    expect(mockedInsert).toHaveBeenCalledWith("user-1", "note_created", {});
  });

  it("does not throw when the insert fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mockedInsert.mockRejectedValue(new Error("db down"));
    await expect(trackEvent("user-1", "note_created")).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("does not insert an invalid event name", async () => {
    await trackEvent("user-1", "bogus");
    expect(mockedInsert).not.toHaveBeenCalled();
  });
});
