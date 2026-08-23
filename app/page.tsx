"use client";

import { FormEvent, KeyboardEvent, lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type { MappedRoute, NearbyStop } from "./components/TransitMap";
import PublicAssistant from "./components/PublicAssistant";

const TransitMap = lazy(() => import("./components/TransitMap"));

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
  routeId?: string;
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

/**
 * Show the city picker, or leave coverage entirely to the backend polygon.
 *
 * Set to false and the picker disappears: location is detected from GPS alone,
 * which is the original behaviour. Set to true and someone can name their city
 * instead — useful when location permission is refused, and the error copy
 * already told people to "choose Kolkata or Bengaluru" long before there was
 * anything to choose.
 *
 * A picked city still resolves through /api/location, so this changes which
 * point gets looked up, never what coverage is claimed for it.
 */
const REGION_PICKER_ENABLED = true;

/** Where a named city is looked up from. Coverage still comes from the backend. */
const SELECTABLE_CITIES = [
  { region: "kolkata", label: "Kolkata", latitude: 22.5726, longitude: 88.3639 },
  { region: "bengaluru", label: "Bengaluru", latitude: 12.9716, longitude: 77.5946 },
] as const;

type SupportedRegion = "kolkata" | "bengaluru";
type LocationState = {
  region: SupportedRegion | "unsupported";
  name: string;
  address: string;
  latitude?: number;
  longitude?: number;
  modes: string[];
  routeCount?: number;
  stopCount?: number;
  coverageMethod?: string;
  source?: "gps" | "origin";
};

type Suggestion = {
  id: string;
  name: string;
  type: string;
  mode: string;
  providerCode: string;
  subtitle: string;
  region?: SupportedRegion;
  latitude?: number;
  longitude?: number;
};

type NetworkItem = { id: string; title: string; subtitle: string };
const EMPTY_SUGGESTIONS: Suggestion[] = [];

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

function SplashScreen({ onFinish }: { onFinish: () => void }) {
  const splashRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const context = gsap.context(() => {
      if (reduced) {
        gsap.set(".splash-reveal", { opacity: 1 });
        const timer = window.setTimeout(onFinish, 450);
        return () => window.clearTimeout(timer);
      }

      const timeline = gsap.timeline({ defaults: { ease: "power3.out" }, onComplete: onFinish });
      timeline
        .from(".splash-mark", { scale: 0.55, rotation: -12, opacity: 0, duration: 0.6 })
        .from(".splash-name", { y: 24, opacity: 0, duration: 0.55 }, "-=0.28")
        .from(".splash-kicker", { y: 12, opacity: 0, duration: 0.4 }, "-=0.25")
        .from(".splash-route-track", { scaleX: 0, transformOrigin: "left center", duration: 0.72 }, "-=0.1")
        .from(".splash-stop", { scale: 0, opacity: 0, duration: 0.3, stagger: 0.13 }, "-=0.35")
        .fromTo(".splash-ride", { xPercent: -220, opacity: 0 }, { xPercent: 135, opacity: 1, duration: 0.9, ease: "power2.inOut" }, "-=0.35")
        .from(".splash-city, .splash-tagline, .splash-progress", { y: 12, opacity: 0, duration: 0.42, stagger: 0.08 }, "-=0.48")
        .to(".splash-progress span", { scaleX: 1, transformOrigin: "left center", duration: 0.65, ease: "power1.inOut" }, "-=0.34")
        .to(splashRef.current, { clipPath: "inset(0 0 100% 0)", duration: 0.8, ease: "power4.inOut" }, "+=0.12");
    }, splashRef);

    return () => context.revert();
  }, [onFinish]);

  return (
    <div className="ratroo-splash" ref={splashRef} role="status" aria-label="Ratroo is getting your journey ready">
      <button className="splash-skip" type="button" onClick={onFinish}>Skip intro <span>↗</span></button>
      <div className="splash-grid" aria-hidden="true" />
      <div className="splash-content">
        <p className="splash-kicker splash-reveal"><span /> Public transport, made human</p>
        <div className="splash-wordmark splash-reveal" aria-label="Ratroo">
          <span className="splash-mark">R</span><strong className="splash-name">ratroo</strong>
        </div>
        <div className="splash-route splash-reveal" aria-hidden="true">
          <div className="splash-route-track" />
          <span className="splash-stop splash-stop-one" />
          <span className="splash-stop splash-stop-two" />
          <span className="splash-stop splash-stop-three" />
          <span className="splash-ride">RIDE <b>→</b></span>
        </div>
        <div className="splash-cities splash-reveal"><span className="splash-city">Kolkata</span><i>connecting</i><span className="splash-city">Bengaluru</span></div>
        <p className="splash-tagline splash-reveal">Know the way. <em>Enjoy the ride.</em></p>
        <div className="splash-progress splash-reveal" aria-hidden="true"><span /></div>
      </div>
      <p className="splash-foot splash-reveal">NO LOGIN · LIVE TRANSIT · OPEN TO EVERY RIDER</p>
    </div>
  );
}

