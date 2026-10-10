"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { getLang, SPEECH_LANG } from "@/lib/i18n";

// The browser's own speech engines: free, no key needed. Works in Chrome, Edge and Safari.
interface Recognition {
  lang: string;
  interimResults: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start: () => void;
  stop: () => void;
}

function recognitionCtor(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const MIC_PROBLEMS: Record<string, string> = {
  "not-allowed": "Microphone is blocked. Allow it from the lock icon in the address bar, then try again.",
  "service-not-allowed": "Microphone is blocked. Allow it from the lock icon in the address bar, then try again.",
  "audio-capture": "No microphone found. Plug one in and try again.",
  "network": "Speech recognition needs an internet connection (and Chrome or Edge).",
  "no-speech": "I did not hear anything. Tap the mic and try again.",
};

/** Push-to-talk: `start()` listens once and calls `onText` with what was said. */
export function useVoiceInput(onText: (text: string) => void, onProblem?: (message: string) => void) {
  const supported = useSyncExternalStore(() => () => {}, () => recognitionCtor() !== null, () => false);
  const [listening, setListening] = useState(false);
  const rec = useRef<Recognition | null>(null);
  const cb = useRef(onText);
  const problem = useRef(onProblem);
  useEffect(() => {
    cb.current = onText;
    problem.current = onProblem;
  });

  const start = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = SPEECH_LANG[getLang()];
    r.interimResults = false;
    let heard = false;
    r.onresult = (e) => {
      const text = e.results[0]?.[0]?.transcript?.trim();
      if (text) {
        heard = true;
        cb.current(text);
      }
    };
    r.onend = () => {
      setListening(false);
      if (!heard && !failed) problem.current?.("I did not hear anything. Tap the mic and try again.");
    };
    let failed = false;
    r.onerror = (e) => {
      failed = true;
      setListening(false);
      problem.current?.(MIC_PROBLEMS[e.error] ?? `Voice input failed (${e.error}).`);
    };
    rec.current = r;
    setListening(true);
    r.start();
  }, []);

  const stop = useCallback(() => rec.current?.stop(), []);
  return { supported, listening, start, stop };
}

/** Reads text aloud. Markdown bold and the rupee sign are turned into words so it sounds natural. */
export function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const clean = text.replace(/\*\*/g, "").replace(/₹\s?([\d,]+(?:\.\d+)?)/g, "$1 rupees");
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(clean);
  u.lang = SPEECH_LANG[getLang()];
  window.speechSynthesis.speak(u);
}

export function stopSpeaking() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
}

const PAGES: { path: string; label: string; words: RegExp; target?: string }[] = [
  { path: "/transactions", label: "your transactions", words: /transaction|payment/, target: "table tbody tr" },
  { path: "/budgets", label: "your budgets", words: /budget/ },
  { path: "/goals", label: "your goals", words: /\bgoals?\b/ },
  { path: "/tax", label: "your tax page", words: /\btax/ },
  { path: "/financial-security", label: "Financial Security", words: /financial security|fraud|security score/ },
  { path: "/plan", label: "your plan", words: /\bplan\b|forecast/ },
  { path: "/household", label: "your household", words: /household|family/ },
  { path: "/invoices", label: "your invoices", words: /invoice/ },
  { path: "/connect", label: "the connect page", words: /connect|link (my )?(account|bank|google)/ },
  { path: "/profile", label: "your profile", words: /profile/ },
  { path: "/dashboard", label: "your dashboard", words: /dashboard|home|overview/ },
];

/** "show/open/go to/take me to X" -> the page to open. Plain questions return null and go to the Copilot. */
export function pageToOpen(text: string): { path: string; label: string; target?: string } | null {
  const t = text.toLowerCase();
  if (!/\b(show|open|go to|take me|navigate|view|display)\b/.test(t)) return null;
  return PAGES.find((p) => p.words.test(t)) ?? null;
}

export function isRecentTransactionQuestion(text: string): boolean {
  return /\b(recent|latest|last)\b.*\btransactions?\b|\btransactions?\b.*\b(recent|latest|last)\b/i.test(text);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Waits for the element (the page may still be loading), scrolls it to the middle and flashes it so the user sees where. */
export async function scrollToSelector(path: string, selector: string, timeoutMs = 8000): Promise<boolean> {
  const end = Date.now() + timeoutMs;
  // the URL changes before the new page replaces the old one, so wait for it, then let the swap finish
  while (!location.pathname.startsWith(path) && Date.now() < end) await sleep(100);
  await sleep(800);
  let el = document.querySelector(selector);
  while (!el && Date.now() < end) {
    await sleep(200);
    el = document.querySelector(selector);
  }
  if (!el) return false;
  flash(el);
  return true;
}

/** Eased scroll driven by timers: native smooth scrolling is dropped by some browsers and background tabs. */
function glideTo(y: number) {
  const from = window.scrollY;
  const to = Math.max(0, y);
  const start = Date.now();
  const id = setInterval(() => {
    const k = Math.min(1, (Date.now() - start) / 600);
    window.scrollTo(0, from + (to - from) * (1 - (1 - k) ** 3));
    if (k === 1) clearInterval(id);
  }, 16);
}

function flash(el: Element) {
  const r = el.getBoundingClientRect();
  glideTo(window.scrollY + r.top - window.innerHeight / 2 + r.height / 2);
  el.animate([{ backgroundColor: "#d9f99d" }, { backgroundColor: "transparent" }], { duration: 2500 });
}

/** "scroll down / up / to the top" or "scroll to <heading text>". Returns what it did, or null if it is not a scroll command. */
export function scrollCommand(text: string): string | null {
  const t = text.toLowerCase();
  if (!/scroll/.test(t)) return null;
  if (/(top|up)/.test(t)) {
    glideTo(/top/.test(t) ? 0 : window.scrollY - window.innerHeight * 0.8);
    return "Scrolling up.";
  }
  if (/(bottom|down)/.test(t)) {
    glideTo(/bottom/.test(t) ? document.documentElement.scrollHeight : window.scrollY + window.innerHeight * 0.8);
    return "Scrolling down.";
  }
  const m = t.match(/scroll (?:to|until|towards?)\s+(?:the\s+)?(.+?)(?:\s+section)?[.?!]*$/);
  const want = m?.[1];
  if (!want) return null;
  const heading = [...document.querySelectorAll("h1,h2,h3,h4")].find((h) => h.textContent?.toLowerCase().includes(want));
  if (!heading) return `I could not find a ${want} section on this page.`;
  flash(heading);
  return `Scrolling to ${want}.`;
}
