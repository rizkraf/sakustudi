import { describe, expect, it } from "vitest";

import { loader } from "../../app/routes/healthz";

describe("healthz route", () => {
  it("returns a 200 ok response", async () => {
    const response = await loader();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });
});
