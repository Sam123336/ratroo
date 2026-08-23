"use client";

import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

export type NearbyStop = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  provider: string;
  category: string;
  distanceMeters: number;
  routes: Array<{ id: string; name: string }>;
};

export type MappedRoute = {
  id: string;
  name: string;
  provider: string;
  stops: Array<{ name: string; latitude: number; longitude: number; sequence: number }>;
};

type Props = {
  latitude: number;
  longitude: number;
  address: string;
  nearby: NearbyStop[];
  route: MappedRoute | null;
};

const emptyCollection = { type: "FeatureCollection" as const, features: [] };

export default function TransitMap({ latitude, longitude, address, nearby, route }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [ready, setReady] = useState(false);
  const [pitched, setPitched] = useState(true);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: "https://tiles.openfreemap.org/styles/liberty",
      center: [longitude, latitude],
      zoom: 13.2,
      pitch: 48,
      bearing: -10,
      attributionControl: false,
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
    let initialized = false;
    const initializeTransitLayers = () => {
      if (initialized || !map.isStyleLoaded()) return;
      initialized = true;

      // Keep a standard OSM raster underneath the vector style. This makes the
      // street map resilient when a browser blocks one of OpenFreeMap's vector
      // tile subdomains; vector labels and 3D buildings still render above it.
      if (!map.getSource("ratroo-osm-base")) {
        map.addSource("ratroo-osm-base", {
          type: "raster",
          tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
          tileSize: 256,
          attribution: "© OpenStreetMap contributors",
        });
        map.addLayer(
          { id: "ratroo-osm-base", type: "raster", source: "ratroo-osm-base", paint: { "raster-opacity": 1 } },
          map.getStyle().layers?.find((layer) => layer.type !== "background")?.id,
        );
      }

      if (!map.getSource("ratroo-user")) map.addSource("ratroo-user", { type: "geojson", data: emptyCollection });
      map.addLayer({ id: "ratroo-user-halo", type: "circle", source: "ratroo-user", paint: { "circle-radius": 13, "circle-color": "#ff942f", "circle-opacity": 0.22 } });
      map.addLayer({ id: "ratroo-user", type: "circle", source: "ratroo-user", paint: { "circle-radius": 6, "circle-color": "#f36d00", "circle-stroke-color": "#fff", "circle-stroke-width": 3 } });
      if (!map.getSource("ratroo-nearby")) map.addSource("ratroo-nearby", { type: "geojson", data: emptyCollection });
      map.addLayer({ id: "ratroo-nearby", type: "circle", source: "ratroo-nearby", paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 4, 16, 8], "circle-color": "#165c49", "circle-stroke-color": "#fffaf1", "circle-stroke-width": 2 } });
      if (!map.getSource("ratroo-route")) map.addSource("ratroo-route", { type: "geojson", data: emptyCollection });
      map.addLayer({ id: "ratroo-route-shadow", type: "line", source: "ratroo-route", filter: ["==", ["geometry-type"], "LineString"], paint: { "line-color": "#fffaf1", "line-width": 9, "line-opacity": 0.78 } });
      map.addLayer({ id: "ratroo-route", type: "line", source: "ratroo-route", filter: ["==", ["geometry-type"], "LineString"], paint: { "line-color": "#f36d00", "line-width": 5, "line-opacity": 0.95 } });
      map.addLayer({ id: "ratroo-route-stops", type: "circle", source: "ratroo-route", filter: ["==", ["geometry-type"], "Point"], paint: { "circle-radius": 5, "circle-color": "#f36d00", "circle-stroke-color": "#fff", "circle-stroke-width": 2 } });

      try {
        const firstLabel = map.getStyle().layers?.find((layer) => layer.type === "symbol")?.id;
        map.addLayer({
          id: "ratroo-3d-buildings", type: "fill-extrusion", source: "openmaptiles", "source-layer": "building", minzoom: 14,
          paint: { "fill-extrusion-color": "#d8cdb9", "fill-extrusion-height": ["coalesce", ["get", "render_height"], ["get", "height"], 8], "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0], "fill-extrusion-opacity": 0.68 },
        }, firstLabel);
      } catch {
        // The 3D camera still works if a tile style omits building heights.
      }
      setReady(true);
    };
    const revealTimer = window.setTimeout(() => {
      initializeTransitLayers();
      // Keep the usable OSM base map visible even if a style omits a custom layer dependency.
      setReady(true);
    }, 4000);
    map.on("load", initializeTransitLayers);
    map.on("style.load", initializeTransitLayers);
    map.on("styledata", initializeTransitLayers);
    map.on("idle", initializeTransitLayers);
    map.on("click", "ratroo-nearby", (event) => {
      const feature = event.features?.[0];
      if (!feature || feature.geometry.type !== "Point") return;
      const wrapper = document.createElement("div");
      wrapper.className = "map-popup";
      const title = document.createElement("strong");
      title.textContent = String(feature.properties?.name || "Nearby stop");
      const detail = document.createElement("span");
      detail.textContent = String(feature.properties?.detail || "Ratroo transit stop");
      wrapper.append(title, detail);
      new maplibregl.Popup({ offset: 12 }).setLngLat(feature.geometry.coordinates as [number, number]).setDOMContent(wrapper).addTo(map);
    });
    map.on("mouseenter", "ratroo-nearby", () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", "ratroo-nearby", () => { map.getCanvas().style.cursor = ""; });
    mapRef.current = map;
    return () => { window.clearTimeout(revealTimer); map.remove(); mapRef.current = null; };
  }, [latitude, longitude]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    (map.getSource("ratroo-user") as GeoJSONSource)?.setData({
      type: "FeatureCollection", features: [{ type: "Feature", properties: { address }, geometry: { type: "Point", coordinates: [longitude, latitude] } }],
    });
    (map.getSource("ratroo-nearby") as GeoJSONSource)?.setData({
      type: "FeatureCollection",
      features: nearby.map((stop) => ({
        type: "Feature" as const,
        properties: { name: stop.name, detail: `${stop.provider} · ${stop.distanceMeters < 1000 ? `${stop.distanceMeters} m` : `${(stop.distanceMeters / 1000).toFixed(1)} km`} away` },
        geometry: { type: "Point" as const, coordinates: [stop.longitude, stop.latitude] },
      })),
    });
  }, [ready, latitude, longitude, address, nearby]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const validStops = route?.stops.filter((stop) => Number.isFinite(stop.latitude) && Number.isFinite(stop.longitude)) || [];
    const features = validStops.length > 1 ? [
      { type: "Feature" as const, properties: { name: route?.name }, geometry: { type: "LineString" as const, coordinates: validStops.map((stop) => [stop.longitude, stop.latitude]) } },
      ...validStops.map((stop) => ({ type: "Feature" as const, properties: { name: stop.name }, geometry: { type: "Point" as const, coordinates: [stop.longitude, stop.latitude] } })),
    ] : [];
    (map.getSource("ratroo-route") as GeoJSONSource)?.setData({ type: "FeatureCollection", features });
    const points = validStops.length > 1 ? validStops : nearby.slice(0, 20);
    if (points.length) {
      const bounds = points.reduce((box, point) => box.extend([point.longitude, point.latitude]), new maplibregl.LngLatBounds([longitude, latitude], [longitude, latitude]));
      map.fitBounds(bounds, { padding: 64, maxZoom: 15, duration: 900, pitch: pitched ? 48 : 0 });
    }
  }, [ready, route, nearby, latitude, longitude, pitched]);

  function toggle3d() {
    const next = !pitched;
    setPitched(next);
    mapRef.current?.easeTo({ pitch: next ? 52 : 0, bearing: next ? -10 : 0, duration: 650 });
  }

  return (
    <div className="transit-map-shell">
      <div ref={containerRef} className="transit-map" aria-label="Interactive OpenStreetMap showing nearby transit and selected routes" />
      <div className="map-toolbar"><button type="button" onClick={toggle3d} aria-pressed={pitched}>{pitched ? "2D view" : "3D view"}</button><span>OSM · live Ratroo data</span></div>
      {!ready && <div className="map-loading"><span className="mini-spinner" /> Loading the local network…</div>}
    </div>
  );
}
