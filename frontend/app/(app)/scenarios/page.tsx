"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/lib/api";
import { useAsync, useUserId } from "@/lib/hooks";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { simulate, type Baseline, type ScenarioActions, type SimResult } from "@/lib/scenario-sim";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/shadcn/button";
import { Skeleton } from "@/components/shadcn/skeleton";

interface Scenario extends ScenarioActions {
  id: number;
  name: string;
}

const COLORS = ["#5f7f0c", "#a6d11a", "#0ea5e9", "#8b5cf6"];
const MAX_SCENARIOS = 4;
const HORIZONS = [3, 6, 12];
const NO_ACTIONS: ScenarioActions = { cutDiscretionary: 0, extraDebt: 0, extraSavings: 0, incomeChange: 0, startMonth: 1 };

// Used when the user has no linked data yet, so the tool is still usable.
const SAMPLE: Baseline = {
  income: 30000, expenses: 25000, discretionary: 8000, cash: 50000, debt: 60000, aprPct: 12, minPayment: 2000, reserve: 20000,
};

const INPUT = "min-h-10 w-full rounded-chip border border-black/[0.1] bg-white px-3 text-sm text-ink tnum outline-none focus-visible:ring-2 focus-visible:ring-ink";

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function NumField({ label, value, onChange, step = 500 }: { label: string; value: number; onChange: (n: number) => void; step?: number }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-graphite">
      {label}
      <input
        type="number"
        min={0}
        step={step}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
        className={INPUT}
      />
    </label>
  );
}

function ActionSlider({ label, value, max, onChange }: { label: string; value: number; max: number; onChange: (n: number) => void }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-graphite">
      <span className="flex justify-between">
        {label}
        <span className="tnum font-semibold text-ink">{formatCurrency(value)}</span>
      </span>
      <input type="range" min={0} max={max} step={500} value={value} onChange={(e) => onChange(Number(e.target.value))} className="accent-ink" />
    </label>
  );
}

function explain(base: Baseline, scenarios: Scenario[], results: SimResult[], months: number): string[] {
  const b = results[0];
  const out: string[] = [];
  scenarios.slice(1).forEach((s, i) => {
    const r = results[i + 1];
    const dCash = r.endCash - b.endCash;
    const dDebt = b.endDebt - r.endDebt;
    const dInt = b.totalInterest - r.totalInterest;
    const parts: string[] = [];
    if (dDebt > 0.5) parts.push(`pays down ${formatCurrency(dDebt)} more debt${dInt > 0.5 ? ` and saves ${formatCurrency(dInt)} interest` : ""}`);
    if (r.endSavings > 0.5) parts.push(`moves ${formatCurrency(r.endSavings)} into savings`);
    const cash = Math.abs(dCash) < 0.5 ? "leaves cash unchanged" : `leaves ${formatCurrency(Math.abs(dCash))} ${dCash > 0 ? "more" : "less"} cash`;
    let line = `${s.name} ${parts.length ? parts.join(" and ") + ", but " : ""}${cash} than ${scenarios[0].name} after ${months} months.`;
    if (r.firstBreachMonth !== null && b.firstBreachMonth === null)
      line += ` Warning: cash drops below your ${formatCurrency(base.reserve)} reserve in month ${r.firstBreachMonth}.`;
    out.push(line);
  });
  const best = results.reduce((bi, r, i) => (r.netWorth > results[bi].netWorth ? i : bi), 0);
  out.push(`Highest net worth (cash + savings - debt) after ${months} months: ${scenarios[best].name} at ${formatCurrency(results[best].netWorth)}.`);
  return out;
}