function SuggestionInput({
  field,
  value,
  placeholder,
  region,
  recommended = EMPTY_SUGGESTIONS,
  onChange,
  onSelect,
}: {
  field: "FROM" | "TO";
  value: string;
  placeholder: string;
  region: SupportedRegion | "all";
  recommended?: Suggestion[];
  onChange: (value: string) => void;
  onSelect: (suggestion: Suggestion) => void;
}) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const skipNextSearch = useRef(false);

  useEffect(() => {
    if (skipNextSearch.current) {
      skipNextSearch.current = false;
      setOpen(false);
      setLoading(false);
      return;
    }
    const query = value.trim();
    if (!query) {
      setSuggestions(recommended);
      setOpen(recommended.length > 0);
      setLoading(false);
      setActiveIndex(-1);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ q: query, region });
        const response = await fetch(`/api/suggestions?${params}`, { signal: controller.signal });
        const payload = await response.json() as { data?: Suggestion[] };
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
    }, 260);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [value, region, recommended]);

  function choose(suggestion: Suggestion) {
    skipNextSearch.current = true;
    onSelect(suggestion);
    setOpen(false);
    setSuggestions([]);
    setActiveIndex(-1);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!open) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, suggestions.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      choose(suggestions[activeIndex]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="autocomplete">
      <label>
        <span>{field}</span>
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onFocus={() => value.trim() && setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          aria-label={field === "FROM" ? "Starting point" : "Destination"}
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={`${field.toLowerCase()}-suggestions`}
          autoComplete="off"
        />
      </label>
      {open && (
        <div className="suggestions" id={`${field.toLowerCase()}-suggestions`} role="listbox">
          {loading && <div className="suggestion-status"><span className="mini-spinner" /> Searching {region === "all" ? "Kolkata and Bengaluru" : region === "kolkata" ? "Kolkata" : "Bengaluru"}…</div>}
          {!loading && suggestions.length === 0 && <div className="suggestion-status">No matching stops, stations, or routes.</div>}
          {!loading && !value.trim() && suggestions.length > 0 && <div className="suggestion-heading">Direct destinations from your selected stop</div>}
          {!loading && suggestions.map((suggestion, index) => (
            <button
              type="button"
              role="option"
              aria-selected={activeIndex === index}
              className={activeIndex === index ? "active" : ""}
              key={`${suggestion.id}-${index}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(suggestion)}
            >
              <span className={`suggestion-icon ${suggestion.mode.toLowerCase()}`}>{suggestion.mode.charAt(0)}</span>
              <span><strong>{suggestion.name}</strong><small>{suggestion.subtitle}</small></span>
              <b>↗</b>
            </button>
          ))}
          <div className="suggestion-footer">Ratroo transit data · ↑↓ to navigate · Enter to select</div>
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const pageRef = useRef<HTMLElement>(null);
  const resultRef = useRef<HTMLElement>(null);
  const [splashDone, setSplashDone] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [journey, setJourney] = useState<Journey | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [locationStatus, setLocationStatus] = useState<"idle" | "loading" | "error">("idle");
  const [location, setLocation] = useState<LocationState | null>(null);
  const [selectedFrom, setSelectedFrom] = useState<Suggestion | null>(null);
  const [selectedTo, setSelectedTo] = useState<Suggestion | null>(null);
  const [reachable, setReachable] = useState<Suggestion[]>([]);
  const [activeMode, setActiveMode] = useState<string | null>(null);
  const [networkItems, setNetworkItems] = useState<NetworkItem[]>([]);
  const [networkMessage, setNetworkMessage] = useState("");
  const [networkLoading, setNetworkLoading] = useState(false);
  const [nearby, setNearby] = useState<NearbyStop[]>([]);
  const [nearbyRadius, setNearbyRadius] = useState(0);
  const [mappedRoute, setMappedRoute] = useState<MappedRoute | null>(null);
  const [routeMapLoading, setRouteMapLoading] = useState(false);
  const [message, setMessage] = useState("");

  useLayoutEffect(() => {
    if (!splashDone) return;
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
  }, [splashDone]);

  useEffect(() => {
    document.body.style.overflow = splashDone ? "" : "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [splashDone]);

  useEffect(() => {
    const region = location && location.region !== "unsupported" ? location.region : selectedFrom?.region;
    if (!selectedFrom || !region) {
      setReachable([]);
      return;
    }
    const controller = new AbortController();
    const params = new URLSearchParams({ placeId: selectedFrom.id, name: selectedFrom.name, region });
    fetch(`/api/reachable?${params}`, { signal: controller.signal })
      .then((response) => response.json())
      .then((payload: { data?: Suggestion[] }) => setReachable(payload.data || []))
      .catch((error) => { if ((error as Error).name !== "AbortError") setReachable([]); });
    return () => controller.abort();
  }, [selectedFrom, location]);

  useEffect(() => {
    if (!splashDone) return;
    const timer = window.setTimeout(() => useMyLocation(), 450);
    return () => window.clearTimeout(timer);
    // Location is intentionally requested once; the retry button calls it again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [splashDone]);

  useEffect(() => {
    if (!location?.latitude || !location?.longitude || location.region === "unsupported") {
      setNearby([]);
      return;
    }
    const controller = new AbortController();
    const params = new URLSearchParams({ lat: String(location.latitude), lng: String(location.longitude) });
    fetch(`/api/nearby?${params}`, { signal: controller.signal })
      .then((response) => response.json())
      .then((payload: { data?: NearbyStop[]; radiusMeters?: number }) => {
        setNearby(payload.data || []);
        setNearbyRadius(Number(payload.radiusMeters || 0));
      })
      .catch((error) => { if ((error as Error).name !== "AbortError") setNearby([]); });
    return () => controller.abort();
  }, [location]);

  /**
   * Resolve a point through the coverage service, whether it came from GPS or
   * from someone naming their city.
   *
   * A picked city goes through the same backend lookup rather than carrying a
   * hardcoded region and mode list: coverage, stop counts and available modes
   * stay the polygon's answer, so choosing "Kolkata" can never assert coverage
   * the backend would not.
   */
  async function resolveLocation(latitude: number, longitude: number, source: "gps" | "origin") {
    const params = new URLSearchParams({ lat: String(latitude), lng: String(longitude) });
    const response = await fetch(`/api/location?${params}`);
    const data = await response.json() as LocationState & { message?: string };
    if (!response.ok) throw new Error(data.message || "We could not resolve this location.");

    setLocation({ ...data, source });
    setFrom(data.address);
    setSelectedFrom(null);
    setSelectedTo(null);
    setReachable([]);
    setMappedRoute(null);
    setJourney(null);
    setLocationStatus("idle");

    if (data.region === "unsupported") {
      setStatus("error");
      setMessage("Ratroo currently plans journeys in Kolkata and Bengaluru.");
    } else {
      setStatus("idle");
    }
  }

  async function chooseCity(city: (typeof SELECTABLE_CITIES)[number]) {
    setLocationStatus("loading");
    setMessage("");
    try {
      await resolveLocation(city.latitude, city.longitude, "origin");
    } catch (error) {
      setLocationStatus("error");
      setMessage(error instanceof Error ? error.message : `We could not load ${city.label}.`);
    }
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
        setLocation({ ...data, source: "gps" });
        setFrom(data.address);
        setSelectedFrom(null);
        setSelectedTo(null);
        setReachable([]);
        setMappedRoute(null);
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

  function editOrigin(value: string) {
    setFrom(value);
    setSelectedFrom(null);
    setSelectedTo(null);
    setReachable([]);
    setJourney(null);
    setStatus("idle");
    setMessage("");
    if (location?.source === "origin") {
      setLocation(null);
      setNearby([]);
      setMappedRoute(null);
    }
  }

  async function selectOrigin(suggestion: Suggestion) {
    setFrom(suggestion.name);
    setSelectedFrom(suggestion);
    setSelectedTo(null);
    setTo("");
    setJourney(null);
    setStatus("idle");
    setMessage("");
    if (!suggestion.region || suggestion.latitude == null || suggestion.longitude == null) return;

    const fallback: LocationState = {
      region: suggestion.region,
      name: suggestion.region === "bengaluru" ? "Bengaluru" : "West Bengal",
      address: suggestion.name,
      latitude: suggestion.latitude,
      longitude: suggestion.longitude,
      modes: suggestion.region === "bengaluru" ? ["BUS", "METRO"] : ["BUS", "METRO", "FERRY", "TRAM", "RAIL"],
      source: "origin",
    };
    setLocation(fallback);
    setLocationStatus("loading");
    try {
      const params = new URLSearchParams({ lat: String(suggestion.latitude), lng: String(suggestion.longitude) });
      const response = await fetch(`/api/location?${params}`);
      const data = await response.json() as LocationState;
      if (response.ok) setLocation({ ...fallback, ...data, source: "origin" });
    } finally {
      setLocationStatus("idle");
    }
  }

  async function loadNetwork(mode: string) {
    if (!location || location.region === "unsupported") return;
    setActiveMode(mode);
    setNetworkItems([]);
    setNetworkMessage("");
    setNetworkLoading(true);
    try {
      const params = new URLSearchParams({ region: location.region, mode: mode.toLowerCase() });
      if (location.latitude && location.longitude) {
        params.set("lat", String(location.latitude));
        params.set("lng", String(location.longitude));
      }
      const response = await fetch(`/api/network?${params}`);
      const payload = await response.json() as { data?: NetworkItem[]; message?: string };
      setNetworkItems(payload.data || []);
      setNetworkMessage(payload.message || "");
    } catch {
      setNetworkMessage("The transit network could not be loaded.");
    } finally {
      setNetworkLoading(false);
    }
  }

  async function loadRoute(routeId: string) {
    setRouteMapLoading(true);
    try {
      const params = new URLSearchParams({ routeId });
      if (location?.latitude && location?.longitude) {
        params.set("lat", String(location.latitude));
        params.set("lng", String(location.longitude));
      }
      const response = await fetch(`/api/route-map?${params}`);
      const payload = await response.json() as { data?: MappedRoute; message?: string };
      if (!response.ok || !payload.data) throw new Error(payload.message || "Route map unavailable");
      setMappedRoute(payload.data);
    } catch {
      setNetworkMessage("This service has no ordered stop coordinates yet.");
    } finally {
      setRouteMapLoading(false);
    }
  }

  async function planJourney(event: FormEvent) {
    event.preventDefault();
    const region = location && location.region !== "unsupported" ? location.region : selectedFrom?.region;
    if (!region) {
      setStatus("error");
      setMessage("Select your starting point from the suggestions so Ratroo can detect the correct network.");
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
        body: JSON.stringify({
          from: from.trim(),
          to: to.trim(),
          region,
          routeId: selectedTo?.type.endsWith("_DESTINATION") ? selectedTo.id : undefined,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const details = payload as { message?: string; detail?: string; error?: { message?: string } };
        throw new Error(details.message || details.error?.message || details.detail || "Ratroo could not plan this journey yet.");
      }
      const planned = unwrapJourney(payload);
      setJourney(planned);
      const routeId = planned.legs.find((leg) => leg.routeId)?.routeId;
      if (routeId) void loadRoute(routeId);
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
      {!splashDone && <SplashScreen onFinish={() => setSplashDone(true)} />}
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
            <span className="auto-coverage">Coverage is detected automatically from the backend polygon</span>
            {REGION_PICKER_ENABLED && (
              <div className="city-switch" role="group" aria-label="Choose a city">
                {SELECTABLE_CITIES.map((city) => (
                  <button
                    type="button"
                    key={city.region}
                    className={location?.region === city.region ? "active" : ""}
                    aria-pressed={location?.region === city.region}
                    disabled={locationStatus === "loading"}
                    onClick={() => chooseCity(city)}
                  >
                    {city.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          {location && <div className={`location-result ${location.region}`} data-hero-reveal><span>●</span><div><small>{location.region === "unsupported" ? "LOCATION · NOT COVERED YET" : `${location.source === "origin" ? "SELECTED ORIGIN" : "CURRENT LOCATION"} · ${location.name.toUpperCase()}`}</small><strong>{location.address}</strong></div></div>}
          <form className="planner-card" id="plan" onSubmit={planJourney} data-hero-reveal>
            <div className="planner-row">
              <SuggestionInput
                field="FROM"
                value={from}
                region={location?.region === "kolkata" || location?.region === "bengaluru" ? location.region : "all"}
                onChange={editOrigin}
                onSelect={(suggestion) => { void selectOrigin(suggestion); }}
                placeholder={location?.region === "bengaluru" ? "Majestic" : "Esplanade, Kolkata"}
              />
              <button className="swap" type="button" aria-label="Swap origin and destination" onClick={() => { setFrom(to); setTo(from); setSelectedFrom(null); setSelectedTo(null); setReachable([]); }}>↕</button>
              <SuggestionInput
                field="TO"
                value={to}
                region={location?.region === "kolkata" || location?.region === "bengaluru" ? location.region : selectedFrom?.region || "all"}
                recommended={reachable}
                onChange={(value) => { setTo(value); setSelectedTo(null); setJourney(null); setStatus("idle"); setMessage(""); }}
                onSelect={(suggestion) => { setTo(suggestion.name); setSelectedTo(suggestion); setJourney(null); setStatus("idle"); setMessage(""); }}
                placeholder={location?.region === "bengaluru" ? "Indiranagar" : "Dakshineswar"}
              />
              <button className="plan-button" type="submit" disabled={status === "loading"}>{status === "loading" ? "Planning…" : <>Find my route <span>→</span></>}</button>
            </div>
            <p className="privacy-note"><span>✓</span> No login. GPS is optional—your selected starting stop can identify the network.</p>
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
          <div className="journey-summary">
            {journey.totalDurationMinutes > 0 && <div><strong>{journey.totalDurationMinutes}</strong><span>minutes</span></div>}
            {journey.totalDistanceKm && journey.totalDistanceKm !== "—" && <div><strong>{journey.totalDistanceKm}</strong><span>distance</span></div>}
            {Number.isFinite(journey.transfersCount) && <div><strong>{journey.transfersCount}</strong><span>{journey.transfersCount === 1 ? "transfer" : "transfers"}</span></div>}
            {journey.totalFare != null && Number.isFinite(journey.totalFare) && <div><strong>₹{journey.totalFare}{journey.fareIncomplete ? "+" : ""}</strong><span>estimated fare</span></div>}
          </div>
          <ol className="legs">{journey.legs.map((leg) => <li key={`${leg.legNumber}-${leg.toName}`}><span className={`leg-icon ${leg.mode.toLowerCase()}`}>{leg.mode.charAt(0)}</span><div><small>{leg.departureTime || `${leg.durationMinutes} min`} · {leg.mode.replace("_", " ")}</small><strong>{leg.serviceName || leg.instructions}</strong><p>{leg.fromName} <b>→</b> {leg.toName}</p></div></li>)}</ol>
          <p className="data-note">{journey.confidenceBadges?.join(" · ") || "Ratroo canonical transit data"}</p>
        </section>
      )}

      <section className="trust-strip" aria-label="Ratroo benefits" data-scroll-reveal>
        <div><strong>{location?.modes.length || "—"}</strong><span>Modes near you<br />{location?.modes.length ? location.modes.map((mode) => mode.replace("SUBURBAN_", "")).join(" · ") : "Allow location to see your network"}</span></div><div><strong>{location?.routeCount?.toLocaleString() || "—"}</strong><span>Mapped services<br />From your detected coverage area</span></div><div><strong>0</strong><span>Sign-ups needed<br />Open to every rider</span></div>
      </section>

      <section className="mode-section" id="coverage" data-scroll-reveal>
        <div className="section-copy"><p className="eyebrow"><span /> Live around you</p><h2>{location && location.region !== "unsupported" ? <>{location.name}<br /><em>on the map.</em></> : <>Your position.<br /><em>Your network.</em></>}</h2><p>{location && location.region !== "unsupported" ? `Ratroo found ${nearby.length} nearby stops using the same expanding-radius service as the mobile app.` : "Allow location access once. Ratroo uses the backend coverage polygon—not a manual city switch—to identify the right network."}</p></div>
        {location && location.region !== "unsupported" && location.latitude && location.longitude ? <div className="coverage-live">
          <Suspense fallback={<div className="transit-map-shell"><div className="map-loading"><span className="mini-spinner" /> Loading the OpenStreetMap view…</div></div>}><TransitMap latitude={location.latitude} longitude={location.longitude} address={location.address} nearby={nearby} route={mappedRoute} /></Suspense>
          <div className="nearby-board">
            <div className="nearby-board-title"><div><small>NEARBY NOW</small><h3>{mappedRoute ? mappedRoute.name : `${nearby.length} stops within ${nearbyRadius < 1000 ? `${nearbyRadius} m` : `${Math.round(nearbyRadius / 1000)} km`}`}</h3></div>{routeMapLoading && <span className="mini-spinner" />}</div>
            <div className="nearby-stops">{nearby.slice(0, 7).map((stop) => <article key={stop.id}><div><strong>{stop.name}</strong><small>{stop.provider} · {stop.distanceMeters < 1000 ? `${stop.distanceMeters} m` : `${(stop.distanceMeters / 1000).toFixed(1)} km`} away</small></div><div className="route-badges">{stop.routes.slice(0, 3).map((route) => <button type="button" key={route.id} onClick={() => loadRoute(route.id)}>{route.name}</button>)}</div></article>)}</div>
          </div>
          <div className="mode-grid">{modesByRegion[location.region].map((mode) => <button type="button" key={mode.name} className={`mode-card ${activeMode === mode.name ? "selected" : ""}`} aria-pressed={activeMode === mode.name} onClick={() => loadNetwork(mode.name)}><span className={`mode-icon ${mode.color}`}>{mode.icon}</span><span><h3>{mode.name}</h3><p>{mode.detail}</p></span><b>↗</b></button>)}</div>
          {activeMode && <div className="network-panel" aria-live="polite"><div className="network-title"><div><small>{location.name.toUpperCase()} · NEARBY NETWORK</small><h3>{activeMode} services</h3></div><button type="button" onClick={() => setActiveMode(null)} aria-label="Close network results">×</button></div>{networkLoading ? <div className="network-state"><span className="mini-spinner" /> Loading live network data…</div> : networkItems.length ? <div className="network-list">{networkItems.map((item) => <button type="button" key={item.id} onClick={() => activeMode === "Bus" && loadRoute(item.id)} className={activeMode === "Bus" ? "route-service" : "network-service"}><span className={`suggestion-icon ${activeMode.toLowerCase()}`}>{activeMode.charAt(0)}</span><div><strong>{item.title}</strong><small>{item.subtitle}</small></div>{activeMode === "Bus" && <b>Map →</b>}</button>)}</div> : <div className="network-state"><strong>No published services yet</strong><span>{networkMessage || `The ${activeMode.toLowerCase()} dataset is not active yet.`}</span></div>}</div>}
        </div> : <div className="coverage-empty"><span className="location-pulse" /><h3>{locationStatus === "loading" ? "Finding your network…" : "Location powers this map"}</h3><p>{location?.region === "unsupported" ? "Ratroo does not have a coverage polygon for this location yet." : "Allow your location to load nearby stops, routes, and the correct regional services automatically."}</p><button type="button" onClick={useMyLocation}>Try location again</button></div>}
      </section>

      <section className="how-section" id="how-it-works" data-scroll-reveal>
        <div className="how-intro"><p className="eyebrow"><span /> Built on honest data</p><h2>Confidence,<br />not guesswork.</h2></div>
        <div className="principles"><article><span>01</span><h3>Official when possible</h3><p>We start with operator and government sources, then map every provider into one clear system.</p></article><article><span>02</span><h3>Honest when incomplete</h3><p>Freshness and confidence labels show what we know—and what still needs local verification.</p></article><article><span>03</span><h3>Community-powered</h3><p>Riders, conductors, depots, and volunteers help close the gaps that official data cannot.</p></article></div>
      </section>

      <section className="final-cta" data-scroll-reveal><p>YOUR NEXT JOURNEY</p><h2>India moves in many ways.<br /><em>Ratroo brings them together.</em></h2><a href="#plan">Plan a public journey <span>→</span></a></section>
      <footer><a className="brand" href="#top"><span className="brand-mark">R</span><span>ratroo</span></a><p>Public transport, made human. Address data © OpenStreetMap contributors.</p><span>© 2026 Ratroo</span></footer>
      <PublicAssistant latitude={location?.latitude} longitude={location?.longitude} locationLabel={location?.address} nearbyStops={nearby} />
    </main>
  );
}
