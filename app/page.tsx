"use client";

import { FormEvent, useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

type JourneyLeg = {
  legNumber: number;
  mode: string;
  fromName: string;
  toName: string;
  distanceKm: string;
  durationMinutes: number;
  serviceName?: string;
  departureTime?: string | null;
  arrivalTime?: string | null;
  instructions: string;
};

type Journey = {
  fromInput: string;
  toInput: string;
  legs: JourneyLeg[];
  totalDistanceKm: string;
  totalDurationMinutes: number;
  transfersCount: number;
  totalFare?: number | null;
  fareIncomplete?: boolean;
  confidenceScore: number;
  confidenceBadges: string[];
};

const API_URL = (process.env.NEXT_PUBLIC_RATROO_API_URL || "https://ratroo-backend-sams-projects-83758424.vercel.app/v1").replace(/\/$/, "");

const transportModes = [
  { icon: "B", name: "Bus", detail: "City and district routes", color: "blue" },
  { icon: "R", name: "Rail", detail: "Suburban connections", color: "violet" },
  { icon: "F", name: "Ferry", detail: "River crossings", color: "cyan" },
  { icon: "T", name: "Tram", detail: "Kolkata heritage network", color: "pink" },
];

function unwrapJourney(payload: unknown): Journey {
  const body = payload as { data?: unknown; success?: boolean; message?: string };
  const data = (body?.data ?? body) as Journey;
  if (!data?.legs || !Array.isArray(data.legs)) throw new Error(body?.message || "No journey was returned.");
  return data;
}

export default function Home() {
  const pageRef = useRef<HTMLElement>(null);
  const resultRef = useRef<HTMLElement>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [journey, setJourney] = useState<Journey | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState("");

  useLayoutEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;
    const context = gsap.context(() => {
      gsap.from("[data-hero-reveal]", { y: 26, opacity: 0, duration: 0.85, stagger: 0.1, ease: "power3.out" });
      gsap.from(".hero-visual", { x: 36, opacity: 0, duration: 1, delay: 0.25, ease: "power3.out" });
      gsap.to(".bus-orbit", { y: -9, rotation: 1, duration: 2.1, repeat: -1, yoyo: true, ease: "sine.inOut" });
      gsap.utils.toArray<HTMLElement>("[data-scroll-reveal]").forEach((element) => {
        gsap.from(element, { scrollTrigger: { trigger: element, start: "top 84%" }, y: 28, opacity: 0, duration: 0.75, ease: "power2.out" });
      });
    }, pageRef);
    return () => context.revert();
  }, []);

  async function planJourney(event: FormEvent) {
    event.preventDefault();
    if (!from.trim() || !to.trim()) {
      setStatus("error");
      setMessage("Enter both your starting point and destination.");
      return;
    }
    setStatus("loading");
    setJourney(null);
    setMessage("");
    try {
      const response = await fetch(`${API_URL}/journey`, {
        method: "POST",
        credentials: "omit",
        headers: { "Accept": "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ from: from.trim(), to: to.trim() }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const details = payload as { message?: string; error?: { message?: string } };
        throw new Error(details.message || details.error?.message || "Ratroo could not plan this journey yet.");
      }
      setJourney(unwrapJourney(payload));
      setStatus("idle");
      window.setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 60);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error && !error.message.includes("fetch")
        ? error.message
        : "The journey service is taking a break. Please try again shortly.");
    }
  }

  return (
    <main ref={pageRef}>
      <header className="nav-shell">
        <a className="brand" href="#top" aria-label="Ratroo home"><span className="brand-mark">R</span><span>ratroo</span></a>
        <nav aria-label="Main navigation"><a href="#plan">Plan a journey</a><a href="#coverage">Coverage</a><a href="#how-it-works">How it works</a></nav>
        <a className="nav-cta" href="#plan">Start exploring</a>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow" data-hero-reveal><span /> Public transport, made human</p>
          <h1 data-hero-reveal>Know the way.<br /><em>Enjoy the ride.</em></h1>
          <p className="lede" data-hero-reveal>Plan dependable journeys across India with clear routes, honest confidence scores, and no account required.</p>
          <form className="planner-card" id="plan" onSubmit={planJourney} data-hero-reveal>
            <div className="planner-row">
              <label><span>FROM</span><input value={from} onChange={(event) => setFrom(event.target.value)} placeholder="Esplanade, Kolkata" aria-label="Starting point" /></label>
              <button className="swap" type="button" aria-label="Swap origin and destination" onClick={() => { setFrom(to); setTo(from); }}>↕</button>
              <label><span>TO</span><input value={to} onChange={(event) => setTo(event.target.value)} placeholder="Dakshineswar" aria-label="Destination" /></label>
              <button className="plan-button" type="submit" disabled={status === "loading"}>{status === "loading" ? "Planning…" : <>Find my route <span>→</span></>}</button>
            </div>
            <p className="privacy-note"><span>✓</span> No login. No tracking. Just your route.</p>
          </form>
          {status === "error" && <div className="form-message" role="alert"><strong>We couldn’t plan that trip.</strong><span>{message}</span></div>}
        </div>

        <div className="hero-visual" aria-label="Stylized map showing a Ratroo journey">
          <div className="sun" /><div className="route-line route-one" /><div className="route-line route-two" />
          <div className="place-card place-card-top"><span>07:42</span><strong>Esplanade</strong><small>Bus arriving · 3 min</small></div>
          <div className="bus-orbit">BUS <strong>12C</strong></div>
          <div className="place-card place-card-bottom"><span>08:18</span><strong>Dakshineswar</strong><small>On time · High confidence</small></div>
        </div>
      </section>

      {journey && (
        <section className="journey-result" ref={resultRef} aria-live="polite">
          <div className="result-heading"><div><p className="eyebrow"><span /> Recommended journey</p><h2>{journey.fromInput} <b>→</b> {journey.toInput}</h2></div><div className="confidence"><strong>{Math.round(journey.confidenceScore * 100)}%</strong><span>route confidence</span></div></div>
          <div className="journey-summary"><div><strong>{journey.totalDurationMinutes}</strong><span>minutes</span></div><div><strong>{journey.totalDistanceKm}</strong><span>distance</span></div><div><strong>{journey.transfersCount}</strong><span>{journey.transfersCount === 1 ? "transfer" : "transfers"}</span></div><div><strong>{journey.totalFare != null ? `₹${journey.totalFare}${journey.fareIncomplete ? "+" : ""}` : "—"}</strong><span>estimated fare</span></div></div>
          <ol className="legs">{journey.legs.map((leg) => <li key={`${leg.legNumber}-${leg.toName}`}><span className={`leg-icon ${leg.mode.toLowerCase()}`}>{leg.mode.charAt(0)}</span><div><small>{leg.departureTime || `${leg.durationMinutes} min`} · {leg.mode.replace("_", " ")}</small><strong>{leg.serviceName || leg.instructions}</strong><p>{leg.fromName} <b>→</b> {leg.toName}</p></div></li>)}</ol>
          <p className="data-note">{journey.confidenceBadges?.join(" · ") || "Ratroo canonical transit data"}</p>
        </section>
      )}

      <section className="trust-strip" aria-label="Ratroo benefits" data-scroll-reveal>
        <div><strong>4</strong><span>Ways to move<br />Bus · Rail · Ferry · Tram</span></div><div><strong>2</strong><span>Launch regions<br />West Bengal · Bengaluru</span></div><div><strong>0</strong><span>Sign-ups needed<br />Open to every rider</span></div>
      </section>

      <section className="mode-section" id="coverage" data-scroll-reveal>
        <div className="section-copy"><p className="eyebrow"><span /> One journey, every mode</p><h2>Move beyond<br /><em>the obvious route.</em></h2><p>Ratroo joins fragmented transport information into one calm, practical plan—from a district bus to a river ferry.</p></div>
        <div className="mode-grid">{transportModes.map((mode) => <article key={mode.name} className="mode-card"><span className={`mode-icon ${mode.color}`}>{mode.icon}</span><div><h3>{mode.name}</h3><p>{mode.detail}</p></div><b>↗</b></article>)}</div>
      </section>

      <section className="how-section" id="how-it-works" data-scroll-reveal>
        <div className="how-intro"><p className="eyebrow"><span /> Built on honest data</p><h2>Confidence,<br />not guesswork.</h2></div>
        <div className="principles"><article><span>01</span><h3>Official when possible</h3><p>We start with operator and government sources, then map every provider into one clear system.</p></article><article><span>02</span><h3>Honest when incomplete</h3><p>Freshness and confidence labels show what we know—and what still needs local verification.</p></article><article><span>03</span><h3>Community-powered</h3><p>Riders, conductors, depots, and volunteers help close the gaps that official data cannot.</p></article></div>
      </section>

      <section className="final-cta" data-scroll-reveal><p>YOUR NEXT JOURNEY</p><h2>India moves in many ways.<br /><em>Ratroo brings them together.</em></h2><a href="#plan">Plan a public journey <span>→</span></a></section>
      <footer><a className="brand" href="#top"><span className="brand-mark">R</span><span>ratroo</span></a><p>Public transport, made human.</p><span>© 2026 Ratroo</span></footer>
    </main>
  );
}
