"use client";

import { useEffect, useRef, useState } from "react";
import type { TransitMapProps } from "../../contracts";
import { loadGoogleMaps, type GoogleMapInstance, type GoogleMarkerInstance, type GooglePolylineInstance } from "./google-loader";

export default function GoogleTransitMap({ latitude, longitude, nearby, route }: TransitMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<GoogleMapInstance | null>(null);
  const overlaysRef = useRef<Array<GoogleMarkerInstance | GooglePolylineInstance>>([]);
  const [ready, setReady] = useState(false);
  const [pitched, setPitched] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    if (!containerRef.current) return;
    loadGoogleMaps().then(maps => {
      if (!active || !containerRef.current) return;
      mapRef.current = new maps.Map(containerRef.current, {
        center: { lat: latitude, lng: longitude },
        zoom: 13,
        tilt: 45,
        heading: -10,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
      });
      setReady(true);
    }).catch(reason => active && setError(reason instanceof Error ? reason.message : "Map unavailable."));
    return () => {
      active = false;
      overlaysRef.current.forEach(overlay => overlay.setMap(null));
      overlaysRef.current = [];
      mapRef.current = null;
    };
  }, [latitude, longitude]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !window.google?.maps) return;
    overlaysRef.current.forEach(overlay => overlay.setMap(null));
    const maps = window.google.maps;
    const overlays: Array<GoogleMarkerInstance | GooglePolylineInstance> = [];
    overlays.push(new maps.Marker({ map, position: { lat: latitude, lng: longitude }, title: "Your location" }));
    nearby.slice(0, 80).forEach(stop => overlays.push(new maps.Marker({
      map,
      position: { lat: stop.latitude, lng: stop.longitude },
      title: stop.name,
      icon: { path: 0, scale: 7, fillColor: "#165c49", fillOpacity: 1, strokeColor: "#fffaf1", strokeWeight: 2 },
    })));
    const validStops = route?.stops.filter(stop => Number.isFinite(stop.latitude) && Number.isFinite(stop.longitude)) || [];
    if (validStops.length > 1) {
      overlays.push(new maps.Polyline({
        map,
        path: validStops.map(stop => ({ lat: stop.latitude, lng: stop.longitude })),
        strokeColor: "#f36d00",
        strokeOpacity: 0.95,
        strokeWeight: 6,
      }));
      const bounds = new maps.LatLngBounds();
      validStops.forEach(stop => bounds.extend({ lat: stop.latitude, lng: stop.longitude }));
      map.fitBounds(bounds, 64);
    }
    overlaysRef.current = overlays;
    return () => overlays.forEach(overlay => overlay.setMap(null));
  }, [ready, latitude, longitude, nearby, route]);

  function toggle3d() {
    const next = !pitched;
    setPitched(next);
    mapRef.current?.setTilt(next ? 45 : 0);
    mapRef.current?.setHeading(next ? -10 : 0);
  }

  return <div className="transit-map-shell">
    <div ref={containerRef} className="transit-map" aria-label="Google map showing nearby transit and selected routes" />
    <div className="map-toolbar"><button type="button" onClick={toggle3d} aria-pressed={pitched}>{pitched ? "2D view" : "3D view"}</button><span>Google Maps · live Ratroo data</span></div>
    {!ready && <div className="map-loading"><span className="mini-spinner" /> {error || "Loading the local network…"}</div>}
  </div>;
}
