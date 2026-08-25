"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  toolCalls?: string[];
};

type Props = {
  region?: string;
  latitude?: number;
  longitude?: number;
  locationLabel?: string;
  nearbyStops?: Array<{
    name: string;
    provider: string;
    category: string;
    distanceMeters: number;
    routes: Array<{ name: string }>;
  }>;
};

// Bumped after removing historically saved West-Bengal-only replies for
// Bengaluru questions. Old answers must not survive a corrected deployment.
const STORAGE_KEY = "ratroo.public-assistant.v2";
/**
 * Opening prompts, per region.
 *
 * These were three West Bengal questions — Digha, Bongaon, Sealdah — shown to
 * everyone, so a rider standing in Bengaluru was invited to ask about a beach
 * 1,700 km away, one of them in Bengali. The panel already receives the
 * rider's position and their nearby stops; it just never used them.
 *
 * The Bengali prompt stays for Kolkata, where it is the language riders
 * actually use, and is not shown in Karnataka where it is noise.
 */
const REGION_SUGGESTIONS: Record<string, string[]> = {
  kolkata: [
    "How do I get to Digha from here?",
    "ekhan theke Bongaon kivabe jabo?",
    "How do I get from Sealdah to Bongaon?",
  ],
  bengaluru: [
    "How do I get to Majestic from here?",
    "How do I get from Indiranagar to Electronic City?",
    "Which bus goes to Kempegowda Airport?",
  ],
};

/** What to say about languages, which is not the same everywhere. */
const REGION_LANGUAGES: Record<string, string> = {
  kolkata: "Ask in English or Bengali.",
  bengaluru: "Ask in English or Kannada.",
};

/**
 * Prompts worth showing this rider.
 *
 * Real nearby stops come first: they are true by construction, need no list to
 * be maintained, and work in a region nobody has written prompts for yet —
 * which matters as coverage grows beyond these two cities. The curated set
 * fills in behind them.
 */
/**
 * Prompts that name no place, for a rider whose region is not known yet —
 * before location is granted, or anywhere coverage has not reached.
 *
 * An empty panel is worse than a generic one: the buttons are what tell a
 * first-time rider the box takes plain questions at all.
 */
const GENERIC_SUGGESTIONS = [
  "How do I get to the nearest bus stand?",
  "Which buses run near me right now?",
  "What is the last bus home tonight?",
];

function suggestionsFor(region: string | undefined, stops: NonNullable<Props["nearbyStops"]>) {
  const curated = REGION_SUGGESTIONS[region ?? ""] ?? [];
  // The busiest stop near a rider is usually the interchange they would name.
  // Long names are skipped rather than truncated: "St Josephs Indian School/
  // Malya Hospital" makes a button nobody reads, and a half-name in a question
  // the assistant then has to resolve is worse than not offering it.
  const anchor = [...stops]
    .filter(stop => stop.name.length <= 28)
    .sort((a, b) => (b.routes?.length ?? 0) - (a.routes?.length ?? 0))[0];
  const fromStops = anchor ? [`How do I get to ${anchor.name} from here?`] : [];
  const picked = [...fromStops, ...curated];
  return (picked.length ? picked : GENERIC_SUGGESTIONS).slice(0, 3);
}

function stopsForAssistant(stops: NonNullable<Props["nearbyStops"]>) {
  const buses = stops.filter((stop) => stop.category.startsWith("BUS")).slice(0, 5);
  const metros = stops.filter((stop) => stop.category.startsWith("METRO")).slice(0, 5);
  const selected = [...buses, ...metros];
  return [...selected, ...stops.filter((stop) => !selected.includes(stop))].slice(0, 10);
}

function cleanAnswer(raw: string) {
  return raw
    .replace(/\*\*|__/g, "")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/^\s*[*-]\s+/gm, "• ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function linkedLine(line: string, lineIndex: number, lines: string[]) {
  const parts = line.split(/(https?:\/\/[^\s]+)/g);
  return <span key={lineIndex}>{parts.map((part, index) => part.startsWith("http")
    ? <a key={index} href={part} target="_blank" rel="noreferrer">Open service ↗</a>
    : part)}{lineIndex < lines.length - 1 && <br />}</span>;
}

