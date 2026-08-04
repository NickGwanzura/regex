"use client";

import { useCallback, useEffect, useState } from "react";

import {
  CrmLayout,
  CrmPageHead,
  Empty,
  ErrorBanner,
  Modal,
  Panel,
} from "@/components/crm-ui";
import { AddExpense } from "@/components/expense-form";
import { RequireAdmin } from "@/components/require-auth";
import {
  CURRENCIES,
  EXPENSE_CATEGORIES,
  date,
  get,
  money,
  remove,
  type Currency,
  type Expense,
} from "@/lib/crm-api";

export default function ExpensesPage() {
  return (
    <RequireAdmin>
      <Expenses />
    </RequireAdmin>
  );
}

function Expenses() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [category, setCategory] = useState("");
  const [currency, setCurrency] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await get<{ expenses: Expense[] }>("/api/crm/expenses");
      const filtered = data.expenses.filter((e) =>
        (!category || e.category === category) &&
        (!currency || e.currency === currency),
      );
      setExpenses(filtered);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load expenses");
    } finally {
      setLoading(false);
    }
  }, [category, currency]);

  useEffect(() => {
    load();
  }, [load]);

  const totals = CURRENCIES.reduce(
    (acc, c) => {
      acc[c] = expenses
        .filter((e) => e.currency === c)
        .reduce((s, e) => s + e.amount, 0);
      return acc;
    },
    {} as Record<Currency, number>,
  );

  async function del(ex: Expense) {
    if (!window.confirm(`Delete expense “${ex.description}”?`)) return;
    try {
      await remove(`/api/crm/expenses/${ex.id}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete expense");
    }
  }

  return (
    <CrmLayout>
      <CrmPageHead
        eyebrow="Operations"
        title="Expenses"
        lede="Track project costs in both USD and ZWL ledgers."
      />
      <section className="section crmSection">
        <div className="wrap">
          <ErrorBanner message={error} />

          <div className="crmLedgerGrid">
            {CURRENCIES.map((c) => (
              <div className="crmLedger" key={c}>
                <div className="crmLedgerHead">
                  <span className="crmAvatar">{c}</span>
                  <h3>{c} spend</h3>
                  <span className="crmExpenseTotal">{money(totals[c], c)}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="crmToolbar" style={{ marginTop: 26 }}>
            <div className="crmFilters" role="group" aria-label="Filter by category">
              {["", ...EXPENSE_CATEGORIES].map((cat) => (
                <button
                  aria-pressed={category === cat}
                  className={`filterBtn${category === cat ? " on" : ""}`}
                  key={cat || "all"}
                  onClick={() => setCategory(cat)}
                  type="button"
                >
                  {cat ? cat.charAt(0).toUpperCase() + cat.slice(1) : "All"}
                </button>
              ))}
            </div>
            <div className="crmFilters" role="group" aria-label="Filter by currency">
              {["", ...CURRENCIES].map((c) => (
                <button
                  aria-pressed={currency === c}
                  className={`filterBtn${currency === c ? " on" : ""}`}
                  key={c || "both"}
                  onClick={() => setCurrency(c)}
                  type="button"
                >
                  {c || "Both"}
                </button>
              ))}
            </div>
            <button className="btn small crmToolbarCta" onClick={() => setShowNew(true)} type="button">
              Add expense
            </button>
          </div>

          <Panel
            action={loading ? <span className="crmSpinner">Loading…</span> : undefined}
            title={`${expenses.length} expense${expenses.length === 1 ? "" : "s"}`}
          >
            {!loading && expenses.length === 0 ? (
              <Empty message="No expenses match. Adjust filters or add one." />
            ) : null}
            <div className="crmTableWrap">
              <table className="crmTable">
                <thead>
                  <tr>
                    <th>Description</th>
                    <th>Category</th>
                    <th>Client</th>
                    <th>Date</th>
                    <th className="crmNum">Amount</th>
                    <th aria-label="Delete" />
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((ex) => (
                    <tr className="crmRow" key={ex.id}>
                      <td>
                        <span className="crmCellMain">
                          <b>{ex.description}</b>
                          <small>{ex.notes || "—"}</small>
                        </span>
                      </td>
                      <td>{ex.category.charAt(0).toUpperCase() + ex.category.slice(1)}</td>
                      <td className="crmDim">{ex.clientName || "—"}</td>
                      <td className="crmDim">{date(ex.date)}</td>
                      <td className="crmNum">{money(ex.amount, ex.currency)}</td>
                      <td>
                        <button
                          aria-label={`Delete ${ex.description}`}
                          className="crmIconBtn"
                          onClick={() => del(ex)}
                          type="button"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      </section>

      {showNew && (
        <Modal onClose={() => setShowNew(false)} title="Add expense">
          <AddExpense
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

