"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Maximize2, MessageCircle, RotateCcw, Sparkles, X } from "lucide-react";
import { PromptInputBox } from "@/components/copilot/PromptInputBox";
import { hostOf } from "@/components/copilot/AnswerView";
import { api } from "@/lib/api";
import type { NextStep, SourceLink } from "@/lib/types";
import { useUserId } from "@/lib/hooks";
import { getOfflineOnly } from "@/lib/user";

const STARTERS = ["How am I doing financially?", "What deadlines are coming up?", "Where did I spend the most?", "Which govt schemes suit me?"];

/** Renders **bold** from the model as real bold text. */
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : part,
      )}
    </>
  );
}

interface Msg {
  role: "user" | "assistant";
  text: string;
  steps?: NextStep[];
  sources?: SourceLink[];
}

/** Floating FinPilot chat in the bottom-right corner. Quick questions; the full Copilot page keeps saved chats. */
export function ChatPopup() {
  const pathname = usePathname();
  const userId = useUserId();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, loading, open]);

  if (pathname.startsWith("/copilot")) return null;

  async function send(text?: string) {
    const message = (text ?? input).trim();
    if (!message || loading) return;
    const history = msgs.slice(-8).map((m) => ({ role: m.role, content: m.text }));
    setMsgs((m) => [...m, { role: "user", text: message }]);
    setInput("");
    setLoading(true);
    try {
      const a = await api.chat(message, userId, "auto", history);
      setMsgs((m) => [...m, { role: "assistant", text: a.narrative || "I could not find an answer to that.", steps: a.next_steps, sources: a.sources }]);
    } catch {
      setMsgs((m) => [...m, { role: "assistant", text: "Sorry, I couldn't answer right now. Please try again in a minute." }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed bottom-20 right-4 z-50 flex flex-col items-end gap-3 md:bottom-5 md:right-5">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ duration: 0.2 }}
            className="flex h-[min(560px,calc(100dvh-8rem))] w-[min(380px,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl border border-black/[0.08] bg-white shadow-[0_20px_60px_rgba(0,0,0,0.18)]"
          >
            <div className="flex items-center gap-2.5 bg-ink px-4 py-3 text-white">
              <span className="grid size-8 place-items-center rounded-full bg-lime text-ink">
                <Sparkles className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-tight">FinPilot</p>
                <p className="text-[11px] text-white/60">Ask me about your money</p>
              </div>
              {msgs.length > 0 && (
                <button onClick={() => setMsgs([])} title="New chat" aria-label="New chat" className="rounded-full p-1.5 text-white/70 hover:bg-white/10 hover:text-white">
                  <RotateCcw className="size-4" />
                </button>
              )}
              <Link href="/copilot" title="Open full Copilot" className="rounded-full p-1.5 text-white/70 hover:bg-white/10 hover:text-white">
                <Maximize2 className="size-4" />
              </Link>
              <button onClick={() => setOpen(false)} aria-label="Close chat" className="rounded-full p-1.5 text-white/70 hover:bg-white/10 hover:text-white">
                <X className="size-4" />
              </button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto bg-sage/30 p-4">
              {msgs.length === 0 && (
                <div className="rounded-2xl bg-white p-3.5 text-sm leading-relaxed text-graphite">
                  Hi, I&apos;m FinPilot. Ask about your spending, debts, tax deadlines or government schemes.
                  {getOfflineOnly() && <span className="mt-1 block text-[11px] text-pewter">Offline mode is on: basic answers only.</span>}
                </div>
              )}
              {msgs.length === 0 && (
                <div className="flex flex-wrap gap-2">
                  {STARTERS.map((q) => (
                    <button key={q} onClick={() => send(q)} className="rounded-full border border-olive/25 bg-white px-3 py-1.5 text-xs text-olive transition-colors hover:bg-tint-lime">
                      {q}
                    </button>
                  ))}
                </div>
              )}
              {msgs.map((m, i) => (
                <div key={i} className={m.role === "user" ? "flex justify-end" : "flex"}>
                  <div
                    className={
                      m.role === "user"
                        ? "max-w-[85%] whitespace-pre-line rounded-2xl rounded-br-md bg-ink px-3.5 py-2 text-sm text-white"
                        : "max-w-[90%] rounded-2xl rounded-bl-md bg-white px-3.5 py-2 text-sm leading-relaxed text-ink"
                    }
                  >
                    <p className="whitespace-pre-line">
                      <Rich text={m.text} />
                    </p>
                    {m.steps?.slice(0, 2).map((s, k) => (
                      <p key={k} className="mt-1.5 text-xs text-olive">
                        →{" "}
                        {s.link ? (
                          s.link.startsWith("/") ? (
                            <Link href={s.link} className="font-medium underline">{s.title}</Link>
                          ) : (
                            <a href={s.link} target="_blank" rel="noreferrer" className="font-medium underline">{s.title}</a>
                          )
                        ) : (
                          <span className="font-medium">{s.title}</span>
                        )}
                      </p>
                    ))}
                    {m.sources && m.sources.length > 0 && (
                      <p className="mt-1.5 text-[11px] text-pewter">Sources: {m.sources.map((s) => hostOf(s.url)).join(", ")}</p>
                    )}
                  </div>
                </div>
              ))}
              {loading && <p className="animate-pulse text-xs text-pewter">FinPilot is thinking…</p>}
              <div ref={endRef} />
            </div>

            <div className="bg-white p-2.5">
              <PromptInputBox value={input} onChange={setInput} onSend={() => send()} isLoading={loading} placeholder="Ask FinPilot..." />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close FinPilot chat" : "Open FinPilot chat"}
        className="grid size-14 place-items-center rounded-full bg-lime text-ink shadow-[0_10px_30px_rgba(95,127,12,0.4)] transition-transform hover:scale-105"
      >
        {open ? <X className="size-6" /> : <MessageCircle className="size-6" />}
      </button>
    </div>
  );
}
