import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const alias = {
  "~": fileURLToPath(new URL("./app", import.meta.url)),
};

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: ["app/**/*.{ts,tsx}", "server/**/*.{ts,tsx}"],
    },
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          environment: "jsdom",
          setupFiles: ["./tests/setup.ts"],
          include: ["tests/unit/**/*.{test,spec}.{ts,tsx}"],
        },
      },
      {
        resolve: { alias },
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.integration.test.ts"],
          // Activity writes now produce outbox/reminder rows; the queue tests
          // assert on global publish state, so files must not race each other.
          fileParallelism: false,
        },
      },
    ],
  },
});
