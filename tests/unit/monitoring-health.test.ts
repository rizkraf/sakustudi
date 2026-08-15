import { describe, expect, it } from "vitest";

import { classifyHealthStatus } from "~/modules/monitoring/health";

describe("classifyHealthStatus", () => {
  it("is down when db or redis fails", () => {
    expect(classifyHealthStatus(false, true, true, false)).toBe("down");
    expect(classifyHealthStatus(true, false, true, false)).toBe("down");
  });

  it("is degraded when the worker is stale or failed jobs exist", () => {
    expect(classifyHealthStatus(true, true, false, false)).toBe("degraded");
    expect(classifyHealthStatus(true, true, true, true)).toBe("degraded");
  });

  it("is ok otherwise", () => {
    expect(classifyHealthStatus(true, true, true, false)).toBe("ok");
  });
});
