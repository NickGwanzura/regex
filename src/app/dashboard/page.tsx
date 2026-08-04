"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  Chip,
  CrmPageHead,
  Empty,
  ErrorBanner,
  Panel,
  StatCard,
} from "@/components/crm-ui";
import { RequireAdmin } from "@/components/require-auth";
import {
  get,
  money,
  type Client,
  type Invoice,
  type Stats,
} from "@/lib/crm-api";

export default function DashboardPage() {
  return (
    <RequireAdmin>
      <Dashboard />
    </RequireAdmin>
  );
}

function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, c, inv] = await Promise.all([
        get<{ stats: Stats }>("/api/crm/stats"),
        get<{ clients: Client[] }>("/api/crm/clients"),
        get<{ invoices: Invoice[] }>("/api/crm/invoices"),
      ]);
      setStats(s.stats);
      setClients(c.clients.slice(0, 6));
      setInvoices(inv.invoices.slice(0, 6));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <CrmPageHead
        eyebrow="Client portal"
        title="Dashboard"
        lede="A live view of clients, installations and cash flow."
      />
      <section className="section crmSection">
        <div className="wrap">
          <ErrorBanner message={error} />

          {!stats ? (
            <Empty
              message={
                error ? "Couldn't load dashboard data. Refresh to retry." : "Loading dashboard…"
              }
            />
          ) : null}

          {stats && (
            <div className="crmStatGrid">
              <StatCard label="Clients" value={String(stats.clients)} />
              <StatCard
                label="Active installations"
                value={String(stats.activeInstallations)}
              />
              <StatCard label="Open quotes" value={String(stats.openQuotes)} />
              <StatCard label="Billed" value={money(stats.billedTotal)} />
              <StatCard label="Collected" value={money(stats.collectedTotal)} />
              <StatCard
                label="Outstanding"
                value={money(stats.outstandingTotal)}
              />
              <StatCard
                label="Overdue"
                value={money(stats.overdueTotal)}
                note={`${stats.overdueInvoiceCount} invoice${
                  stats.overdueInvoiceCount === 1 ? "" : "s"
                }`}
              />
              <StatCard
                label="Service records"
                value={String(stats.upcomingServiceRecords)}
                note="next 30 days"
              />
            </div>
          )}

          <div className="crmSplit">
            <Panel
              action={
                <Link className="linkArrow" href="/clients">
                  All clients <span>→</span>
                </Link>
              }
              title="Recent clients"
            >
              {!loading && clients.length === 0 ? (
                <Empty message="No clients yet. Add your first one from the Clients page." />
              ) : null}
              <ul className="crmList">
                {clients.map((c) => (
                  <li key={c.id}>
                    <Link className="crmListLink" href={`/clients/${c.id}`}>
                      <span className="crmAvatar">
                        {c.name.slice(0, 2).toUpperCase()}
                      </span>
                      <span className="crmListMain">
                        <b>{c.name}</b>
                        <small>{c.industry || "—"}</small>
                      </span>
                      <Chip value={c.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel title="Latest invoices">
              {!loading && invoices.length === 0 ? (
                <Empty message="No invoices yet." />
              ) : null}
              <ul className="crmList">
                {invoices.map((inv) => (
                  <li className="crmListRow" key={inv.id}>
                    <span className="crmListMain">
                      <b>{inv.number}</b>
                      <small>{inv.clientName}</small>
                    </span>
                    <span className="crmListRight">
                      <Chip value={inv.status} />
                      <em>{money(inv.total)}</em>
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        </div>
      </section>
    </>
  );
}
