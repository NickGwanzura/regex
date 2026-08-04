"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import { AddExpense } from "@/components/expense-form";
import {
  CancelButton,
  Chip,
  CrmLayout,
  Empty,
  ErrorBanner,
  Field,
  Modal,
  Panel,
} from "@/components/crm-ui";
import { RequireAdmin } from "@/components/require-auth";
import {
  CLIENT_STATUSES,
  CURRENCIES,
  ENGAGEMENT_MODELS,
  INSTALLATION_STATUSES,
  SERVICE_TYPES,
  date,
  get,
  money,
  nullable,
  patch,
  post,
  remove,
  type Client,
  type Contact,
  type Expense,
  type Installation,
  type Invoice,
  type Quote,
} from "@/lib/crm-api";

export default function ClientDetailPage() {
  return (
    <RequireAdmin>
      <ClientDetail />
    </RequireAdmin>
  );
}

function ClientDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [client, setClient] = useState<Client | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [installations, setInstallations] = useState<Installation[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [d, q, inv] = await Promise.all([
        get<{
          client: Client;
          contacts: Contact[];
          installations: Installation[];
          expenses: Expense[];
        }>(`/api/crm/clients/${id}`),
        get<{ quotes: Quote[] }>(`/api/crm/quotes?clientId=${id}`),
        get<{ invoices: Invoice[] }>(`/api/crm/invoices?clientId=${id}`),
      ]);
      setClient(d.client);
      setContacts(d.contacts);
      setInstallations(d.installations);
      setExpenses(d.expenses);
      setQuotes(q.quotes);
      setInvoices(inv.invoices);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load client");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDelete() {
    if (!client) return;
    if (!window.confirm(`Delete ${client.name}? This cannot be undone.`)) return;
    try {
      await remove(`/api/crm/clients/${client.id}`);
      router.replace("/clients");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete client");
    }
  }

  if (loading && !client) {
    return (
      <CrmShell>
        <Empty message="Loading client…" />
      </CrmShell>
    );
  }
  if (!client) {
    return (
      <CrmShell>
        <ErrorBanner message={error ?? "Client not found."} />
        <Link className="linkArrow" href="/clients">
          Back to clients <span>→</span>
        </Link>
      </CrmShell>
    );
  }

  const outstandingByCurrency = CURRENCIES.reduce((acc, c) => {
    acc[c] = invoices
      .filter((i) => i.currency === c)
      .reduce((s, i) => s + i.balance, 0);
    return acc;
  }, {} as Record<"USD" | "ZWL", number>);

  const expensesByCurrency = CURRENCIES.reduce((acc, c) => {
    acc[c] = expenses
      .filter((e) => e.currency === c)
      .reduce((s, e) => s + e.amount, 0);
    return acc;
  }, {} as Record<"USD" | "ZWL", number>);

  return (
    <CrmShell>
      <p className="crumbs">
        <Link href="/clients">Clients</Link> <span>/</span> {client.name}
      </p>

      <div className="crmProfile">
        <div className="crmProfileMain">
          <span className="crmAvatar large">{client.name.slice(0, 2).toUpperCase()}</span>
          <div>
            <div className="crmProfileTitle">
              <h1>{client.name}</h1>
              <Chip value={client.status} />
            </div>
            <p className="crmMeta">
              {client.industry || "No industry"}
              {client.website ? (
                <>
                  {" · "}
                  <a href={client.website} rel="noreferrer" target="_blank">
                    {client.website}
                  </a>
                </>
              ) : null}
            </p>
          </div>
        </div>
        <div className="crmProfileActions">
          <button className="btn ghost small" onClick={() => setEditing(true)} type="button">
            Edit
          </button>
          <button className="btn ghost small danger" onClick={handleDelete} type="button">
            Delete
          </button>
        </div>
      </div>

      <ErrorBanner message={error} />

      <div className="crmSplit">
        <div className="crmStack">
          <Panel title="Details">
            <dl className="crmDetails">
              <div>
                <dt>Billing email</dt>
                <dd>{client.billingEmail || "—"}</dd>
              </div>
              <div>
                <dt>Billing phone</dt>
                <dd>{client.billingPhone || "—"}</dd>
              </div>
              <div>
                <dt>Billing address</dt>
                <dd>{client.billingAddress || "—"}</dd>
              </div>
              <div>
                <dt>Client since</dt>
                <dd>{date(client.createdAt)}</dd>
              </div>
              <div>
                <dt>Notes</dt>
                <dd>{client.notes || "—"}</dd>
              </div>
            </dl>
          </Panel>

          <Panel
            action={
              <span className="crmPanelCount">
                {CURRENCIES.map((c) => `${money(outstandingByCurrency[c], c)} ${c}`).join(" · ")} outstanding
              </span>
            }
            title={`Billing · ${invoices.length} invoice${invoices.length === 1 ? "" : "s"}`}
          >
            {invoices.length === 0 ? <Empty message="No invoices yet." /> : null}
            <ul className="crmList">
              {invoices.map((inv) => (
                <li className="crmListRow" key={inv.id}>
                  <span className="crmListMain">
                    <b>{inv.number}</b>
                    <small>{date(inv.dueDate)}</small>
                  </span>
                  <span className="crmListRight">
                    <Chip value={inv.status} />
                    <em>{money(inv.total, inv.currency)} {inv.currency}</em>
                  </span>
                </li>
              ))}
            </ul>
            {quotes.length > 0 ? (
              <details className="crmDetailsMore">
                <summary>
                  {quotes.length} quote{quotes.length === 1 ? "" : "s"}
                </summary>
                <ul className="crmList">
                  {quotes.map((q) => (
                    <li className="crmListRow" key={q.id}>
                      <span className="crmListMain">
                        <b>{q.number}</b>
                        <small>{q.title || "Untitled"}</small>
                      </span>
                      <span className="crmListRight">
                        <Chip value={q.status} />
                        <em>{money(q.total, q.currency)} {q.currency}</em>
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </Panel>

          <Panel
            action={
              <span className="crmPanelCount">{expenses.length} expense{expenses.length === 1 ? "" : "s"}</span>
            }
            title={`Expenses · ${money(expensesByCurrency.USD, "USD")} USD / ${money(expensesByCurrency.ZWL, "ZWL")} ZWL`}
          >
            <ExpensesList clientId={client.id} expenses={expenses} onChanged={load} installations={installations} />
          </Panel>
        </div>

        <div className="crmStack">
          <Panel title={`Contacts · ${contacts.length}`}>
            <ContactsList
              clientId={client.id}
              contacts={contacts}
              onChanged={load}
            />
          </Panel>

          <Panel title={`Installations · ${installations.length}`}>
            <InstallationsList
              clientId={client.id}
              expenses={expenses}
              installations={installations}
              onChanged={load}
            />
          </Panel>
        </div>
      </div>

      {editing && (
        <Modal onClose={() => setEditing(false)} title={`Edit ${client.name}`}>
          <EditClientForm
            client={client}
            onDone={() => {
              setEditing(false);
              load();
            }}
          />
        </Modal>
      )}
    </CrmShell>
  );
}

function CrmShell({ children }: { children: React.ReactNode }) {
  return (
    <CrmLayout>
      <section className="pageHead crmPageHead crmDetail">
        <div className="wrap">
          <div className="crmDetailBody">{children}</div>
        </div>
      </section>
    </CrmLayout>
  );
}

// ---- Contacts ----

function ContactsList({
  clientId,
  contacts,
  onChanged,
}: {
  clientId: string;
  contacts: Contact[];
  onChanged: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    role: "",
    isPrimary: false,
  });

  const set =
    (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({
        ...f,
        [key]:
          key === "isPrimary"
            ? (e.currentTarget as HTMLInputElement).checked
            : e.target.value,
      }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await post("/api/crm/contacts", {
        clientId,
        ...form,
        email: nullable(form.email),
        phone: nullable(form.phone),
        role: nullable(form.role),
      });
      setForm({ name: "", email: "", phone: "", role: "", isPrimary: false });
      setAdding(false);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add contact");
    }
  }

  async function del(contact: Contact) {
    if (!window.confirm(`Remove ${contact.name}?`)) return;
    try {
      await remove(`/api/crm/contacts/${contact.id}`);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove contact");
    }
  }

  return (
    <>
      {contacts.length === 0 ? (
        <Empty message="No contacts yet." />
      ) : (
        <ul className="crmList">
          {contacts.map((c) => (
            <li className="crmListRow" key={c.id}>
              <span className="crmListMain">
                <b>
                  {c.name}
                  {c.isPrimary && <em className="crmTag">Primary</em>}
                </b>
                <small>{[c.role, c.email, c.phone].filter(Boolean).join(" · ") || "—"}</small>
              </span>
              <button
                aria-label={`Remove ${c.name}`}
                className="crmIconBtn"
                onClick={() => del(c)}
                type="button"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="crmInlineForm">
        {adding ? (
          <form className="crmForm compact" onSubmit={submit}>
            <div className="crmGrid two">
              <Field label="Name">
                <input required value={form.name} onChange={set("name")} placeholder="Jane Doe" />
              </Field>
              <Field label="Role">
                <input value={form.role} onChange={set("role")} placeholder="Facilities manager" />
              </Field>
              <Field label="Email">
                <input type="email" value={form.email} onChange={set("email")} placeholder="jane@acme.com" />
              </Field>
              <Field label="Phone">
                <input value={form.phone} onChange={set("phone")} placeholder="+44…" />
              </Field>
            </div>
            <label className="crmCheck">
              <input checked={form.isPrimary} onChange={set("isPrimary")} type="checkbox" />
              Primary contact
            </label>
            <ErrorBanner message={error} />
            <div className="crmFormActions">
              <button className="btn small" type="submit">
                Add contact
              </button>
              <CancelButton onClick={() => setAdding(false)} />
            </div>
          </form>
        ) : (
          <button className="btn ghost small" onClick={() => setAdding(true)} type="button">
            + Add contact
          </button>
        )}
      </div>
    </>
  );
}

// ---- Installations ----

function InstallationsList({
  clientId,
  expenses,
  installations,
  onChanged,
}: {
  clientId: string;
  expenses: Expense[];
  installations: Installation[];
  onChanged: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    name: "",
    serviceType: "wireless_rf",
    engagementModel: "build",
    status: "lead",
    siteAddress: "",
    value: "",
    currency: "USD" as "USD" | "ZWL",
    startDate: "",
    endDate: "",
  });

  const set =
    (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await post("/api/crm/installations", {
        clientId,
        name: form.name,
        serviceType: form.serviceType,
        engagementModel: form.engagementModel,
        status: form.status,
        siteAddress: form.siteAddress || null,
        value: form.value ? Number(form.value) : 0,
        currency: form.currency,
        startDate: form.startDate || null,
        endDate: form.endDate || null,
      });
      setForm({
        name: "",
        serviceType: "wireless_rf",
        engagementModel: "build",
        status: "lead",
        siteAddress: "",
        value: "",
        currency: "USD",
        startDate: "",
        endDate: "",
      });
      setAdding(false);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add installation");
    }
  }

  async function del(installation: Installation) {
    if (!window.confirm(`Delete installation “${installation.name}”?`)) return;
    try {
      await remove(`/api/crm/installations/${installation.id}`);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete installation");
    }
  }

  return (
    <>
      {installations.length === 0 ? (
        <Empty message="No installations yet." />
      ) : (
        <ul className="crmList">
          {installations.map((inst) => (
            <li className="crmListRow" key={inst.id}>
              <span className="crmListMain">
                <b>{inst.name}</b>
                <small>
                  {inst.siteAddress || "No site address"} · {money(inst.value, inst.currency)} {inst.currency}
                </small>
                <MarginLine installation={inst} expenses={expenses} />
              </span>
              <span className="crmListRight">
                <Chip value={inst.status} />
                <button
                  aria-label={`Delete ${inst.name}`}
                  className="crmIconBtn"
                  onClick={() => del(inst)}
                  type="button"
                >
                  ✕
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="crmInlineForm">
        {adding ? (
          <form className="crmForm compact" onSubmit={submit}>
            <div className="crmGrid">
              <Field label="Name">
                <input required value={form.name} onChange={set("name")} placeholder="HQ build — phase 1" />
              </Field>
              <Field label="Service type">
                <select value={form.serviceType} onChange={set("serviceType")}>
                  {SERVICE_TYPES.map((s) => (
                    <option key={s} value={s}>
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Engagement model">
                <select value={form.engagementModel} onChange={set("engagementModel")}>
                  {ENGAGEMENT_MODELS.map((s) => (
                    <option key={s} value={s}>
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Status">
                <select value={form.status} onChange={set("status")}>
                  {INSTALLATION_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Site address">
                <input value={form.siteAddress} onChange={set("siteAddress")} placeholder="Street, city" />
              </Field>
              <Field label="Value">
                <input type="number" min="0" step="0.01" value={form.value} onChange={set("value")} placeholder="0.00" />
              </Field>
              <Field label="Currency">
                <select value={form.currency} onChange={set("currency")}>
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Start date">
                <input type="date" value={form.startDate} onChange={set("startDate")} />
              </Field>
              <Field label="End date">
                <input type="date" value={form.endDate} onChange={set("endDate")} />
              </Field>
            </div>
            <ErrorBanner message={error} />
            <div className="crmFormActions">
              <button className="btn small" type="submit">
                Add installation
              </button>
              <CancelButton onClick={() => setAdding(false)} />
            </div>
          </form>
        ) : (
          <button className="btn ghost small" onClick={() => setAdding(true)} type="button">
            + Add installation
          </button>
        )}
      </div>
    </>
  );
}

// ---- Margin (project revenue vs linked expenses) ----

function MarginLine({
  installation,
  expenses,
}: {
  installation: Installation;
  expenses: Expense[];
}) {
  if (!installation.value) return null;
  const linked = expenses.filter(
    (e) =>
      e.installationId === installation.id &&
      e.currency === installation.currency,
  );
  const spend = linked.reduce((s, e) => s + e.amount, 0);
  const margin = installation.value - spend;
  const tone = margin >= 0 ? "crmMarginPos" : "crmMarginNeg";
  return (
    <span className={`crmMargin ${tone}`}>
      {money(margin, installation.currency)} margin after {linked.length} expense
      {linked.length === 1 ? "" : "s"}
    </span>
  );
}

// ---- Expenses ----

function ExpensesList({
  clientId,
  expenses,
  installations,
  onChanged,
}: {
  clientId: string;
  expenses: Expense[];
  installations: Installation[];
  onChanged: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [presetInstallation, setPresetInstallation] = useState<string | undefined>(undefined);

  async function del(ex: Expense) {
    if (!window.confirm(`Delete expense “${ex.description}”?`)) return;
    try {
      setError(null);
      await remove(`/api/crm/expenses/${ex.id}`);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete expense");
    }
  }

  return (
    <>
      {expenses.length === 0 ? <Empty message="No expenses tracked for this client yet." /> : null}
      <ul className="crmList">
        {expenses.map((ex) => (
          <li className="crmListRow" key={ex.id}>
            <span className="crmListMain">
              <b>{ex.description}</b>
              <small>
                {ex.category.replace("_", " ")}
                {ex.installationId ? " · project expense" : ""}
              </small>
            </span>
            <span className="crmListRight">
              <em>{money(ex.amount, ex.currency)} {ex.currency}</em>
              <button
                aria-label={`Delete ${ex.description}`}
                className="crmIconBtn"
                onClick={() => del(ex)}
                type="button"
              >
                ✕
              </button>
            </span>
          </li>
        ))}
      </ul>
      {installations.length > 0 ? (
        <label className="crmField" style={{ margin: "14px 20px" }}>
          <span>Link to installation (optional)</span>
          <select
            value={presetInstallation ?? ""}
            onChange={(e) => setPresetInstallation(e.target.value || undefined)}
          >
            <option value="">No installation</option>
            {installations.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <div className="crmInlineForm">
        {adding ? (
          <AddExpense
            onDone={() => {
              setAdding(false);
              setPresetInstallation(undefined);
              onChanged();
            }}
            presetClientId={clientId}
            presetInstallationId={presetInstallation}
          />
        ) : (
          <>
            <button className="btn ghost small" onClick={() => setAdding(true)} type="button">
              + Add expense
            </button>
            {error && <span className="crmListRow"><ErrorBanner message={error} /></span>}
          </>
        )}
      </div>
    </>
  );
}

// ---- Edit client ----

function EditClientForm({
  client,
  onDone,
}: {
  client: Client;
  onDone: () => void;
}) {
  const [form, setForm] = useState({
    name: client.name,
    industry: client.industry ?? "",
    billingEmail: client.billingEmail ?? "",
    billingPhone: client.billingPhone ?? "",
    billingAddress: client.billingAddress ?? "",
    website: client.website ?? "",
    status: client.status,
    notes: client.notes ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set =
    (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await patch(`/api/crm/clients/${client.id}`, {
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
      setError(err instanceof Error ? err.message : "Failed to save client");
      setSaving(false);
    }
  }

  return (
    <form className="crmForm" onSubmit={submit}>
      <div className="crmGrid">
        <Field label="Name">
          <input required value={form.name} onChange={set("name")} />
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
          <input value={form.industry} onChange={set("industry")} />
        </Field>
        <Field label="Website">
          <input value={form.website} onChange={set("website")} />
        </Field>
        <Field label="Billing email">
          <input type="email" value={form.billingEmail} onChange={set("billingEmail")} />
        </Field>
        <Field label="Billing phone">
          <input value={form.billingPhone} onChange={set("billingPhone")} />
        </Field>
        <Field label="Billing address">
          <input value={form.billingAddress} onChange={set("billingAddress")} />
        </Field>
        <Field label="Notes">
          <textarea value={form.notes} onChange={set("notes")} />
        </Field>
      </div>
      <ErrorBanner message={error} />
      <div className="crmFormActions">
        <button className="btn" disabled={saving} type="submit">
          {saving ? "Saving…" : "Save changes"}
        </button>
        <CancelButton onClick={onDone} />
      </div>
    </form>
  );
}
