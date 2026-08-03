"use client";

import { createAuthClient } from "better-auth/react";

// Derive the API origin from the browser's own address bar so the client
// always calls the same origin as the page — both on the live site and in
// local dev. (Fallbacks only used during SSR, where window is undefined.)
export const authClient = createAuthClient({
  baseURL:
    typeof window !== "undefined"
      ? window.location.origin
      : process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
});

export const { signIn, signUp, signOut, useSession } = authClient;
