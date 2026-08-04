"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  Chip,
  CrmLayout,
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
  type Expense,
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
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, c, ex] = await Promise.all([
        get<{ stats: Stats }>("/api/crm/stats"),
        get<{ clients: Client[] }>("/api/crm/clients"),
        get<{ expenses: Expense[] }>("/api/crm/expenses"),
      ]);
      setStats(s.stats);
      setClients(c.clients.slice(0, 6));
      setExpenses(ex.expenses.slice(0, 6));
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
    <CrmLayout>
      <CrmPageHead
        eyebrow="Operations"
        title="Dashboard"
        lede="A live view of clients, installations, cash flow and expenses."
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
            <>
              <div className="crmStatGrid">
                <StatCard label="Clients" value={String(stats.clients)} />
                <StatCard
                  label="Active installations"
                  value={String(stats.activeInstallations)}
                />
                <StatCard label="Open quotes" value={String(stats.openQuotes)} />
                <StatCard
                  label="Service records"
                  value={String(stats.upcomingServiceRecords)}
                  note="next 30 days"
                />
              </div>

              <div className="crmLedgerGrid">
                <LedgerSection
                  currency="USD"
                  overdueCount={stats.overdueInvoiceCount}
                  totals={stats.usd}
                />
                <LedgerSection
                  currency="ZWL"
                  overdueCount={stats.overdueInvoiceCount}
                  totals={stats.zwl}
                />
              </div>
            </>
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

            <Panel
              action={
                <Link className="linkArrow" href="/expenses">
                  All expenses <span>→</span>
                </Link>
              }
              title="Recent expenses"
            >
              {!loading && expenses.length === 0 ? (
                <Empty message="No expenses tracked yet." />
              ) : null}
              <ul className="crmList">
                {expenses.map((ex) => (
                  <li className="crmListRow" key={ex.id}>
                    <span className="crmListMain">
                      <b>{ex.description}</b>
                      <small>{ex.clientName}</small>
                    </span>
                    <span className="crmListRight">
                      <em>{money(ex.amount, ex.currency)}</em>
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        </div>
      </section>
    </CrmLayout>
  );
}

function LedgerSection({
  currency,
  totals,
  overdueCount,
}: {
  currency: "USD" | "ZWL";
  totals: { billed: number; collected: number; outstanding: number; overdue: number };
  overdueCount: number;
}) {
  return (
    <div className="crmLedger">
      <div className="crmLedgerHead">
        <span className="crmAvatar">{currency}</span>
        <h3>{currency} ledger</h3>
      </div>
      <div className="crmLedgerGrid">
        <StatCard label="Billed" value={money(totals.billed, currency)} />
        <StatCard label="Collected" value={money(totals.collected, currency)} />
        <StatCard label="Outstanding" value={money(totals.outstanding, currency)} />
        <StatCard
          label="Overdue"
          value={money(totals.overdue, currency)}
          note={`${overdueCount} invoice${overdueCount === 1 ? "" : "s"}`}
        />
      </div>
    </div>
  );
}
