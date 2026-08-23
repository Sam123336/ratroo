"use client";

import { useEffect, useRef, useState } from "react";
import type { Coordinates, StopMapPickerProps } from "../../contracts";
import { loadGoogleMaps, type GoogleMapInstance, type GoogleMarkerInstance } from "./google-loader";

type StopSuggestion = { id: string; name: string; subtitle: string; mode: string; latitude?: number; longitude?: number };
const CITIES = {
  Kolkata: { latitude: 22.5726, longitude: 88.3639 },
  Bengaluru: { latitude: 12.9716, longitude: 77.5946 },
};

export default function GoogleStopMapPicker({ stopName, latitude, longitude, onClose, onConfirm }: StopMapPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<GoogleMapInstance | null>(null);
  const markerRef = useRef<GoogleMarkerInstance | null>(null);
  const hasSavedPoint = latitude != null && longitude != null;
  const initialPoint = hasSavedPoint ? { latitude, longitude } : CITIES.Kolkata;
  const [point, setPoint] = useState<Coordinates>(initialPoint);
  const [selected, setSelected] = useState(hasSavedPoint);
  const [query, setQuery] = useState(stopName);
  const [suggestions, setSuggestions] = useState<StopSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const response = await fetch(`/api/suggestions?${new URLSearchParams({ q: term, region: "all" })}`, { signal: controller.signal });
        const payload = await response.json() as { data?: StopSuggestion[] };
        setSuggestions(payload.data || []);
        setSearchOpen(true);
      } catch (reason) {
        if ((reason as Error).name !== "AbortError") setSuggestions([]);
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 280);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query]);

  useEffect(() => {
    let active = true;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: globalThis.KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", closeOnEscape);
    if (!containerRef.current) return;
    loadGoogleMaps().then(maps => {
      if (!active || !containerRef.current) return;
      const map = new maps.Map(containerRef.current, {
        center: { lat: initialPoint.latitude, lng: initialPoint.longitude },
        zoom: hasSavedPoint ? 16 : 11,
        tilt: 0,
        heading: 0,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
      });
      const marker = new maps.Marker({ map, position: { lat: initialPoint.latitude, lng: initialPoint.longitude }, draggable: true, title: stopName || "Selected stop" });
      const select = (next: Coordinates) => { setPoint(next); setSelected(true); marker.setPosition({ lat: next.latitude, lng: next.longitude }); };
      map.addListener("click", event => event.latLng && select({ latitude: event.latLng.lat(), longitude: event.latLng.lng() }));
      marker.addListener("dragend", () => { const position = marker.getPosition(); if (position) select({ latitude: position.lat(), longitude: position.lng() }); });
      mapRef.current = map;
      markerRef.current = marker;
    }).catch(reason => active && setMessage(reason instanceof Error ? reason.message : "Map unavailable."));
    return () => {
      active = false;
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
      markerRef.current?.setMap(null);
      markerRef.current = null;
      mapRef.current = null;
    };
  }, [hasSavedPoint, initialPoint.latitude, initialPoint.longitude, onClose, stopName]);

  function moveTo(next: Coordinates, zoom = 17) {
    setPoint(next);
    setSelected(true);
    const position = { lat: next.latitude, lng: next.longitude };
    markerRef.current?.setPosition(position);
    mapRef.current?.panTo(position);
    mapRef.current?.setZoom(zoom);
    mapRef.current?.setTilt(0);
    mapRef.current?.setHeading(0);
  }

  function chooseSuggestion(suggestion: StopSuggestion) {
    setQuery(suggestion.name);
    setSearchOpen(false);
    if (suggestion.latitude != null && suggestion.longitude != null) {
      moveTo({ latitude: suggestion.latitude, longitude: suggestion.longitude });
      setMessage(`${suggestion.name} selected. Drag the marker if needed.`);
    } else setMessage(`${suggestion.name} found. Tap its exact point on the map.`);
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) return setMessage("Current location is not available on this device.");
    setMessage("Finding your current location…");
    navigator.geolocation.getCurrentPosition(
      position => { moveTo({ latitude: position.coords.latitude, longitude: position.coords.longitude }); setMessage("Current location selected."); },
      () => setMessage("Location permission was not given. Tap the map instead."),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  return <div className="stop-map-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && onClose()}>
    <section className="stop-map-dialog" role="dialog" aria-modal="true" aria-labelledby="stop-map-title">
      <header><div><p>Choose stop on map</p><h2 id="stop-map-title">{query.trim() || "Unnamed stop"}</h2></div><button type="button" onClick={onClose} aria-label="Close map">×</button></header>
      <div className="stop-map-search"><label><span>Search stop, station, or area</span><input role="combobox" value={query} onChange={event => setQuery(event.target.value)} onFocus={() => query.trim().length >= 2 && setSearchOpen(true)} placeholder="Example: Majestic, Gariahat, Esplanade" autoComplete="off" aria-expanded={searchOpen} aria-controls="google-stop-results" /></label>
        {searchOpen && <div className="stop-map-search-results" id="google-stop-results" role="listbox">{searching && <div className="stop-map-search-state">Searching Kolkata and Bengaluru…</div>}{!searching && suggestions.length === 0 && <div className="stop-map-search-state">No saved stop found. Tap the exact point on the map.</div>}{!searching && suggestions.map(suggestion => <button type="button" role="option" aria-selected="false" key={suggestion.id} onClick={() => chooseSuggestion(suggestion)}><span>{suggestion.mode?.charAt(0) || "S"}</span><span><strong>{suggestion.name}</strong><small>{suggestion.subtitle}</small></span><b>Show on map</b></button>)}</div>}
      </div>
      <div className="stop-map-tools"><span>Jump to</span>{(Object.keys(CITIES) as Array<keyof typeof CITIES>).map(city => <button type="button" key={city} onClick={() => { const next = CITIES[city]; mapRef.current?.panTo({ lat: next.latitude, lng: next.longitude }); mapRef.current?.setZoom(12); setMessage(`Showing ${city}. Tap the exact stop.`); }}>{city}</button>)}<button type="button" className="current-location" onClick={useCurrentLocation}>⌖ My location</button></div>
      <div className="stop-map-canvas" ref={containerRef} aria-label="Google map for choosing the exact stop location" />
      <div className="stop-map-footer"><div><strong>{selected ? "Location ready" : "Tap the exact stop"}</strong><span>{message || (selected ? `${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}` : "You do not need to be physically present at the stop.")}</span></div><button type="button" className="map-cancel" onClick={onClose}>Cancel</button><button type="button" className="map-confirm" disabled={!selected} onClick={() => onConfirm({ ...point, stopName: query.trim() || stopName || undefined })}>Confirm this stop →</button></div>
    </section>
  </div>;
}
