import { afterEach, describe, expect, it, vi } from "vitest";

import { loader as readinessLoader } from "~/routes/healthz.ready";

vi.mock("~/modules/monitoring/health", () => ({
  checkReadiness: vi.fn(),
}));

import { checkReadiness } from "~/modules/monitoring/health";

const mockedReadiness = vi.mocked(checkReadiness);

afterEach(() => {
  vi.clearAllMocks();
});

describe("healthz/ready loader", () => {
  it("returns 503 with a minimal down report when the readiness check throws", async () => {
    mockedReadiness.mockRejectedValue(new Error("redis gone"));
    const response = await readinessLoader();
    expect(response.status).toBe(503);
    const body = (await response.json()) as { status: string };
    expect(body.status).toBe("down");
  });

  it("maps a down report to 503 and ok/degraded to 200", async () => {
    mockedReadiness.mockResolvedValue({
      status: "degraded",
      checks: {
        db: { ok: true },
        redis: { ok: true },
        worker: { running: false, lastSeenAt: null, ageSeconds: null },
      },
      queues: [],
      checkedAt: "2026-08-15T00:00:00.000Z",
    } as never);
    const response = await readinessLoader();
    expect(response.status).toBe(200);
  });
});
