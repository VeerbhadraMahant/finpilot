"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/lib/api";
import { useUserId } from "@/lib/hooks";
import type { RecomputeDiff } from "@/lib/types";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type EventKind = "transaction" | "recurring";

export default function TimelinePage() {
  const userId = useUserId();
  const [kind, setKind] = useState<EventKind>("transaction");
  const [merchant, setMerchant] = useState("");
  const [amount, setAmount] = useState(1000);
  const [frequency, setFrequency] = useState("monthly");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  const [diff, setDiff] = useState<RecomputeDiff | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setDiff(null);
    try {
      const signedAmount = -Math.abs(amount);
      const payload =
        kind === "transaction"
          ? { kind: "transaction", merchant, amount: signedAmount, date }
          : { kind: "recurring", merchant, amount: signedAmount, frequency, next_expected_date: date };
      const result = await api.addEvent(userId, payload);
      setDiff(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add event");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-8 pb-16 max-w-4xl mx-auto">
      <div className="border-b border-black/[0.04] pb-4">
        <h1 className="font-display text-2xl sm:text-3xl font-medium text-ink">
          Timeline & Event Simulator
        </h1>
        <p className="mt-1 text-xs sm:text-sm text-graphite">
          Inject a prospective expense or recurring obligation to inspect the real-time RecomputeDiff on your financial horizon.
        </p>
      </div>

      <Card className="p-6 sm:p-8">
        <CardHeader>
          <CardTitle>Log Timeline Event</CardTitle>
          <span className="text-xs text-pewter">Affects cash-flow forecasts & health scores</span>
        </CardHeader>

        <form onSubmit={submit} className="flex flex-col gap-6">
          {/* Segmented Type Toggle */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setKind("transaction")}
              className={cn(
                "px-4 py-2 rounded-chip text-xs font-semibold transition-all cursor-pointer border",
                kind === "transaction"
                  ? "bg-lime text-ink border-lime-dark shadow-sm"
                  : "bg-white text-graphite border-black/[0.08] hover:bg-fog"
              )}
            >
              One-off Outflow / Expense
            </button>
            <button
              type="button"
              onClick={() => setKind("recurring")}
              className={cn(
                "px-4 py-2 rounded-chip text-xs font-semibold transition-all cursor-pointer border",
                kind === "recurring"
                  ? "bg-lime text-ink border-lime-dark shadow-sm"
                  : "bg-white text-graphite border-black/[0.08] hover:bg-fog"
              )}
            >
              New Recurring Obligation
            </button>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field label="Merchant or Description">
              <input
                required
                value={merchant}
                onChange={(e) => setMerchant(e.target.value)}
                className="w-full rounded-chip border border-black/[0.1] bg-white px-3.5 py-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-ember/30"
                placeholder="e.g. Health Insurance Premium"
              />
            </Field>

            <Field label="Amount (₹)">
              <input
                required
                type="number"
                min={0}
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                className="w-full rounded-chip border border-black/[0.1] bg-white px-3.5 py-2.5 text-sm font-semibold text-ink outline-none focus:ring-2 focus:ring-ember/30 tnum"
              />
            </Field>

            {kind === "recurring" && (
              <Field label="Billing Frequency">
                <select
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value)}
                  className="w-full rounded-chip border border-black/[0.1] bg-white px-3.5 py-2.5 text-sm font-medium text-ink outline-none focus:ring-2 focus:ring-ember/30"
                >
                  <option value="weekly">Weekly</option>
                  <option value="biweekly">Biweekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="annual">Annual</option>
                </select>
              </Field>
            )}

            <Field label={kind === "transaction" ? "Transaction Date" : "First Due Date"}>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-chip border border-black/[0.1] bg-white px-3.5 py-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-ember/30"
              />
            </Field>
          </div>

          <div className="pt-2 flex items-center gap-4">
            <Button type="submit" variant="primary" size="md" disabled={submitting} className="px-6 py-2.5">
              {submitting ? "Recomputing Snapshot..." : "Add Event & Recompute"}
            </Button>
            {error && <span className="text-xs text-rose-600 font-medium">⚠️ {error}</span>}
          </div>
        </form>
      </Card>

      <AnimatePresence>
        {diff && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 15 }}
          >
            <DiffCard diff={diff} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-wider text-pewter">{label}</span>
      {children}
    </label>
  );
}

function DiffCard({ diff }: { diff: RecomputeDiff }) {
  const scoreDelta = diff.health_score_after - diff.health_score_before;

  return (
    <Card className="flex flex-col gap-6 p-6 sm:p-8 border-ember/25 bg-gradient-to-b from-white to-orange-50/20">
      <CardHeader>
        <div className="flex items-center gap-2">
          <span className="h-6 w-6 rounded-full bg-ember text-white flex items-center justify-center text-xs font-bold">
            Δ
          </span>
          <CardTitle>Recomputation Diff: Impact Observed</CardTitle>
        </div>
      </CardHeader>

      {diff.narrative && (
        <div className="rounded-surface border border-black/[0.06] bg-white p-4 text-sm leading-relaxed text-graphite">
          {diff.narrative}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 pt-2">
        <div className="p-4 rounded-surface border border-black/[0.06] bg-white flex flex-col justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-pewter">
            Health Score Impact
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-graphite line-through tnum">
              {Math.round(diff.health_score_before)}
            </span>
            <span className="text-pewter">→</span>
            <span className="font-display text-3xl font-bold text-ink tnum">
              {Math.round(diff.health_score_after)}
            </span>
            <span
              className={cn(
                "text-xs font-bold px-2 py-0.5 rounded-full",
                scoreDelta >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
              )}
            >
              ({scoreDelta >= 0 ? "+" : ""}
              {Math.round(scoreDelta)})
            </span>
          </div>
        </div>

        <div className="p-4 rounded-surface border border-black/[0.06] bg-white flex flex-col justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-pewter">
            Projected Gap Date
          </p>
          <div className="mt-2 flex items-baseline gap-2 text-sm">
            <span className="text-graphite">
              {diff.forecast_first_gap_before ? formatDate(diff.forecast_first_gap_before) : "None"}
            </span>
            <span className="text-pewter">→</span>
            <span className="font-semibold text-ink">
              {diff.forecast_first_gap_after ? formatDate(diff.forecast_first_gap_after) : "None"}
            </span>
          </div>
        </div>
      </div>

      {diff.new_recommendations.length > 0 && (
        <div className="pt-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-pewter mb-2">
            New Recommendations Triggered
          </p>
          <ul className="flex flex-col gap-2">
            {diff.new_recommendations.map((r, i) => (
              <li
                key={i}
                className="rounded-chip border border-black/[0.06] bg-white p-3.5 text-sm font-medium text-ink shadow-sm flex items-center gap-2"
              >
                <span className="h-2 w-2 rounded-full bg-ember shrink-0" />
                <span>{r.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {diff.removed_recommendation_actions.length > 0 && (
        <div className="pt-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-pewter mb-2">
            Superseded Actions
          </p>
          <div className="flex flex-wrap gap-2">
            {diff.removed_recommendation_actions.map((a, i) => (
              <Chip key={i} tone="outline">
                {a.replace(/_/g, " ")}
              </Chip>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
