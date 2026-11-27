import { defineConfig } from "@trigger.dev/sdk";

export default defineConfig({
  // Your project ref from Trigger.dev → Project settings (starts with "proj_").
  project: process.env.TRIGGER_PROJECT_REF ?? "proj_set_TRIGGER_PROJECT_REF",
  dirs: ["./src/tasks"],
  maxDuration: 600,
  retries: {
    enabledInDev: false,
    default: { maxAttempts: 3, minTimeoutInMs: 2_000, maxTimeoutInMs: 30_000, factor: 2, randomize: true },
  },
});
