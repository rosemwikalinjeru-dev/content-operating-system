import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        resolve: {
          alias: {
            "@": resolve(import.meta.dirname, "apps/web/src"),
            "server-only": resolve(import.meta.dirname, "tests/stubs/empty.ts"),
          },
        },
        test: {
          name: "unit",
          include: ["packages/**/*.test.ts", "apps/web/src/**/*.test.ts", "jobs/src/**/*.test.ts", "evals/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        // Live model evals: run explicitly with `pnpm eval:editorial` (skipped without an API key).
        test: {
          name: "eval",
          include: ["evals/**/*.eval.ts"],
          environment: "node",
        },
      },
      {
        test: {
          name: "db",
          include: ["tests/db/**/*.test.ts"],
          environment: "node",
          globalSetup: ["tests/db/global-setup.ts"],
          testTimeout: 30_000,
          hookTimeout: 60_000,
          fileParallelism: false,
        },
      },
    ],
  },
});
