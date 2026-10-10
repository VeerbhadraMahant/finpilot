"use client";

import { useRef, useState } from "react";
import { CheckCircle2, ScanText, ShieldCheck, Upload } from "lucide-react";
import { api } from "@/lib/api";
import { useUserId } from "@/lib/hooks";
import { formatCurrency, formatDate } from "@/lib/format";
import type { OcrPreview } from "@/lib/types";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

const LABELS: Record<string, string> = {
  identity_lines: "name / address lines",
  account_number: "account numbers",
  phone: "phone numbers",
  email: "email addresses",
  pan: "PAN numbers",
  aadhaar: "Aadhaar numbers",
  ifsc: "IFSC codes",
  upi_id: "UPI IDs",
};

export default function UploadPage() {
  const userId = useUserId();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<OcrPreview | null>(null);
  const [skip, setSkip] = useState<Set<number>>(new Set());
  const [done, setDone] = useState<number | null>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    setPreview(null);
    setDone(null);
    setSkip(new Set());
    try {
      setPreview(await api.extractStatement(userId, file));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read that file");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function save() {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const rows = preview.transactions.filter((_, i) => !skip.has(i));
      setDone((await api.importOcr(userId, rows)).imported);
      setPreview(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  const removed = preview ? Object.entries(preview.removed) : [];
  const chosen = preview ? preview.transactions.length - skip.size : 0;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-medium text-ink">Upload document</h1>
        <p className="mt-1 text-sm text-graphite">A bank statement or a photo of your passbook. We read it on this server, remove personal details, and save only the transactions.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            <ScanText className="mr-2 inline size-4" /> Choose a file
          </CardTitle>
        </CardHeader>
        <div className="flex flex-col items-start gap-3 p-5 pt-0">
          <input ref={input} type="file" accept="image/*,.txt,.csv" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
          <Button variant="lime" onClick={() => input.current?.click()} disabled={busy}>
            <Upload className="size-4" /> {busy ? "Working…" : "Upload photo or statement"}
          </Button>
          <p className="text-xs text-pewter">JPG, PNG, WebP, or a .txt / .csv statement, up to 5 MB. The file itself is never stored.</p>
          {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
          {done !== null && (
            <p className="flex items-center gap-2 text-sm text-emerald-700">
              <CheckCircle2 className="size-4" /> Saved {done} transactions. They now appear in Transactions and your dashboard.
            </p>
          )}
        </div>
      </Card>

      {preview && (
        <Card>
          <CardHeader>
            <CardTitle>Review before saving</CardTitle>
          </CardHeader>
          <div className="flex flex-col gap-4 p-5 pt-0">
            <p className="flex items-start gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" />
              {removed.length
                ? `Removed before saving: ${removed.map(([k, n]) => `${n} ${LABELS[k] ?? k}`).join(", ")}.`
                : "No personal details were found in this file."}
            </p>
            <ul className="divide-y divide-mist">
              {preview.transactions.map((t, i) => (
                <li key={i} className="flex items-center gap-3 py-2">
                  <input type="checkbox" checked={!skip.has(i)} aria-label={`Include ${t.description}`}
                    onChange={() => setSkip((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; })} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-ink">{t.description}</p>
                    <p className="text-xs text-pewter">{formatDate(t.date)}</p>
                  </div>
                  <p className={`tnum text-sm font-medium ${t.amount < 0 ? "text-ink" : "text-emerald-700"}`}>{formatCurrency(t.amount)}</p>
                </li>
              ))}
            </ul>
            <Button variant="lime" onClick={save} disabled={busy || chosen === 0}>
              Save {chosen} transactions
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