export default function ScenariosPage() {
  const userId = useUserId();
  const { data: plan, loading: planLoading } = useAsync(() => api.plan(userId), [userId]);
  const { data: dash, loading: dashLoading } = useAsync(() => api.dashboard(userId), [userId]);

  if ((planLoading && !plan) || (dashLoading && !dash)) return <Skeleton className="h-96 w-full rounded-card" />;

  const seeded: Baseline | null =
    plan && dash && plan.forecast.length
      ? (() => {
          const debts = dash.debts;
          const debt = debts.reduce((s, d) => s + d.principal, 0);
          const disc = avg(plan.forecast.map((f) => f.discretionary.p50));
          return {
            income: Math.round(avg(plan.forecast.map((f) => f.income.p50))),
            expenses: Math.round(avg(plan.forecast.map((f) => f.essential.p50 + f.discretionary.p50))),
            discretionary: Math.round(disc),
            cash: Math.round(plan.starting_cash),
            debt: Math.round(debt),
            aprPct: debt ? Math.round((debts.reduce((s, d) => s + d.principal * d.interest_rate_apr, 0) / debt) * 10) / 10 : 0,
            minPayment: Math.round(debts.reduce((s, d) => s + d.minimum_payment, 0)),
            reserve: Math.round(plan.constraints.min_reserve),
          };
        })()
      : null;

  return <Planner key={userId + (seeded ? "d" : "s")} initial={seeded ?? SAMPLE} usingSample={!seeded} />;
}

