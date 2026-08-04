// Client-safe helpers for talking to the CRM API.
// This module is imported by client components — never import server-only code here.

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.method && !["GET", "HEAD"].includes(init.method)) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(path, { cache: "no-store", ...init, headers });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      (body as { error?: string } | null)?.error ??
      `Request failed (${res.status})`;
    throw new Error(message);
  }
  return body as T;
}

export const get = <T,>(path: string) => api<T>(path);
export const post = <T,>(path: string, data: unknown) =>
  api<T>(path, { method: "POST", body: JSON.stringify(data) });
export const patch = <T,>(path: string, data: unknown) =>
  api<T>(path, { method: "PATCH", body: JSON.stringify(data) });
export const remove = <T,>(path: string) =>
  api<T>(path, { method: "DELETE" });

/** Normalizes an empty/whitespace string to null so the API stores NULL, not "". */
export const nullable = (v: string | null | undefined): string | null =>
  typeof v === "string" && v.trim() ? v : null;

// ---- Shared API shapes (mirrors the route handlers' JSON) ----

export type Currency = "USD" | "ZWL";
export const CURRENCIES: Currency[] = ["USD", "ZWL"];
export const DEFAULT_CURRENCY: Currency = "USD";

export interface LedgerTotals {
  billed: number;
  collected: number;
  outstanding: number;
  overdue: number;
}

export interface Stats {
  clients: number;
  activeInstallations: number;
  openQuotes: number;
  usd: LedgerTotals;
  zwl: LedgerTotals;
  billedTotal: number;
  collectedTotal: number;
  outstandingTotal: number;
  overdueTotal: number;
  overdueInvoiceCount: number;
  upcomingServiceRecords: number;
}

export type ClientStatus = "lead" | "active" | "inactive";

export interface Client {
  id: string;
  name: string;
  industry: string | null;
  billingEmail: string | null;
  billingPhone: string | null;
  billingAddress: string | null;
  website: string | null;
  status: ClientStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Contact {
  id: string;
  clientId: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  isPrimary: boolean;
  createdAt: string;
}

export interface Installation {
  id: string;
  clientId: string;
  name: string;
  serviceType: string;
  engagementModel: string;
  status: string;
  siteAddress: string | null;
  startDate: string | null;
  endDate: string | null;
  value: number;
  currency: Currency;
  notes: string | null;
  createdAt: string;
}

export interface Quote {
  id: string;
  number: string;
  clientId: string;
  installationId: string | null;
  title: string | null;
  status: string;
  taxRate: number;
  subtotal: number;
  tax: number;
  total: number;
  currency: Currency;
  validUntil: string | null;
  notes: string | null;
  clientName?: string;
  createdAt: string;
}

export interface Invoice {
  id: string;
  number: string;
  clientId: string;
  installationId: string | null;
  status: string;
  total: number;
  paid: number;
  balance: number;
  currency: Currency;
  issueDate: string;
  dueDate: string | null;
  clientName?: string;
}

export type ExpenseCategory =
  | "hardware"
  | "labour"
  | "software"
  | "travel"
  | "permits"
  | "other";

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  "hardware",
  "labour",
  "software",
  "travel",
  "permits",
  "other",
];

export interface Expense {
  id: string;
  clientId: string;
  installationId: string | null;
  category: ExpenseCategory;
  currency: Currency;
  amount: number;
  date: string;
  description: string;
  notes: string | null;
  createdAt: string;
  clientName?: string;
}

export const CLIENT_STATUSES: ClientStatus[] = ["lead", "active", "inactive"];
export const SERVICE_TYPES = [
  "wireless_rf",
  "structured_cabling",
  "firewall_security",
  "managed_support",
  "vpn",
];
export const ENGAGEMENT_MODELS = ["build", "repair", "operate"];
export const INSTALLATION_STATUSES = [
  "lead",
  "planned",
  "in_progress",
  "on_hold",
  "completed",
  "cancelled",
];

// ---- Formatting helpers ----

export const money = (n: number, currency: Currency = "USD") =>
  new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
  }).format(n);

export const date = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";

const OVERRIDES: Record<string, string> = {
  wireless_rf: "Wireless & RF",
  structured_cabling: "Structured cabling",
  firewall_security: "Firewall & security",
  managed_support: "Managed support",
  vpn: "VPN",
  hardware: "Hardware",
  labour: "Labour",
  software: "Software",
  travel: "Travel",
  permits: "Permits",
  in_progress: "In progress",
  on_hold: "On hold",
  bank_transfer: "Bank transfer",
  monthly_support: "Monthly support",
  health_check: "Health check",
  site_visit: "Site visit",
  remote_support: "Remote support",
};

export function label(value: string): string {
  if (OVERRIDES[value]) return OVERRIDES[value];
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export type ChipTone = "green" | "amber" | "blue" | "red" | "gray";

export function chipTone(value: string): ChipTone {
  switch (value) {
    case "active":
    case "accepted":
    case "paid":
    case "completed":
    case "in_progress":
      return "green";
    case "lead":
    case "draft":
    case "partial":
    case "scheduled":
    case "planned":
    case "on_hold":
      return "amber";
    case "sent":
      return "blue";
    case "overdue":
    case "declined":
    case "expired":
    case "void":
    case "cancelled":
      return "red";
    default:
      return "gray";
  }
}
