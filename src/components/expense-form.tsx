"use client";

import { useEffect, useState } from "react";

import { ErrorBanner, Field } from "@/components/crm-ui";
import {
  CURRENCIES,
  EXPENSE_CATEGORIES,
  get,
  nullable,
  post,
  type Currency,
  type ExpenseCategory,
} from "@/lib/crm-api";

/**
 * Reusable "add expense" form. When `presetClientId`/`presetInstallationId` are
 * provided (e.g. from a client detail page) they are locked in; otherwise the
 * user picks a client.
 */
export function AddExpense({
  onDone,
  presetClientId,
  presetInstallationId,
}: {
  onDone: () => void;
  presetClientId?: string;
  presetInstallationId?: string;
}) {
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [form, setForm] = useState({
    clientId: presetClientId ?? "",
    installationId: presetInstallationId ?? "",
    category: "hardware" as ExpenseCategory,
    currency: "USD" as Currency,
    amount: "",
    date: new Date().toISOString().slice(0, 10),
    description: "",
    notes: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!presetClientId) {
      get<{ clients: { id: string; name: string }[] }>("/api/crm/clients").then((d) =>
        setClients(d.clients),
      );
    }
  }, [presetClientId]);

  const set =
    (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await post("/api/crm/expenses", {
        clientId: form.clientId,
        installationId: nullable(form.installationId),
        category: form.category,
        currency: form.currency,
        amount: Number(form.amount),
        date: form.date,
        description: form.description,
        notes: nullable(form.notes),
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add expense");
      setSaving(false);
    }
  }

  return (
    <form className="crmForm" onSubmit={submit}>
      <div className="crmGrid">
        <Field label="Description">
          <input required placeholder="Cabling materials" value={form.description} onChange={set("description")} />
        </Field>
        <Field label="Category">
          <select value={form.category} onChange={set("category")}>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c.charAt(0).toUpperCase() + c.slice(1)}
              </option>
            ))}
          </select>
        </Field>
        {!presetClientId && (
          <Field label="Client">
            <select required value={form.clientId} onChange={set("clientId")}>
              <option value="">Select client…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Currency">
          <select value={form.currency} onChange={set("currency")}>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Amount">
          <input
            required
            min="0"
            step="0.01"
            type="number"
            value={form.amount}
            onChange={set("amount")}
            placeholder="0.00"
          />
        </Field>
        <Field label="Date">
          <input required type="date" value={form.date} onChange={set("date")} />
        </Field>
        <Field label="Notes">
          <textarea value={form.notes} onChange={set("notes")} />
        </Field>
      </div>
      <ErrorBanner message={error} />
      <div className="crmFormActions">
        <button className="btn" disabled={saving} type="submit">
          {saving ? "Saving…" : "Add expense"}
        </button>
        <button className="btn ghost small" onClick={onDone} type="button">
          Cancel
        </button>
      </div>
    </form>
  );
}
