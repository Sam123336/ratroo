"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  toolCalls?: string[];
};

type Props = {
  latitude?: number;
  longitude?: number;
  locationLabel?: string;
};

// Bumped after removing historically saved West-Bengal-only replies for
// Bengaluru questions. Old answers must not survive a corrected deployment.
const STORAGE_KEY = "ratroo.public-assistant.v2";
const SUGGESTIONS = [
  "How do I get to Digha from here?",
  "ekhan theke Bongaon kivabe jabo?",
  "How do I get from Sealdah to Bongaon?",
];

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

export default function PublicAssistant({ latitude, longitude, locationLabel }: Props) {
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
        body: JSON.stringify({ question, lat: latitude, lng: longitude }),
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
      <div className="assistant-context"><span className={latitude != null ? "live" : ""}>●</span>{latitude != null ? `Planning from ${locationLabel || "your current location"}` : "Add your starting place in the question"}</div>
      <div className="assistant-messages" ref={scrollRef} aria-live="polite">
        {!messages.length && <section className="assistant-intro"><div className="assistant-orbit">AI<span /></div><h2>Where do you want to go?</h2><p>Ask in English or Bengali. Ratroo checks real routes and timetables instead of guessing.</p><div>{SUGGESTIONS.map(suggestion => <button type="button" key={suggestion} onClick={() => void send(suggestion)}>{suggestion}<span>→</span></button>)}</div></section>}
        {messages.map(message => <article className={`assistant-message ${message.role}`} key={message.id}>
          <div>{message.text.split("\n").map(linkedLine)}</div>
          {message.role === "assistant" && Boolean(message.toolCalls?.length) && <small><span>✓</span> From live route data</small>}
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
