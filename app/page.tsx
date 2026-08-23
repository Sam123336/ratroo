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

type SupportedRegion = "kolkata" | "bengaluru";
type LocationState = {
  region: SupportedRegion | "unsupported";
  name: string;
  address: string;
  latitude?: number;
  longitude?: number;
  modes: string[];
};

const modesByRegion = {
  kolkata: [
    { icon: "B", name: "Bus", detail: "WBTC and city routes", color: "blue" },
    { icon: "M", name: "Metro", detail: "Kolkata Metro network", color: "violet" },
    { icon: "F", name: "Ferry", detail: "Hooghly river crossings", color: "cyan" },
    { icon: "T", name: "Tram", detail: "Kolkata heritage network", color: "pink" },
    { icon: "R", name: "Rail", detail: "Suburban connections", color: "green" },
  ],
  bengaluru: [
    { icon: "B", name: "Bus", detail: "BMTC city services", color: "blue" },
    { icon: "M", name: "Metro", detail: "Namma Metro / BMRCL", color: "violet" },
  ],
};

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
  const [locationStatus, setLocationStatus] = useState<"idle" | "loading" | "error">("idle");
  const [location, setLocation] = useState<LocationState | null>(null);
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

  function chooseRegion(region: SupportedRegion) {
    const isKolkata = region === "kolkata";
    setLocation({
      region,
      name: isKolkata ? "Kolkata" : "Bengaluru",
      address: isKolkata ? "Kolkata, West Bengal" : "Bengaluru, Karnataka",
      modes: modesByRegion[region].map((mode) => mode.name.toUpperCase()),
    });
    setFrom("");
    setJourney(null);
    setLocationStatus("idle");
    setMessage("");
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      setLocationStatus("error");
      setMessage("This browser does not support location access. Choose your city instead.");
      return;
    }
    setLocationStatus("loading");
    setMessage("");
    navigator.geolocation.getCurrentPosition(async (position) => {
      try {
        const params = new URLSearchParams({ lat: String(position.coords.latitude), lng: String(position.coords.longitude) });
        const response = await fetch(`/api/location?${params}`);
        const data = await response.json() as LocationState & { message?: string };
        if (!response.ok) throw new Error(data.message || "We could not resolve this location.");
        setLocation(data);
        setFrom(data.address);
        setJourney(null);
        setLocationStatus("idle");
        if (data.region === "unsupported") {
          setStatus("error");
          setMessage("Ratroo currently plans journeys in Kolkata and Bengaluru. Choose either city to explore its network.");
        } else {
          setStatus("idle");
        }
      } catch (error) {
        setLocationStatus("error");
        setMessage(error instanceof Error ? error.message : "We could not resolve this location.");
      }
    }, (error) => {
      setLocationStatus("error");
      setMessage(error.code === error.PERMISSION_DENIED
        ? "Location permission was not allowed. Choose Kolkata or Bengaluru instead."
        : "Your location is unavailable right now. Choose your city instead.");
    }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 });
  }

  async function planJourney(event: FormEvent) {
    event.preventDefault();
    if (!location || location.region === "unsupported") {
      setStatus("error");
      setMessage("Use your location or choose Kolkata or Bengaluru first.");
      return;
    }
    if (!from.trim() || !to.trim()) {
      setStatus("error");
      setMessage("Enter both your starting point and destination.");
      return;
    }
    setStatus("loading");
    setJourney(null);
    setMessage("");
    try {
      const response = await fetch("/api/journey", {
        method: "POST",
        credentials: "omit",
        headers: { "Accept": "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ from: from.trim(), to: to.trim(), region: location.region }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const details = payload as { message?: string; detail?: string; error?: { message?: string } };
        throw new Error(details.message || details.error?.message || details.detail || "Ratroo could not plan this journey yet.");
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
          <p className="lede" data-hero-reveal>Plan dependable journeys in Kolkata and Bengaluru with clear routes, honest confidence scores, and no account required.</p>
          <div className="location-panel" data-hero-reveal>
            <button className="locate-button" type="button" onClick={useMyLocation} disabled={locationStatus === "loading"}>
              <span className="location-pulse" /> {locationStatus === "loading" ? "Finding your location…" : "Use my current location"}
            </button>
            <span>or</span>
            <div className="city-switch" aria-label="Choose a supported city">
              <button type="button" className={location?.region === "kolkata" ? "active" : ""} onClick={() => chooseRegion("kolkata")}>Kolkata</button>
              <button type="button" className={location?.region === "bengaluru" ? "active" : ""} onClick={() => chooseRegion("bengaluru")}>Bengaluru</button>
            </div>
          </div>
          {location && <div className={`location-result ${location.region}`} data-hero-reveal><span>●</span><div><small>{location.region === "unsupported" ? "CURRENT LOCATION · NOT COVERED YET" : `CURRENT LOCATION · ${location.name.toUpperCase()}`}</small><strong>{location.address}</strong></div></div>}
          <form className="planner-card" id="plan" onSubmit={planJourney} data-hero-reveal>
            <div className="planner-row">
              <label><span>FROM</span><input value={from} onChange={(event) => setFrom(event.target.value)} placeholder={location?.region === "bengaluru" ? "Majestic" : "Esplanade, Kolkata"} aria-label="Starting point" /></label>
              <button className="swap" type="button" aria-label="Swap origin and destination" onClick={() => { setFrom(to); setTo(from); }}>↕</button>
              <label><span>TO</span><input value={to} onChange={(event) => setTo(event.target.value)} placeholder={location?.region === "bengaluru" ? "Indiranagar" : "Dakshineswar"} aria-label="Destination" /></label>
              <button className="plan-button" type="submit" disabled={status === "loading"}>{status === "loading" ? "Planning…" : <>Find my route <span>→</span></>}</button>
            </div>
            <p className="privacy-note"><span>✓</span> No login. Location is used only to choose the right city network.</p>
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
        <div><strong>{location?.region === "kolkata" ? "5" : location?.region === "bengaluru" ? "2" : "—"}</strong><span>Modes near you<br />{location?.region === "kolkata" ? "Bus · Metro · Ferry · Tram · Rail" : location?.region === "bengaluru" ? "BMTC Bus · Namma Metro" : "Choose a city to see its network"}</span></div><div><strong>2</strong><span>Launch cities<br />Kolkata · Bengaluru</span></div><div><strong>0</strong><span>Sign-ups needed<br />Open to every rider</span></div>
      </section>

      <section className="mode-section" id="coverage" data-scroll-reveal>
        <div className="section-copy"><p className="eyebrow"><span /> Your local network</p><h2>{location?.region === "kolkata" ? <>Kolkata moves<br /><em>every way.</em></> : location?.region === "bengaluru" ? <>Bengaluru,<br /><em>connected.</em></> : <>Choose a city.<br /><em>See what moves.</em></>}</h2><p>{location?.region === "kolkata" ? "Only Kolkata riders see the city’s bus, Metro, ferry, tram, and suburban rail network." : location?.region === "bengaluru" ? "Bengaluru journeys use the backend’s BMTC and BMRCL datasets—without showing Kolkata-only services." : "Share your location or choose a city. Ratroo will show only transport modes supported in that region."}</p></div>
        {location && location.region !== "unsupported" ? <div className="mode-grid">{modesByRegion[location.region].map((mode) => <article key={mode.name} className="mode-card"><span className={`mode-icon ${mode.color}`}>{mode.icon}</span><div><h3>{mode.name}</h3><p>{mode.detail}</p></div><b>↗</b></article>)}</div> : <div className="coverage-empty"><span className="location-pulse" /><h3>Find your local network</h3><p>Use your location above, or choose Kolkata or Bengaluru manually.</p><a href="#plan">Choose a city ↑</a></div>}
      </section>

      <section className="how-section" id="how-it-works" data-scroll-reveal>
        <div className="how-intro"><p className="eyebrow"><span /> Built on honest data</p><h2>Confidence,<br />not guesswork.</h2></div>
        <div className="principles"><article><span>01</span><h3>Official when possible</h3><p>We start with operator and government sources, then map every provider into one clear system.</p></article><article><span>02</span><h3>Honest when incomplete</h3><p>Freshness and confidence labels show what we know—and what still needs local verification.</p></article><article><span>03</span><h3>Community-powered</h3><p>Riders, conductors, depots, and volunteers help close the gaps that official data cannot.</p></article></div>
      </section>

      <section className="final-cta" data-scroll-reveal><p>YOUR NEXT JOURNEY</p><h2>India moves in many ways.<br /><em>Ratroo brings them together.</em></h2><a href="#plan">Plan a public journey <span>→</span></a></section>
      <footer><a className="brand" href="#top"><span className="brand-mark">R</span><span>ratroo</span></a><p>Public transport, made human. Address data © OpenStreetMap contributors.</p><span>© 2026 Ratroo</span></footer>
    </main>
  );
}
