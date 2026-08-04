"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  Chip,
  CrmLayout,
  CrmPageHead,
  Empty,
  ErrorBanner,
  Field,
  Modal,
  Panel,
} from "@/components/crm-ui";
import { RequireAdmin } from "@/components/require-auth";
import {
  CLIENT_STATUSES,
  date,
  get,
  nullable,
  post,
  type Client,
} from "@/lib/crm-api";

export default function ClientsPage() {
  return (
    <RequireAdmin>
      <Clients />
    </RequireAdmin>
  );
}

function Clients() {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (status) params.set("status", status);
      const qs = params.toString();
      const data = await get<{ clients: Client[] }>(
        `/api/crm/clients${qs ? `?${qs}` : ""}`,
      );
      setClients(data.clients);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load clients");
    } finally {
      setLoading(false);
    }
  }, [search, status]);

  useEffect(() => {
    const t = setTimeout(load, search ? 250 : 0);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <CrmLayout>
      <CrmPageHead
        eyebrow="Operations"
        title="Clients"
        lede="Search, filter and manage the accounts behind every installation."
      />
      <section className="section crmSection">
        <div className="wrap">
          <ErrorBanner message={error} />

          <div className="crmToolbar">
            <div className="crmSearch">
              <span aria-hidden="true">⌕</span>
              <input
                aria-label="Search clients"
                placeholder="Search by name or email…"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="crmFilters" role="group" aria-label="Filter by status">
              {["", ...CLIENT_STATUSES].map((s) => (
                <button
                  aria-pressed={status === s}
                  className={`filterBtn${status === s ? " on" : ""}`}
                  key={s || "all"}
                  onClick={() => setStatus(s)}
                  type="button"
                >
                  {s ? s.charAt(0).toUpperCase() + s.slice(1) : "All"}
                </button>
              ))}
            </div>
            <button className="btn small crmToolbarCta" onClick={() => setShowNew(true)} type="button">
              New client
            </button>
          </div>

          <Panel
            action={loading ? <span className="crmSpinner">Loading…</span> : undefined}
            title={`${clients.length} client${clients.length === 1 ? "" : "s"}`}
          >
            {!loading && clients.length === 0 ? (
              <Empty message="No clients match. Try a different search or filter." />
            ) : null}
            <div className="crmTableWrap">
              <table className="crmTable">
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>Status</th>
                    <th>Billing email</th>
                    <th>Created</th>
                    <th aria-label="Open" />
                  </tr>
                </thead>
                <tbody>
                  {clients.map((c) => (
                    <tr
                      className="crmRow"
                      key={c.id}
                      onClick={() => router.push(`/clients/${c.id}`)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          router.push(`/clients/${c.id}`);
                        }
                      }}
                      role="link"
                      tabIndex={0}
                    >
                      <td>
                        <span className="crmCellMain">
                          <b>{c.name}</b>
                          <small>{c.industry || "—"}</small>
                        </span>
                      </td>
                      <td>
                        <Chip value={c.status} />
                      </td>
                      <td className="crmDim">{c.billingEmail || "—"}</td>
                      <td className="crmDim">{date(c.createdAt)}</td>
                      <td className="crmArrow" aria-hidden="true">→</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      </section>

      {showNew && (
        <Modal onClose={() => setShowNew(false)} title="New client">
          <NewClientForm
            onDone={() => {
              setShowNew(false);
              load();
            }}
          />
        </Modal>
      )}
    </CrmLayout>
  );
}

function NewClientForm({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({
    name: "",
    industry: "",
    billingEmail: "",
    billingPhone: "",
    billingAddress: "",
    website: "",
    status: "lead",
    notes: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await post("/api/crm/clients", {
        ...form,
        industry: nullable(form.industry),
        billingEmail: nullable(form.billingEmail),
        billingPhone: nullable(form.billingPhone),
        billingAddress: nullable(form.billingAddress),
        website: nullable(form.website),
        notes: nullable(form.notes),
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create client");
      setSaving(false);
    }
  }

  return (
    <form className="crmForm" onSubmit={submit}>
      <div className="crmGrid">
        <Field label="Name">
          <input required placeholder="Acme Ltd" value={form.name} onChange={set("name")} />
        </Field>
        <Field label="Status">
          <select value={form.status} onChange={set("status")}>
            {CLIENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Industry">
          <input placeholder="Construction" value={form.industry} onChange={set("industry")} />
        </Field>
        <Field label="Website">
          <input placeholder="https://…" value={form.website} onChange={set("website")} />
        </Field>
        <Field label="Billing email">
          <input placeholder="accounts@acme.com" type="email" value={form.billingEmail} onChange={set("billingEmail")} />
        </Field>
        <Field label="Billing phone">
          <input placeholder="+44…" value={form.billingPhone} onChange={set("billingPhone")} />
        </Field>
        <Field label="Billing address">
          <input placeholder="Street, city, postcode" value={form.billingAddress} onChange={set("billingAddress")} />
        </Field>
        <Field label="Notes">
          <textarea placeholder="Anything worth remembering…" value={form.notes} onChange={set("notes")} />
        </Field>
      </div>
      <ErrorBanner message={error} />
      <div className="crmFormActions">
        <button className="btn" disabled={saving} type="submit">
          {saving ? "Creating…" : "Create client"}
        </button>
      </div>
    </form>
  );
}