export default function PublicAssistant({ latitude, longitude, locationLabel, nearbyStops = [], region }: Props) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const restored = useRef(false);

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]") as ChatMessage[];
        if (Array.isArray(saved)) setMessages(saved.slice(-30));
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      } finally {
        restored.current = true;
      }
    });
  }, []);

  useEffect(() => {
    if (restored.current) localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-30)));
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 120);
  }, [open]);

  async function send(preset?: string) {
    const question = (preset || input).trim();
    if (!question || busy) return;
    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", text: question };
    setMessages(current => [...current, userMessage]);
    setInput("");
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ question, lat: latitude, lng: longitude, nearbyStops: stopsForAssistant(nearbyStops) }),
      });
      const payload = await response.json().catch(() => ({})) as { data?: { answer?: string; toolCalls?: string[] }; message?: string };
      if (!response.ok || !payload.data?.answer) throw new Error(payload.message || "No answer came back.");
      setMessages(current => [...current, {
        id: crypto.randomUUID(),
        role: "assistant",
        text: cleanAnswer(payload.data?.answer || ""),
        toolCalls: payload.data?.toolCalls || [],
      }]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Ratroo AI is temporarily unavailable.");
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void send();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  }

  function newChat() {
    setMessages([]);
    setError("");
    setInput("");
    localStorage.removeItem(STORAGE_KEY);
    inputRef.current?.focus();
  }

  return <>
    <button type="button" className={`assistant-launcher ${open ? "open" : ""}`} onClick={() => setOpen(value => !value)} aria-expanded={open} aria-controls="ratroo-assistant-panel">
      <span>R</span><b>{open ? "Close" : "Ask Ratroo"}</b><i>{open ? "×" : "AI"}</i>
    </button>
    {open && <aside className="assistant-panel" id="ratroo-assistant-panel" role="dialog" aria-label="Ask Ratroo transit assistant">
      <header>
        <div><span>R</span><div><small>RATROO AI</small><strong>Ask about any journey</strong></div></div>
        <div><button type="button" onClick={newChat} disabled={!messages.length} title="Start a new chat">＋</button><button type="button" onClick={() => setOpen(false)} aria-label="Close Ratroo AI">×</button></div>
      </header>
      <div className="assistant-context"><span className={latitude != null ? "live" : ""}>●</span>{latitude != null ? `Planning from ${locationLabel || "your current location"}${nearbyStops.length ? ` · ${nearbyStops.length} nearby stops ready` : ""}` : "Add your starting place in the question"}</div>
      <div className="assistant-messages" ref={scrollRef} aria-live="polite">
        {!messages.length && <section className="assistant-intro"><div className="assistant-orbit">AI<span /></div><h2>Where do you want to go?</h2><p>{REGION_LANGUAGES[region ?? ""] ?? "Ask in English."} Ratroo checks real routes and timetables instead of guessing.</p><div>{suggestionsFor(region, nearbyStops).map(suggestion => <button type="button" key={suggestion} onClick={() => void send(suggestion)}>{suggestion}<span>→</span></button>)}</div></section>}
        {messages.map(message => <article className={`assistant-message ${message.role}`} key={message.id}>
          <div>{message.text.split("\n").map(linkedLine)}</div>
          {message.role === "assistant" && Boolean(message.toolCalls?.length) && <small><span>✓</span>{message.toolCalls?.includes("nearby_stops") ? " From live nearby data" : " From live route data"}</small>}
        </article>)}
        {busy && <article className="assistant-message assistant thinking"><div><span /><span /><span /></div><small>Checking routes and timetables…</small></article>}
        {error && <div className="assistant-error" role="alert">{error}<button type="button" onClick={() => setError("")}>×</button></div>}
      </div>
      <form className="assistant-composer" onSubmit={submit}>
        <textarea ref={inputRef} value={input} onChange={event => setInput(event.target.value)} onKeyDown={onKeyDown} maxLength={500} rows={1} placeholder="Ask: How do I get to…" aria-label="Ask Ratroo a journey question" />
        <button type="submit" disabled={busy || input.trim().length < 2} aria-label="Send question">↑</button>
        <small>Enter to send · Shift + Enter for a new line</small>
      </form>
    </aside>}
  </>;
}
