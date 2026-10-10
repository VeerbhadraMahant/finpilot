"use client";

import { formatCurrency } from "@/lib/format";
import type { DashboardSnapshot } from "@/lib/types";
import type { SpendSummary } from "@/lib/spend";

function Metric({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-xl border border-mist bg-white p-3">
      <p className="text-[11px] uppercase tracking-wide text-pewter">{label}</p>
      <p className="tnum mt-0.5 font-display text-lg font-semibold text-ink">{value}</p>
      {note && <p className="text-[11px] text-graphite">{note}</p>}
    </div>
  );
}

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

/** The dense, numbers-first block for analysts: every ratio and breakdown on one screen, no explanation text. */
export function AnalystPanel({ data, spend }: { data: DashboardSnapshot; spend: SpendSummary }) {
  const { monthly_income: inc, monthly_expenses: out, net_worth: nw } = data;
  const recurring = data.recurring_obligations.reduce((s, r) => s + Math.abs(r.amount), 0);
  const minDebt = data.debts.reduce((s, d) => s + d.minimum_payment, 0);
  const debt = data.debts.reduce((s, d) => s + d.principal, 0);
  const last3 = spend.months.slice(-3);
  const avg3 = last3.length ? last3.reduce((s, m) => s + (m.income > 0 ? m.savings / m.income : 0), 0) / last3.length : 0;
  const total = spend.totalSpend || 1;
  const trend = data.health_score.trend_30d;

  return (
    <section aria-label="Analyst view" className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
        <Metric label="Income / mo" value={formatCurrency(inc)} />
        <Metric label="Spend / mo" value={formatCurrency(out)} note={`${formatCurrency(out / 30)} per day`} />
        <Metric label="Savings rate" value={pct(data.savings_rate)} note={`3-mo avg ${pct(avg3)}`} />
        <Metric label="Net worth" value={formatCurrency(nw)} note={out > 0 ? `${(nw / out).toFixed(1)} months of spend` : undefined} />
        <Metric label="Fixed (recurring)" value={formatCurrency(recurring)} note={inc > 0 ? `${pct(recurring / inc)} of income` : undefined} />
        <Metric label="Debt" value={formatCurrency(debt)} note={`min ${formatCurrency(minDebt)}/mo`} />
        <Metric label="Debt service" value={inc > 0 ? pct(minDebt / inc) : "n/a"} note="min payments / income" />
        <Metric label="Health score" value={`${data.health_score.overall}`} note={trend != null ? `${trend >= 0 ? "+" : ""}${trend} in 30d` : undefined} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="overflow-x-auto rounded-xl border border-mist bg-white">
          <table className="w-full text-xs">
            <caption className="p-3 text-left text-[11px] uppercase tracking-wide text-pewter">Spend by category (latest month vs previous)</caption>
            <thead className="text-pewter">
              <tr>
                <th className="px-3 py-1 text-left font-medium">Category</th>
                <th className="px-3 py-1 text-right font-medium">Amount</th>
                <th className="px-3 py-1 text-right font-medium">Share</th>
                <th className="px-3 py-1 text-right font-medium">vs prev</th>
              </tr>
            </thead>
            <tbody>
              {spend.categories.map((c) => (
                <tr key={c.category} className="border-t border-mist">
                  <td className="px-3 py-1.5 text-ink">
                    <span className="mr-2 inline-block size-2 rounded-full" style={{ background: c.color }} />
                    {c.label}
                  </td>
                  <td className="tnum px-3 py-1.5 text-right">{formatCurrency(c.total)}</td>
                  <td className="tnum px-3 py-1.5 text-right text-graphite">{pct(c.total / total)}</td>
                  <td className={`tnum px-3 py-1.5 text-right ${c.change == null ? "text-pewter" : c.change > 0 ? "text-rose-600" : "text-emerald-700"}`}>
                    {c.change == null ? "new" : `${c.change > 0 ? "+" : ""}${c.change.toFixed(0)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="overflow-x-auto rounded-xl border border-mist bg-white">
          <table className="w-full text-xs">
            <caption className="p-3 text-left text-[11px] uppercase tracking-wide text-pewter">Monthly cash flow</caption>
            <thead className="text-pewter">
              <tr>
                <th className="px-3 py-1 text-left font-medium">Month</th>
                <th className="px-3 py-1 text-right font-medium">Income</th>
                <th className="px-3 py-1 text-right font-medium">Spend</th>
                <th className="px-3 py-1 text-right font-medium">Saved</th>
                <th className="px-3 py-1 text-right font-medium">Rate</th>
              </tr>
            </thead>
            <tbody>
              {[...spend.months].reverse().map((m) => (
                <tr key={m.month} className="border-t border-mist">
                  <td className="px-3 py-1.5 text-ink">{m.month}</td>
                  <td className="tnum px-3 py-1.5 text-right">{formatCurrency(m.income)}</td>
                  <td className="tnum px-3 py-1.5 text-right">{formatCurrency(m.spend)}</td>
                  <td className={`tnum px-3 py-1.5 text-right ${m.savings < 0 ? "text-rose-600" : ""}`}>{formatCurrency(m.savings)}</td>
                  <td className="tnum px-3 py-1.5 text-right text-graphite">{m.income > 0 ? pct(m.savings / m.income) : "n/a"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
