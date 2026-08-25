"use client";

import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import StopMapPicker from "./StopMapPicker";

type Vehicle = { id: string; registrationNumber: string; vehicleType: string; displayName?: string; reviewState: string; reviewNote?: string };
type Stop = { stopName: string; latitude?: number; longitude?: number; departureTime?: string };
type StopSuggestion = { id: string; name: string; subtitle: string; mode: string; latitude?: number; longitude?: number };
type Route = { id: string; name: string; vehicleType: string; publishState: string; reviewNote?: string; stops?: Stop[] };
type Operator = { id: string; name: string; contactPhone?: string; status: string; reviewNote?: string };

function deepest<T>(value: unknown): T {
  let current = value;
  for (let index = 0; index < 4; index += 1) {
    if (current && typeof current === "object" && "data" in current) current = (current as { data: unknown }).data;
  }
  return current as T;
}

async function api(path: string, init?: RequestInit) {
  const response = await fetch(`/api/rider/${path}`, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((payload as { message?: string }).message || "Something went wrong.");
  return deepest(payload);
}

const statusCopy: Record<string, [string, string]> = {
  DRAFT: ["Not sent yet", "Finish the stops, then tap Send for checking."],
  SUBMITTED: ["Checking now", "Ratroo admin is checking your details."],
  NEEDS_CHANGES: ["Please fix", "Read the note, update it, and send again."],
  PUBLISHED: ["Live in Ratroo", "Riders can now discover this service."],
  WITHDRAWN: ["Hidden", "This service is not visible to riders."],
};

function oauthErrorMessage() {
  if (typeof window === "undefined") return "";
  const error = new URLSearchParams(window.location.search).get("oauth_error");
  if (!error) return "";
  const messages: Record<string, string> = {
    cancelled: "Google sign-in was cancelled.",
    not_configured: "Google sign-in is not configured yet.",
    invalid_state: "That sign-in request expired. Please try again.",
    token_exchange: "Google could not complete sign-in. Please try again.",
    backend_rejected: "Ratroo could not connect that Google account.",
    temporarily_unavailable: "Google sign-in is temporarily unavailable.",
  };
  return messages[error] || "Google sign-in could not be completed.";
}

function StopSearchInput({ index, stop, label, placeholder, onChange, onSelect }: {
  index: number;
  stop: Stop;
  label: string;
  placeholder: string;
  onChange: (value: string) => void;
  onSelect: (suggestion: StopSuggestion) => void;
}) {
  const [suggestions, setSuggestions] = useState<StopSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const skipNextSearch = useRef(false);

  useEffect(() => {
    if (skipNextSearch.current) {
      skipNextSearch.current = false;
      return;
    }
    const query = stop.stopName.trim();
    if (query.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ q: query, region: "all" });
        const response = await fetch(`/api/suggestions?${params}`, { signal: controller.signal });
        const payload = await response.json() as { data?: StopSuggestion[] };
        setSuggestions(payload.data || []);
        setActiveIndex(-1);
        setOpen(true);
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setSuggestions([]);
          setOpen(true);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 280);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [stop.stopName]);

  function choose(suggestion: StopSuggestion) {
    skipNextSearch.current = true;
    onSelect(suggestion);
    setSuggestions([]);
    setOpen(false);
    setActiveIndex(-1);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!open) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex(current => Math.min(current + 1, suggestions.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex(current => Math.max(current - 1, 0));
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      choose(suggestions[activeIndex]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  const listId = `rider-stop-suggestions-${index}`;
  return (
    <label className="stop-search">
      <small>{label}</small>
      <input role="combobox" value={stop.stopName} required minLength={2} onChange={event => { const value = event.target.value; onChange(value); if (value.trim().length < 2) { setSuggestions([]); setOpen(false); setLoading(false); } }} onFocus={() => stop.stopName.trim().length >= 2 && setOpen(true)} onBlur={() => window.setTimeout(() => setOpen(false), 120)} onKeyDown={handleKeyDown} placeholder={placeholder} autoComplete="off" aria-autocomplete="list" aria-expanded={open} aria-controls={listId} />
      {open && <div className="stop-suggestions" id={listId} role="listbox">
        {loading && <div className="stop-suggestion-state">Searching Ratroo stops…</div>}
        {!loading && suggestions.length === 0 && <div className="stop-suggestion-state">No saved stop found. Keep this name and add a pin if you can.</div>}
        {!loading && suggestions.map((suggestion, suggestionIndex) => <button type="button" role="option" aria-selected={activeIndex === suggestionIndex} className={activeIndex === suggestionIndex ? "active" : ""} key={`${suggestion.id}-${suggestionIndex}`} onMouseDown={event => event.preventDefault()} onClick={() => choose(suggestion)}><span>{suggestion.mode?.charAt(0) || "S"}</span><span><strong>{suggestion.name}</strong><small>{suggestion.subtitle}</small></span><b>{suggestion.latitude != null && suggestion.longitude != null ? "Map ✓" : "Select"}</b></button>)}
        <p>Ratroo transit data · Use ↑↓ and Enter</p>
      </div>}
    </label>
  );
}

/**
 * Vehicle art, shared with the rider home tiles and the admin review console.
 *
 * Replaces "▰" for Bus and "●" for everything else — which meant an operator
 * picking their vehicle saw four identical dots and had to read the label to
 * tell an auto from a shared taxi. This is the first thing a driver does when
 * registering, often on a phone, so it should be recognisable at a glance.
 *
 * Keys are the backend VehicleType enum
 * (modules/operators/domain/vehicle-type.ts). Anything unmapped keeps the old
 * glyph rather than guessing a picture.
 */
const VEHICLE_ART: Record<string, string> = {
  BUS: "/modes/mode_bus.png",
  // No distinct minibus art yet; the bus reads closer than a bare dot.
  MINIBUS: "/modes/mode_bus.png",
  AUTO: "/modes/auto.png",
  E_RICKSHAW: "/modes/e-riska.png",
  SHARED_TAXI: "/modes/taxi.png",
  FERRY: "/modes/mode_ferry.png",
  TRAM: "/modes/mode_tram.png",
};

export default function RiderPortal() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [operator, setOperator] = useState<Operator | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(oauthErrorMessage);
  const [stops, setStops] = useState<Stop[]>([{ stopName: "" }, { stopName: "" }]);
  const [mapStopIndex, setMapStopIndex] = useState<number | null>(null);

  const completed = useMemo(() => [Boolean(operator), vehicles.length > 0, routes.length > 0, routes.some(route => route.publishState === "SUBMITTED" || route.publishState === "PUBLISHED")], [operator, vehicles, routes]);

  async function load() {
    try {
      const mine = await api("operators/me") as Operator | null;
      setSignedIn(true);
      setOperator(mine);
      if (mine) {
        const [fleet, services] = await Promise.all([api("operators/me/vehicles"), api("operators/me/routes")]);
        setVehicles(fleet as Vehicle[]);
        setRoutes(services as Route[]);
      }
    } catch (error) {
      if ((error as Error).message.toLowerCase().includes("sign in")) setSignedIn(false);
      else setSignedIn(false);
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("oauth_error") || params.has("oauth")) window.history.replaceState({}, "", "/rider");
    queueMicrotask(() => void load());
  }, []);

  async function saveOperator(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const body = Object.fromEntries(new FormData(event.currentTarget));
      await api("operators", { method: "POST", body: JSON.stringify(body) });
      await load(); setStep(2); setMessage("Your operator profile is saved.");
    } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }

  async function saveVehicle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const form = new FormData(event.currentTarget);
      const body = Object.fromEntries(form);
      if (body.seatCapacity) body.seatCapacity = Number(body.seatCapacity) as never;
      await api("operators/me/vehicles", { method: "POST", body: JSON.stringify(body) });
      await load(); setStep(3); setMessage("Vehicle saved. Now tell us where it goes.");
    } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }

  async function saveRoute(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const form = new FormData(event.currentTarget);
      const body = {
        name: String(form.get("name")), vehicleType: String(form.get("vehicleType")),
        vehicleId: String(form.get("vehicleId") || "") || undefined,
        fareINR: form.get("fareINR") ? Number(form.get("fareINR")) : undefined,
        notes: String(form.get("notes") || "") || undefined,
        stops: stops.map(stop => ({ ...stop, stopName: stop.stopName.trim() })),
      };
      await api("operators/me/routes", { method: "POST", body: JSON.stringify(body) });
      await load(); setStep(4); setMessage("Route saved. Check it once, then send it for approval.");
    } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }

  async function submitRoute(routeId: string) {
    setBusy(true); setMessage("");
    try {
      await api(`operators/me/routes/${routeId}/publish-state`, { method: "PUT", body: JSON.stringify({ publishState: "SUBMITTED" }) });
      await load(); setMessage("Sent! Ratroo admin will check your operator, vehicle, stops and route.");
    } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }

  if (signedIn === null) return <main className="rider-loading"><span>R</span><p>Opening Ratroo Rider…</p></main>;

  if (!signedIn) return (
    <main className="rider-auth">
      <section className="rider-auth-story"><Link href="/" className="rider-brand"><b>R</b> ratroo rider</Link><p className="eyebrow">For local transport partners</p><h1>Your route can help <em>thousands</em> travel better.</h1><p>Add your bus, auto, e-rickshaw or shared taxi in four simple steps. We check everything before riders see it.</p><div className="auth-promise"><span>1</span> Register <i>→</i><span>2</span> Add vehicle <i>→</i><span>3</span> Add stops <i>→</i><span>4</span> Send</div></section>
      <section className="rider-auth-card">
        <p className="eyebrow">Verified rider access</p><h2>Continue with Google</h2>
        <p className="oauth-only-copy">Every Rider account must use a real Google account. Email-and-password registration is not accepted.</p>
        {message && <p className="form-message error">{message}</p>}
        <Link className="oauth-button oauth-button-primary" href="/api/rider/oauth/google/start" prefetch={false}><span>G</span> Verify and continue with Google →</Link>
        <div className="oauth-trust"><b>Google verifies your email account.</b><span>Ratroo admin will separately review your operator, vehicle, stops and routes before anything is published.</span></div>
      </section>
    </main>
  );

  return (
    <main className="rider-shell">
      <header><Link href="/" className="rider-brand"><b>R</b> ratroo rider</Link><div><span className="secure-dot" /> Your details are private until approved</div><button onClick={async () => { await fetch("/api/rider/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "logout" }) }); location.reload(); }}>Sign out</button></header>
      <section className="rider-intro"><div><p className="eyebrow">Partner registration</p><h1>Put your local service <em>on the map.</em></h1></div><p>Complete one small step at a time. You can stop and return later.</p></section>
      <nav className="rider-steps" aria-label="Registration steps">
        {["About you", "Your vehicle", "Stops & route", "Send for checking"].map((label, index) => <button key={label} className={step === index + 1 ? "active" : completed[index] ? "done" : ""} onClick={() => setStep(index + 1)}><span>{completed[index] ? "✓" : index + 1}</span><small>Step {index + 1}</small><b>{label}</b></button>)}
      </nav>
      {message && <div className="rider-notice">{message}</div>}
      <section className="rider-workspace">
        <aside><p className="eyebrow">Why we ask</p><h2>{step === 1 ? "Help us know who runs the service." : step === 2 ? "Help riders identify the right vehicle." : step === 3 ? "Tell us the real path you drive every day." : "Nothing goes live without a human check."}</h2><p>{step === 3 ? "Choose a suggestion, then use the map to check or adjust the exact stop. You can do this from home." : "Your contact details are used for verification and are not shown publicly."}</p></aside>
        <div className="rider-form-card">
          {step === 1 && (operator ? <div className="saved-card"><span>✓</span><p><small>Operator profile</small><strong>{operator.name}</strong><em className={`state ${operator.status.toLowerCase()}`}>{operator.status === "VERIFIED" ? "Verified" : operator.status === "SUSPENDED" ? "Needs attention" : "Waiting for admin check"}</em>{operator.reviewNote && <q>{operator.reviewNote}</q>}</p><button onClick={() => setStep(2)}>Continue →</button></div> : <form onSubmit={saveOperator}><h2>Tell us about you</h2><label>Service or owner name<input name="name" required minLength={2} placeholder="Example: Maa Tara Bus Service" /></label><label>Phone number<input name="contactPhone" inputMode="tel" placeholder="+91 98765 43210" /></label><label>Contact email<input name="contactEmail" type="email" placeholder="Optional" /></label><button className="primary" disabled={busy}>Save and continue →</button></form>)}
          {step === 2 && <><form onSubmit={saveVehicle}><h2>Add a vehicle</h2><fieldset><legend>What do you drive?</legend><div className="vehicle-choices">{[["BUS","Bus"],["MINIBUS","Mini bus"],["AUTO","Auto"],["E_RICKSHAW","E-rickshaw"],["SHARED_TAXI","Shared taxi"]].map(([value,label]) => <label key={value}><input type="radio" name="vehicleType" value={value} required /><span>{VEHICLE_ART[value] ? <img src={VEHICLE_ART[value]} alt="" width={62} height={62} loading="lazy" decoding="async" /> : label === "Bus" ? "▰" : "●"}</span><b>{label}</b></label>)}</div></fieldset><label>Registration number<input name="registrationNumber" required minLength={4} placeholder="WB 04 AB 1234" /></label><div className="two"><label>Name painted on vehicle<input name="displayName" placeholder="Optional" /></label><label>Seats<input name="seatCapacity" type="number" min={1} max={200} inputMode="numeric" placeholder="Optional" /></label></div><button className="primary" disabled={busy}>Add this vehicle →</button></form>{vehicles.length > 0 && <div className="mini-list"><h3>Saved vehicles</h3>{vehicles.map(vehicle => <div key={vehicle.id}><b>{vehicle.displayName || vehicle.registrationNumber}</b><span>{vehicle.vehicleType.replaceAll("_", " ")} · {vehicle.reviewState === "APPROVED" ? "Approved" : "Waiting for check"}</span></div>)}</div>}</>}
          {step === 3 && <form onSubmit={saveRoute}><h2>Add the stops you serve</h2><label>Route name<input name="name" required minLength={3} placeholder="Example: Garia to Baruipur" /></label><div className="two"><label>Vehicle type<select name="vehicleType" required defaultValue={vehicles[0]?.vehicleType || "BUS"}>{["BUS","MINIBUS","AUTO","E_RICKSHAW","SHARED_TAXI"].map(value => <option key={value}>{value}</option>)}</select></label><label>Use vehicle<select name="vehicleId" defaultValue={vehicles[0]?.id || ""}><option value="">No fixed vehicle</option>{vehicles.map(vehicle => <option value={vehicle.id} key={vehicle.id}>{vehicle.registrationNumber}</option>)}</select></label></div><div className="stops-editor"><div className="stops-title"><h3>Stops in driving order</h3><span>{stops.length} stops</span></div>{stops.map((stop,index) => <div className="stop-row" key={index}><span>{index + 1}</span><StopSearchInput index={index} stop={stop} label={index === 0 ? "Starting stand / stop" : index === stops.length - 1 ? "Last stop" : "Next stop"} placeholder={index === 0 ? "Search where you normally start" : "Search stop name"} onChange={value => setStops(rows => rows.map((row,rowIndex) => rowIndex === index ? { ...row, stopName: value, latitude: undefined, longitude: undefined } : row))} onSelect={suggestion => { setStops(rows => rows.map((row,rowIndex) => rowIndex === index ? { ...row, stopName: suggestion.name, latitude: suggestion.latitude, longitude: suggestion.longitude } : row)); setMessage(suggestion.latitude != null && suggestion.longitude != null ? `${suggestion.name} selected. Check the pin on the map if needed.` : `${suggestion.name} selected. Choose its exact point on the map.`); }} /><button type="button" className={stop.latitude ? "located" : "pin"} onClick={() => setMapStopIndex(index)} title="Choose this stop on the map">{stop.latitude ? "✓ Map" : "⌖ Map"}</button>{stops.length > 2 && <button type="button" className="remove" onClick={() => setStops(rows => rows.filter((_,rowIndex) => rowIndex !== index))}>×</button>}</div>)}<button type="button" className="add-stop" onClick={() => setStops(rows => [...rows, { stopName: "" }])}>＋ Add another stop</button></div><div className="two"><label>Full route fare (₹)<input name="fareINR" type="number" min={0} inputMode="numeric" placeholder="Optional" /></label><label>Extra note<input name="notes" placeholder="Example: Every 30 minutes" /></label></div><button className="primary" disabled={busy}>Save this route →</button></form>}
          {step === 4 && <div><h2>Check and send</h2><p className="review-explainer">Ratroo checks the owner, vehicle, stops and service. Only approved routes become visible in the journey planner.</p>{routes.length === 0 ? <div className="empty">No route saved yet.<button onClick={() => setStep(3)}>Add your first route</button></div> : <div className="route-list">{routes.map(route => { const copy = statusCopy[route.publishState] || [route.publishState, ""]; return <article key={route.id}><div><span className={`route-state ${route.publishState.toLowerCase()}`}>{copy[0]}</span><h3>{route.name}</h3><p>{route.stops?.map(stop => stop.stopName).join(" → ")}</p><small>{copy[1]}</small>{route.reviewNote && <q>Admin note: {route.reviewNote}</q>}</div>{["DRAFT","NEEDS_CHANGES","WITHDRAWN"].includes(route.publishState) && <button className="primary compact" disabled={busy} onClick={() => submitRoute(route.id)}>Send for checking →</button>}</article>})}</div>}</div>}
        </div>
      </section>
      {mapStopIndex != null && stops[mapStopIndex] && <StopMapPicker stopName={stops[mapStopIndex].stopName} latitude={stops[mapStopIndex].latitude} longitude={stops[mapStopIndex].longitude} onClose={() => setMapStopIndex(null)} onConfirm={selection => { const selectedStop = stops[mapStopIndex]; setStops(rows => rows.map((row, rowIndex) => rowIndex === mapStopIndex ? { ...row, ...selection, stopName: selection.stopName || row.stopName } : row)); setMapStopIndex(null); setMessage(`${selection.stopName || selectedStop.stopName || "Stop"} pinned on the map.`); }} />}
      <footer><b>Ratroo Rider</b><span>Built for the people who keep our cities moving.</span><Link href="/">Open public journey planner ↗</Link></footer>
    </main>
  );
}
