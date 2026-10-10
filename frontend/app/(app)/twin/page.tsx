"use client";

import { useCallback, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Ban, Siren, Undo2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAsync, useUserId } from "@/lib/hooks";
import type { GraphNode, SecurityFinding } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/shadcn/card";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

const W = 900;
const COLS = { you: 70, account: 270, category: 500, merchant: 800 } as const;
const COLOR = { you: "#5f7f0c", account: "#3f7d5c", category: "#a6d11a", merchant: "#4fe0b0" } as const;
const BAD = "#ef4444";

type Placed = GraphNode & { x: number; y: number; r: number };

export default function TwinSimulatorPage() {
  const userId = useUserId();
  const [months, setMonths] = useState(6);
  const [picked, setPicked] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<string[]>([]);
  const [fraud, setFraud] = useState({ merchant: "AMAZ0N PAY", amount: "4999" });
  const [sim, setSim] = useState<{ caught: boolean; findings: SecurityFinding[]; merchant: string } | null>(null);
  const [simError, setSimError] = useState<string | null>(null);
  const graph = useAsync(useCallback(() => api.securityGraph(userId, months), [userId, months]), [userId, months]);

  const { placed, edges, height, saved } = useMemo(() => {
    const g = graph.data;
    if (!g) return { placed: new Map<string, Placed>(), edges: [], height: 300, saved: 0 };
    const drop = new Set(blocked.map((m) => `m:${m}`));
    const nodes = g.nodes.filter((n) => !drop.has(n.id));
    const rows = Math.max(...(["you", "account", "category", "merchant"] as const).map((k) => nodes.filter((n) => n.kind === k).length), 1);
    const height = Math.max(320, rows * 42 + 40);
    const max = Math.max(...nodes.map((n) => n.amount), 1);
    const placed = new Map<string, Placed>();
    (["you", "account", "category", "merchant"] as const).forEach((k) => {
      const col = nodes.filter((n) => n.kind === k).sort((a, b) => b.amount - a.amount);
      col.forEach((n, i) => placed.set(n.id, { ...n, x: COLS[k], y: ((i + 1) * height) / (col.length + 1), r: 7 + 11 * Math.sqrt(n.amount / max) }));
    });
    const edges = g.edges.filter((e) => placed.has(e.source) && placed.has(e.target));
    const saved = g.nodes.filter((n) => drop.has(n.id)).reduce((s, n) => s + n.amount, 0);
    return { placed, edges, height, saved };
  }, [graph.data, blocked]);

  const node = picked ? placed.get(picked) : undefined;
  const summary = graph.data?.summary;
  const flaggedLeft = [...placed.values()].filter((n) => n.kind === "merchant" && n.flagged).length;
  const atRisk = [...placed.values()].filter((n) => n.kind === "merchant" && n.flagged).reduce((s, n) => s + n.amount, 0);
  const maxEdge = Math.max(...edges.map((e) => e.amount), 1);

  async function attempt() {
    setSimError(null);
    try {
      const r = await api.simulateFraud(userId, fraud.merchant, Math.abs(Number(fraud.amount)) || 0);
      setSim({ ...r, merchant: fraud.merchant });
    } catch (err) {
      setSim(null);
      setSimError(err instanceof Error ? err.message : "Simulation failed");
    }
  }

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Flagged merchants", String(flaggedLeft), flaggedLeft > 0 ? "text-red-600" : "text-ink"],
          ["Money at risk", formatCurrency(atRisk), atRisk > 0 ? "text-red-600" : "text-ink"],
          ["Total spend", formatCurrency(summary ? summary.total_spend - saved : 0), "text-ink"],
          ["Saved by blocking", formatCurrency(saved), "text-olive"],
        ].map(([label, value, tone], i) => (
          <motion.div key={label} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}>
            <Card className="bg-gradient-to-br from-white to-tint-lime/60">
              <CardContent className="pt-5">
                <p className="text-xs text-graphite">{label}</p>
                <p className={cn("font-display text-2xl font-semibold tnum", tone)}>{value}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="font-display text-lg">Money-flow network</CardTitle>
            <CardDescription>You, your accounts, categories and merchants. Wider lines mean more money; red means an agent flagged it. Click a node to inspect it.</CardDescription>
            <label className="mt-2 flex items-center gap-3 text-xs text-graphite">
              Last {months} month{months > 1 ? "s" : ""}
              <input type="range" min={1} max={12} value={months} onChange={(e) => setMonths(Number(e.target.value))} className="max-w-xs flex-1 accent-[#5f7f0c]" aria-label="Months of history" />
            </label>
          </CardHeader>
          <CardContent>
            {graph.loading && <p className="p-8 text-center text-sm text-graphite">Building the network…</p>}
            {!graph.loading && placed.size === 0 && <p className="p-8 text-center text-sm text-graphite">No spending in this period. Connect a source on the Connect page first.</p>}
            {placed.size > 0 && (
              <div className="overflow-x-auto">
                <svg viewBox={`0 0 ${W} ${height}`} className="min-w-[640px] w-full" role="img" aria-label="Money-flow network">
                  <g fontSize="11" fill="#6b7280">
                    {(["you", "account", "category", "merchant"] as const).map((k) => (
                      <text key={k} x={COLS[k]} y={12} textAnchor="middle" className="uppercase">
                        {k === "you" ? "You" : k + "s"}
                      </text>
                    ))}
                  </g>
                  {edges.map((e, i) => {
                    const a = placed.get(e.source)!;
                    const b = placed.get(e.target)!;
                    const mx = (a.x + b.x) / 2;
                    const dim = picked !== null && e.source !== picked && e.target !== picked;
                    return (
                      <motion.path
                        key={e.source + e.target}
                        d={`M${a.x},${a.y} C${mx},${a.y} ${mx},${b.y} ${b.x},${b.y}`}
                        fill="none"
                        stroke={e.flagged ? BAD : "#b7c28a"}
                        strokeWidth={1 + 5 * Math.sqrt(e.amount / maxEdge)}
                        strokeDasharray={e.flagged ? "6 6" : undefined}
                        initial={{ pathLength: 0, opacity: 0 }}
                        animate={{ pathLength: 1, opacity: dim ? 0.12 : e.flagged ? 0.85 : 0.5 }}
                        transition={{ duration: 0.7, delay: Math.min(i * 0.02, 0.8) }}
                      >
                        {e.flagged && <animate attributeName="stroke-dashoffset" from="12" to="0" dur="0.8s" repeatCount="indefinite" />}
                      </motion.path>
                    );
                  })}
                  {[...placed.values()].map((n, i) => (
                    <motion.g key={n.id} onClick={() => setPicked(n.id === picked ? null : n.id)} className="cursor-pointer" role="button" aria-label={`${n.label}, ${formatCurrency(n.amount)}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 + Math.min(i * 0.03, 0.8) }}>
                      <title>{`${n.label}: ${formatCurrency(n.amount)}`}</title>
                      {n.flagged && (
                        <circle cx={n.x} cy={n.y} r={n.r + 4} fill="none" stroke={BAD} strokeWidth={2}>
                          <animate attributeName="r" values={`${n.r + 2};${n.r + 9};${n.r + 2}`} dur="1.6s" repeatCount="indefinite" />
                          <animate attributeName="opacity" values="0.9;0.1;0.9" dur="1.6s" repeatCount="indefinite" />
                        </circle>
                      )}
                      <circle cx={n.x} cy={n.y} r={n.r} fill={n.flagged ? BAD : COLOR[n.kind]} stroke={picked === n.id ? "#111" : "#fff"} strokeWidth={picked === n.id ? 3 : 2} />
                      <text x={n.kind === "merchant" ? n.x + n.r + 5 : n.x} y={n.kind === "merchant" ? n.y + 4 : n.y - n.r - 5} textAnchor={n.kind === "merchant" ? "start" : "middle"} fontSize="11" fill="#1f2937">
                        {n.label.length > 16 ? n.label.slice(0, 15) + "…" : n.label}
                      </text>
                    </motion.g>
                  ))}
                </svg>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-graphite">
                  {([["You", COLOR.you], ["Accounts", COLOR.account], ["Categories", COLOR.category], ["Merchants", COLOR.merchant], ["Flagged", BAD]] as const).map(([t, c]) => (
                    <span key={t} className="flex items-center gap-1.5">
                      <i className="size-2.5 rounded-full" style={{ background: c }} /> {t}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid content-start gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{node ? node.label : "Inspect"}</CardTitle>
              <CardDescription>{node ? `${node.kind} · ${formatCurrency(node.amount)} over ${months} month(s)` : "Click any node in the network."}</CardDescription>
            </CardHeader>
            {node && (
              <CardContent className="grid gap-2 text-sm">
                {node.findings.length > 0 ? (
                  <ul className="list-disc pl-5 text-red-700">
                    {node.findings.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-graphite">Nothing flagged here.</p>
                )}
                {node.kind === "merchant" && node.label !== "Other merchants" && (
                  <Button variant="outline" size="sm" onClick={() => { setBlocked((b) => [...b, node.label]); setPicked(null); }}>
                    <Ban className="size-4" /> What if I block this merchant?
                  </Button>
                )}
              </CardContent>
            )}
            {blocked.length > 0 && (
              <CardContent className="text-xs text-graphite">
                Blocked: {blocked.join(", ")}.{" "}
                <button type="button" className="inline-flex items-center gap-1 font-medium text-ink underline" onClick={() => setBlocked([])}>
                  <Undo2 className="size-3" /> Undo
                </button>
              </CardContent>
            )}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Siren className="size-4 text-red-500" /> Simulate a fraud attempt
              </CardTitle>
              <CardDescription>Nothing is saved. The agents check your ledger plus this one made-up payment.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              <Input value={fraud.merchant} onChange={(e) => setFraud({ ...fraud, merchant: e.target.value })} aria-label="Merchant name" />
              <Input value={fraud.amount} inputMode="numeric" onChange={(e) => setFraud({ ...fraud, amount: e.target.value })} aria-label="Amount in rupees" />
              <Button size="sm" onClick={attempt}>Run the agents</Button>
              {simError && <p className="text-xs text-red-700">{simError}</p>}
              {sim && (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={cn("rounded-xl p-3 text-xs", sim.caught ? "bg-red-50 text-red-800" : "bg-tint-lime text-ink")}>
                  <p className="font-semibold">{sim.caught ? `Caught: ${sim.findings.length} flag(s) for ${sim.merchant}` : `Not flagged: ${sim.merchant} looks normal to the agents.`}</p>
                  {sim.findings.map((f, i) => (
                    <p key={i} className="mt-1">{f.title}</p>
                  ))}
                </motion.div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
