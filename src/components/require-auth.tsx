"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { authClient } from "@/lib/auth-client";

/**
 * Client-side guard for the admin CRM. Redirects visitors to /login and
 * non-admin accounts back to the marketing site. The role lives on the user
 * row as an additional field; the client session type does not model it, so
 * we read it with a narrow cast.
 */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();

  const role = (session?.user as { role?: string } | undefined)?.role;
  const allowed = !!session?.user && role === "admin";

  useEffect(() => {
    if (isPending) return;
    if (!session?.user) router.replace("/login");
    else if (role !== "admin") router.replace("/");
  }, [isPending, session, role, router]);

  if (isPending || !allowed) {
    return (
      <section className="crmAccess">
        <div className="wrap">
          <p className="eyebrow">Client portal</p>
          <h1>Checking access…</h1>
          <p className="lede">
            Verifying your session before loading the workspace.
          </p>
        </div>
      </section>
    );
  }

  return <>{children}</>;
}
