import { readFileSync } from "node:fs";

import { vi } from "vitest";

import { TEST_DB_URL_FILE } from "./global-setup";

// Point the app's db singleton at the test database BEFORE any app module is
// imported (setupFiles run before test-file imports).
process.env.DATABASE_URL = readFileSync(TEST_DB_URL_FILE, "utf8").trim();
process.env.BETTER_AUTH_SECRET = "integration-test-secret";
process.env.BETTER_AUTH_URL = "http://localhost:3000";
process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";

// "server-only" and "next/headers" throw outside a Next request scope. The
// handlers call requireAdmin() -> headers(), so stub headers() to return the
// current request's headers (set by the api() helper).
vi.mock("server-only", () => ({}));

const { requestHeaders } = vi.hoisted(() => ({
  requestHeaders: { value: null as Headers | null },
}));

vi.mock("next/headers", () => ({
  headers: async () => requestHeaders.value ?? new Headers(),
}));

declare global {
  // eslint-disable-next-line no-var
  var __setRequestHeaders: (h: Headers | null) => void;
}

globalThis.__setRequestHeaders = (h: Headers | null) => {
  requestHeaders.value = h;
};

export {};
