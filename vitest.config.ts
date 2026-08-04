import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: [fileURLToPath(new URL("./tests/global-setup.ts", import.meta.url))],
    setupFiles: [fileURLToPath(new URL("./tests/setup.ts", import.meta.url))],
    // Tests share one Postgres instance and manipulate the same tables.
    fileParallelism: false,
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
});
