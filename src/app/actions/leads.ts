"use server";

import { headers } from "next/headers";

import { db } from "@/lib/db";
import { crmLeads } from "@/lib/db/schema";
import { sendLeadNotification } from "@/lib/mail";

export type LeadActionResult =
  | { ok: true }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Spam defence (Phase 2 of PLAN.md):
//  1. Honeypot field — bots fill hidden fields humans never see.
//  2. IP rate limit — sliding window per instance. Dokploy runs a single
//     container, so an in-memory map is fine; swap for Redis/DB if scaling out.
//  3. Cloudflare Turnstile — enforced only when RESEND-style keys are set.
// ---------------------------------------------------------------------------

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const RATE_LIMIT_MAX = 3; // submissions per window per IP
const hits = new Map<string, number[]>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter(
    (t) => now - t < RATE_LIMIT_WINDOW_MS,
  );
  if (recent.length >= RATE_LIMIT_MAX) {
    hits.set(ip, recent);
    return false;
  }
  recent.push(now);
  hits.set(ip, recent);
  // Opportunistic sweep keeps the map bounded as unique IPs accumulate.
  if (hits.size > 10_000) {
    for (const [key, times] of hits) {
      const live = times.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
      if (live.length === 0) hits.delete(key);
      else hits.set(key, live);
    }
  }
  return true;
}

async function verifyTurnstile(token: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  // Enforce only when the deployment is fully configured: the secret AND the
  // site key (which renders the widget). Otherwise accept, so an operator who
  // sets one key without the other doesn't silently block every submission.
  if (!secret || !process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) return true;
  if (!token) return false;
  if (!token) return false;
  try {
    const res = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ secret, response: token }),
      },
    );
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch (e) {
    console.error("[leads] turnstile verify error:", e);
    return false;
  }
}

async function clientIp(): Promise<string> {
  // Set by the reverse proxy (Traefik on Dokploy, Vercel, etc.).
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return h.get("x-real-ip")?.trim() || "unknown";
}

/**
 * Contact-form submission: validates, writes a lead row and emails the team.
 * The action returns a plain object so the form can render a friendly message
 * without throwing across the client boundary. `_prev` is the useActionState
 * accumulator (unused — the form has no dependent state).
 */
export async function submitLead(
  _prev: LeadActionResult,
  formData: FormData,
): Promise<LeadActionResult> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const company = String(formData.get("company") ?? "").trim();
  const projectType = String(formData.get("projectType") ?? "").trim();
  const details = String(formData.get("details") ?? "").trim();

  // Honeypot: pretend success so bots learn nothing, but store nothing.
  if (String(formData.get("website") ?? "").trim() !== "") {
    return { ok: true };
  }

  if (!name) return { ok: false, error: "Please tell us your name." };
  if (name.length > 200) {
    return { ok: false, error: "Name is too long." };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Please enter a valid email address." };
  }
  if (company.length > 200 || projectType.length > 200) {
    return { ok: false, error: "One of the fields is too long." };
  }
  if (details.length > 5000) {
    return { ok: false, error: "The project overview is too long." };
  }

  const ip = await clientIp();

  if (!checkRateLimit(ip)) {
    return {
      ok: false,
      error:
        "Too many submissions from this address. Please try again in a few minutes.",
    };
  }

  const turnstileToken = String(formData.get("cf-turnstile-response") ?? "");
  if (!(await verifyTurnstile(turnstileToken))) {
    return {
      ok: false,
      error: "We couldn't verify you're human. Please try again.",
    };
  }

  try {
    const [lead] = await db
      .insert(crmLeads)
      .values({
        name,
        email,
        company: company || null,
        projectType: projectType || null,
        details: details || null,
        source: "website",
        ipAddress: ip,
      })
      .returning();

    // Best-effort: a Resend outage must not swallow the enquiry.
    await sendLeadNotification(lead);
  } catch (e) {
    console.error("[leads] insert failed:", e);
    return {
      ok: false,
      error:
        "Something went wrong. Please email us directly at hello@theregexcollective.com.",
    };
  }

  return { ok: true };
}
