"use client";

import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { Map as MapLibreMap, Marker as MapLibreMarker, StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

type Coordinates = { latitude: number; longitude: number };
type StopSelection = Coordinates & { stopName?: string };
type StopSuggestion = { id: string; name: string; subtitle: string; mode: string; latitude?: number; longitude?: number };

type Props = {
  stopName: string;
  latitude?: number;
  longitude?: number;
  onClose: () => void;
  onConfirm: (selection: StopSelection) => void;
};

const CITIES = {
  Kolkata: { latitude: 22.5726, longitude: 88.3639 },
  Bengaluru: { latitude: 12.9716, longitude: 77.5946 },
};

const FALLBACK_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    "ratroo-osm": {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [
    { id: "background", type: "background", paint: { "background-color": "#eee9df" } },
    { id: "ratroo-osm", type: "raster", source: "ratroo-osm" },
  ],
};

export default function StopMapPicker({ stopName, latitude, longitude, onClose, onConfirm }: Props) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<MapLibreMarker | null>(null);
  const skipNextSearch = useRef(false);
  const hasSavedPoint = latitude != null && longitude != null;
  const initialPoint = hasSavedPoint ? { latitude, longitude } : CITIES.Kolkata;
  const [point, setPoint] = useState<Coordinates>(initialPoint);
  const [selected, setSelected] = useState(hasSavedPoint);
  const [locationMessage, setLocationMessage] = useState("");
  const [query, setQuery] = useState(stopName);
  const [suggestions, setSuggestions] = useState<StopSuggestion[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (skipNextSearch.current) {
      skipNextSearch.current = false;
      return;
    }
    const term = query.trim();
    if (term.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const params = new URLSearchParams({ q: term, region: "all" });
        const response = await fetch(`/api/suggestions?${params}`, { signal: controller.signal });
        const payload = await response.json() as { data?: StopSuggestion[] };
        setSuggestions(payload.data || []);
        setSearchOpen(true);
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setSuggestions([]);
          setSearchOpen(true);
        }
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 280);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: globalThis.KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", closeOnEscape);
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: "https://tiles.openfreemap.org/styles/liberty",
      center: [initialPoint.longitude, initialPoint.latitude],
      zoom: hasSavedPoint ? 16 : 11,
      pitch: 0,
      bearing: 0,
      attributionControl: false,
    });
    const marker = new maplibregl.Marker({ color: "#f2760c", draggable: true })
      .setLngLat([initialPoint.longitude, initialPoint.latitude])
      .addTo(map);
    markerRef.current = marker;

    function selectPoint(next: Coordinates) {
      setPoint(next);
      setSelected(true);
      setLocationMessage("");
      marker.setLngLat([next.longitude, next.latitude]);
    }

    marker.on("dragend", () => {
      const next = marker.getLngLat();
      selectPoint({ latitude: next.lat, longitude: next.lng });
    });
    map.on("click", event => selectPoint({ latitude: event.lngLat.lat, longitude: event.lngLat.lng }));
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
    const fallbackTimer = window.setTimeout(() => {
      if (!map.isSourceLoaded("openmaptiles")) {
        map.setStyle(FALLBACK_STYLE);
        setLocationMessage("The lightweight map view is active. Tap the exact stop.");
      }
    }, 4500);
    mapRef.current = map;

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
      window.clearTimeout(fallbackTimer);
      marker.remove();
      map.remove();
      markerRef.current = null;
      mapRef.current = null;
    };
  }, [hasSavedPoint, initialPoint.latitude, initialPoint.longitude, onClose]);

  function chooseSuggestion(suggestion: StopSuggestion) {
    skipNextSearch.current = true;
    setQuery(suggestion.name);
    setSuggestions([]);
    setSearchOpen(false);
    if (suggestion.latitude == null || suggestion.longitude == null) {
      setLocationMessage(`${suggestion.name} found. Tap its exact point on the map.`);
      return;
    }
    const next = { latitude: suggestion.latitude, longitude: suggestion.longitude };
    setPoint(next);
    setSelected(true);
    markerRef.current?.setLngLat([next.longitude, next.latitude]);
    mapRef.current?.flyTo({ center: [next.longitude, next.latitude], zoom: 17, pitch: 0, bearing: 0, essential: true });
    setLocationMessage(`${suggestion.name} selected. Drag the marker if needed.`);
  }

  function moveToCity(city: keyof typeof CITIES) {
    const next = CITIES[city];
    mapRef.current?.flyTo({ center: [next.longitude, next.latitude], zoom: 12, pitch: 0, bearing: 0, essential: true });
    setLocationMessage(`Showing ${city}. Tap the exact stop on the map.`);
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setLocationMessage("Current location is not available on this device.");
      return;
    }
    setLocationMessage("Finding your current location…");
    navigator.geolocation.getCurrentPosition(
      position => {
        const next = { latitude: position.coords.latitude, longitude: position.coords.longitude };
        setPoint(next);
        setSelected(true);
        markerRef.current?.setLngLat([next.longitude, next.latitude]);
        mapRef.current?.flyTo({ center: [next.longitude, next.latitude], zoom: 17, pitch: 0, bearing: 0, essential: true });
        setLocationMessage("Current location selected. Move the marker if needed.");
      },
      () => setLocationMessage("Location permission was not given. Tap the stop on the map instead."),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  return (
    <div className="stop-map-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <section className="stop-map-dialog" role="dialog" aria-modal="true" aria-labelledby="stop-map-title">
        <header>
          <div><p>Choose stop on map</p><h2 id="stop-map-title">{query.trim() || stopName || "Unnamed stop"}</h2></div>
          <button type="button" onClick={onClose} aria-label="Close map">×</button>
        </header>
        <div className="stop-map-search">
          <label>
            <span>Search stop, station, or area</span>
            <input role="combobox" value={query} onChange={event => { const value = event.target.value; setQuery(value); if (value.trim().length < 2) { setSuggestions([]); setSearchOpen(false); setSearching(false); } }} onFocus={() => query.trim().length >= 2 && setSearchOpen(true)} onKeyDown={event => event.key === "Escape" && setSearchOpen(false)} placeholder="Example: Majestic, Gariahat, Esplanade" autoComplete="off" aria-expanded={searchOpen} aria-controls="map-stop-search-results" />
          </label>
          {searchOpen && <div className="stop-map-search-results" id="map-stop-search-results" role="listbox">
            {searching && <div className="stop-map-search-state">Searching Kolkata and Bengaluru…</div>}
            {!searching && suggestions.length === 0 && <div className="stop-map-search-state">No saved stop found. Use the city buttons and tap the map.</div>}
            {!searching && suggestions.map(suggestion => <button type="button" role="option" aria-selected="false" key={suggestion.id} onClick={() => chooseSuggestion(suggestion)}><span>{suggestion.mode?.charAt(0) || "S"}</span><span><strong>{suggestion.name}</strong><small>{suggestion.subtitle}</small></span><b>{suggestion.latitude != null ? "Show on map" : "Select"}</b></button>)}
          </div>}
        </div>
        <div className="stop-map-tools">
          <span>Jump to</span>
          <button type="button" onClick={() => moveToCity("Kolkata")}>Kolkata</button>
          <button type="button" onClick={() => moveToCity("Bengaluru")}>Bengaluru</button>
          <button type="button" className="current-location" onClick={useCurrentLocation}>⌖ My location</button>
        </div>
        <div className="stop-map-canvas" ref={mapContainerRef} aria-label="Map for choosing the exact stop location" />
        <div className="stop-map-footer">
          <div>
            <strong>{selected ? "Location ready" : "Tap the exact stop"}</strong>
            <span>{locationMessage || (selected ? `${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)} · Drag the marker to adjust.` : "You do not need to be physically present at the stop.")}</span>
          </div>
          <button type="button" className="map-cancel" onClick={onClose}>Cancel</button>
          <button type="button" className="map-confirm" disabled={!selected} onClick={() => onConfirm({ ...point, stopName: query.trim() || stopName || undefined })}>Confirm this stop →</button>
        </div>
      </section>
    </div>
  );
}