function Planner({ initial, usingSample }: { initial: Baseline; usingSample: boolean }) {
  const [base, setBase] = useState<Baseline>(initial);
  const [months, setMonths] = useState(6);
  const [nextId, setNextId] = useState(3);
  const [scenarios, setScenarios] = useState<Scenario[]>([
    { id: 0, name: "Current plan", ...NO_ACTIONS },
    { id: 1, name: "Save more", ...NO_ACTIONS, extraSavings: 5000 },
    { id: 2, name: "Debt first", ...NO_ACTIONS, cutDiscretionary: Math.min(5000, initial.discretionary), extraDebt: 3000 },
  ]);

  const results = useMemo(() => scenarios.map((s) => simulate(base, s, months)), [base, scenarios, months]);
  const notes = useMemo(() => explain(base, scenarios, results, months), [base, scenarios, results, months]);
  const chartData = useMemo(
    () => [
      { label: "Start", ...Object.fromEntries(scenarios.map((s) => [`s${s.id}`, base.cash])) },
      ...results[0].rows.map((_, i) => ({
        label: `M${i + 1}`,
        ...Object.fromEntries(scenarios.map((s, j) => [`s${s.id}`, Math.round(results[j].rows[i].cash)])),
      })),
    ],
    [base.cash, scenarios, results]
  );

  const patch = (id: number, p: Partial<Scenario>) => setScenarios((xs) => xs.map((s) => (s.id === id ? { ...s, ...p } : s)));
  const set = (k: keyof Baseline) => (n: number) => setBase((b) => ({ ...b, [k]: n }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">Scenario comparison</h1>
        <p className="mt-1 text-sm text-graphite">
          Change a few decisions and compare cash, savings and debt month by month. Edits recalculate instantly.
        </p>
        {usingSample && (
          <p className="mt-2 rounded-chip bg-tint-lime px-3 py-2 text-xs text-ink">
            Showing sample numbers. <Link href="/connect" className="font-semibold underline">Connect Google Pay</Link> to start from your own data.
          </p>
        )}
      </div>

      <Card className="p-6">
        <CardHeader><CardTitle>Starting point</CardTitle></CardHeader>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <NumField label="Monthly income (₹)" value={base.income} onChange={set("income")} />
          <NumField label="Monthly expenses (₹)" value={base.expenses} onChange={set("expenses")} />
          <NumField label="of which discretionary (₹)" value={base.discretionary} onChange={set("discretionary")} />
          <NumField label="Starting cash (₹)" value={base.cash} onChange={set("cash")} />
          <NumField label="Debt outstanding (₹)" value={base.debt} onChange={set("debt")} />
          <NumField label="Debt APR (%)" value={base.aprPct} onChange={set("aprPct")} step={0.5} />
          <NumField label="Required debt payment (₹/mo)" value={base.minPayment} onChange={set("minPayment")} />
          <NumField label="Emergency reserve (₹)" value={base.reserve} onChange={set("reserve")} />
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {scenarios.map((s, i) => (
          <Card key={s.id} className="flex flex-col gap-3 p-5" style={{ borderTop: `4px solid ${COLORS[i]}` }}>
            <div className="flex items-center gap-2">
              <input
                aria-label="Scenario name"
                value={s.name}
                onChange={(e) => patch(s.id, { name: e.target.value })}
                className="min-w-0 flex-1 rounded-chip border border-transparent bg-transparent px-1 font-display text-base font-semibold text-ink outline-none hover:border-black/10 focus-visible:border-ink"
              />
              {i > 0 && (
                <button aria-label={`Remove ${s.name}`} onClick={() => setScenarios((xs) => xs.filter((x) => x.id !== s.id))} className="rounded-full p-1.5 text-pewter hover:bg-fog">
                  <Trash2 className="size-4" />
                </button>
              )}
            </div>
            {i === 0 ? (
              <p className="text-xs text-graphite">Baseline: nothing changes. Others are compared against this.</p>
            ) : (
              <>
                <ActionSlider label="Cut discretionary" value={s.cutDiscretionary} max={Math.max(base.discretionary, 500)} onChange={(n) => patch(s.id, { cutDiscretionary: n })} />
                <ActionSlider label="Extra debt repayment" value={s.extraDebt} max={15000} onChange={(n) => patch(s.id, { extraDebt: n })} />
                <ActionSlider label="Extra savings transfer" value={s.extraSavings} max={15000} onChange={(n) => patch(s.id, { extraSavings: n })} />
                <ActionSlider label="Income change" value={s.incomeChange} max={20000} onChange={(n) => patch(s.id, { incomeChange: n })} />
                <label className="flex items-center justify-between text-xs font-medium text-graphite">
                  Starts in month
                  <select value={s.startMonth} onChange={(e) => patch(s.id, { startMonth: Number(e.target.value) })} className="rounded-chip border border-black/10 bg-white px-2 py-1 text-ink">
                    {Array.from({ length: months }, (_, k) => k + 1).map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </label>
              </>
            )}
          </Card>
        ))}
        {scenarios.length < MAX_SCENARIOS && (
          <button
            onClick={() => { setScenarios((xs) => [...xs, { id: nextId, name: `Plan ${nextId}`, ...NO_ACTIONS }]); setNextId((n) => n + 1); }}
            className="flex min-h-40 items-center justify-center gap-2 rounded-card border-2 border-dashed border-black/15 text-sm font-medium text-graphite hover:bg-white/60"
          >
            <Plus className="size-4" /> Add scenario
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm text-graphite">Projection</span>
        {HORIZONS.map((h) => (
          <Button key={h} size="sm" variant={months === h ? "default" : "outline"} onClick={() => setMonths(h)}>{h} months</Button>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {scenarios.map((s, i) => {
          const r = results[i];
          const b = results[0];
          const dNet = r.netWorth - b.netWorth;
          return (
            <Card key={s.id} className="p-5">
              <p className="flex items-center gap-2 text-xs font-medium text-graphite">
                <span className="size-2.5 rounded-full" style={{ background: COLORS[i] }} /> {s.name}
              </p>
              <p className="mt-2 text-xs text-pewter">Cash after {months} months</p>
              <p className="font-display text-2xl font-semibold tnum text-ink">{formatCurrency(r.endCash)}</p>
              <dl className="mt-3 grid grid-cols-2 gap-y-1 text-xs text-graphite">
                <dt>Savings</dt><dd className="text-right tnum text-ink">{formatCurrency(r.endSavings)}</dd>
                <dt>Debt left</dt><dd className="text-right tnum text-ink">{formatCurrency(r.endDebt)}</dd>
                <dt>Interest paid</dt><dd className="text-right tnum text-ink">{formatCurrency(r.totalInterest)}</dd>
                <dt>Net worth</dt><dd className="text-right tnum text-ink">{formatCurrency(r.netWorth)}</dd>
                {i > 0 && (<><dt>vs baseline</dt><dd className={cn("text-right tnum font-semibold", dNet >= 0 ? "text-leaf" : "text-rose-600")}>{dNet >= 0 ? "+" : ""}{formatCurrency(dNet)}</dd></>)}
              </dl>
              {r.firstBreachMonth !== null && (
                <p className="mt-3 flex items-center gap-1.5 rounded-chip bg-rose-50 px-2 py-1.5 text-xs text-rose-700">
                  <AlertTriangle className="size-3.5 shrink-0" /> Below reserve from month {r.firstBreachMonth}
                </p>
              )}
            </Card>
          );
        })}
      </div>

      <Card className="p-6">
        <CardHeader><CardTitle>Cash balance over time</CardTitle></CardHeader>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ left: 8, right: 16, top: 12, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,23,42,0.06)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} />
              <YAxis tickFormatter={(v: number) => formatCurrency(v)} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={82} />
              <Tooltip formatter={(v) => formatCurrency(Number(v))} />
              <ReferenceLine y={base.reserve} stroke="#e11d48" strokeDasharray="4 4" label={{ value: "Reserve", position: "insideTopRight", fontSize: 11, fill: "#e11d48" }} />
              {scenarios.map((s, i) => (
                <Line key={s.id} type="monotone" dataKey={`s${s.id}`} name={s.name} stroke={COLORS[i]} strokeWidth={2.5} dot={false} isAnimationActive={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-6">
        <CardHeader><CardTitle>What this means</CardTitle></CardHeader>
        <ul className="grid gap-2 text-sm text-ink">
          {notes.map((n) => <li key={n}>{n}</li>)}
        </ul>
        <p className="mt-3 text-xs text-pewter">
          Generated from the simulation numbers, not estimated. Assumes fixed income and spending, monthly interest at the APR above, no investment returns.
          Savings transfers leave cash but stay in net worth; the required debt payment applies in every scenario.
        </p>
      </Card>

      <Card className="overflow-x-auto p-6">
        <CardHeader><CardTitle>Month by month</CardTitle></CardHeader>
        <table className="w-full min-w-[640px] text-left text-xs">
          <thead>
            <tr className="text-pewter">
              <th className="py-2 pr-3">Month</th>
              {scenarios.map((s, i) => (
                <th key={s.id} colSpan={3} className="px-2 py-2 text-ink">
                  <span className="mr-1.5 inline-block size-2 rounded-full" style={{ background: COLORS[i] }} />{s.name}
                </th>
              ))}
            </tr>
            <tr className="text-pewter">
              <th />
              {scenarios.map((s) => ["Cash", "Debt", "Savings"].map((h) => <th key={s.id + h} className="px-2 py-1 font-medium">{h}</th>))}
            </tr>
          </thead>
          <tbody>
            {results[0].rows.map((row, k) => (
              <tr key={row.month} className="border-t border-black/[0.05]">
                <td className="py-2 pr-3 font-medium text-ink">M{row.month}</td>
                {results.flatMap((r, j) => {
                  const x = r.rows[k];
                  return [
                    <td key={`${j}c`} className={cn("px-2 py-2 tnum", x.belowReserve && "bg-rose-50 text-rose-700")}>{formatCurrency(x.cash)}</td>,
                    <td key={`${j}d`} className="px-2 py-2 tnum">{formatCurrency(x.debt)}</td>,
                    <td key={`${j}s`} className="px-2 py-2 tnum">{formatCurrency(x.savings)}</td>,
                  ];
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
