import "server-only";

import { Resend } from "resend";

import type { CrmLead, Invite } from "@/lib/db/schema";

const MAIL_FROM =
  process.env.MAIL_FROM || "RegEx Collective <hello@theregexcollective.com>";
const TEAM_EMAIL =
  process.env.TEAM_EMAIL || "hello@theregexcollective.com";
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || process.env.BETTER_AUTH_URL || "";

/** Lazily build the Resend client so importing this module never throws. */
function resendClient(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Best-effort email delivery. Missing/invalid RESEND_API_KEY or a Resend
 * failure is logged, never thrown — losing an enquiry because email is down
 * is worse than sending it late.
 */
export async function sendEmail(input: SendEmailInput): Promise<boolean> {
  const client = resendClient();
  if (!client) {
    console.warn(
      `[mail] RESEND_API_KEY not set; skipping "${input.subject}" to ${input.to}`,
    );
    return false;
  }
  try {
    const { error } = await client.emails.send({
      from: MAIL_FROM,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
    if (error) {
      console.error("[mail] delivery failed:", error);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[mail] send error:", e);
    return false;
  }
}

function layout(bodyHtml: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f2ec;font-family:Georgia,'Times New Roman',serif;color:#1c1c1c;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f2ec;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;">
          <tr><td style="background:#101418;padding:20px 28px;color:#f4f2ec;font-size:15px;letter-spacing:0.08em;text-transform:uppercase;">RegEx Collective</td></tr>
          <tr><td style="padding:28px;">${bodyHtml}</td></tr>
          <tr><td style="padding:16px 28px;border-top:1px solid #e5e2d8;font-size:12px;color:#6b6b6b;">${SITE_URL || "RegEx Collective"} &middot; Network infrastructure, security and managed support.</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

/** New website enquiry notification, sent to the team. */
export async function sendLeadNotification(
  lead: Pick<
    CrmLead,
    "name" | "email" | "company" | "projectType" | "details" | "source"
  >,
): Promise<boolean> {
  const rows = [
    ["Name", lead.name],
    ["Email", lead.email],
    ["Company", lead.company || "—"],
    ["Project type", lead.projectType || "—"],
    ["Source", lead.source || "website"],
    ["Details", lead.details || "—"],
  ]
    .map(
      ([k, v]) =>
        `<tr><td style="padding:8px 12px;background:#faf8f2;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;color:#6b6b6b;white-space:nowrap;">${escapeHtml(k)}</td><td style="padding:8px 12px;font-size:14px;">${escapeHtml(v)}</td></tr>`,
    )
    .join("");

  return sendEmail({
    to: TEAM_EMAIL,
    subject: `New enquiry: ${lead.name}`,
    html: layout(
      `<h1 style="font-size:20px;margin:0 0 4px;">New website enquiry</h1>
       <p style="margin:0 0 20px;color:#6b6b6b;font-size:14px;">A contact form submission landed in the CRM leads queue.</p>
       <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e2d8;border-radius:8px;border-collapse:separate;">${rows}</table>
       <p style="margin:20px 0 0;font-size:13px;color:#6b6b6b;">Reply to the enquirer directly at <a href="mailto:${escapeHtml(lead.email)}" style="color:#0f6b4f;">${escapeHtml(lead.email)}</a>.</p>`,
    ),
    text: `New website enquiry from ${lead.name} (${lead.email}).\nCompany: ${lead.company || "—"}\nProject type: ${lead.projectType || "—"}\nDetails: ${lead.details || "—"}\n\nReply to: ${lead.email}`,
  });
}

/** Invite email with a signup link that carries the invite token. */
export async function sendInviteEmail(
  invite: Invite,
): Promise<boolean> {
  const base = SITE_URL || "http://localhost:3000";
  const signupUrl = `${base}/signup?token=${encodeURIComponent(invite.token)}`;
  const expires = invite.expiresAt.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return sendEmail({
    to: invite.email,
    subject: "You've been invited to the RegEx Collective portal",
    html: layout(
      `<h1 style="font-size:20px;margin:0 0 4px;">Welcome to the portal</h1>
       <p style="margin:0 0 20px;font-size:14px;color:#3a3a3a;">You've been invited to create an account for the RegEx Collective client portal. This invitation expires on <strong>${escapeHtml(expires)}</strong>.</p>
       <p style="margin:0 0 24px;"><a href="${escapeHtml(signupUrl)}" style="display:inline-block;background:#0f6b4f;color:#ffffff;padding:12px 22px;border-radius:8px;text-decoration:none;font-size:14px;">Accept invitation</a></p>
       <p style="margin:0;font-size:12px;color:#6b6b6b;">If the button does not work, paste this link into your browser:<br/><span style="color:#0f6b4f;">${escapeHtml(signupUrl)}</span></p>`,
    ),
    text: `You've been invited to the RegEx Collective client portal. Create your account here (expires ${expires}):\n${signupUrl}`,
  });
}
