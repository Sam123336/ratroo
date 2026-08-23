"use client";

import type { MapProvider } from "./contracts";
import OpenStopMapPicker from "./providers/open/OpenStopMapPicker";
import OpenTransitMap from "./providers/open/OpenTransitMap";
import GoogleStopMapPicker from "./providers/google/GoogleStopMapPicker";
import GoogleTransitMap from "./providers/google/GoogleTransitMap";

const providers = new Map<string, MapProvider>();

providers.set("open", {
  id: "open",
  publicLabel: "Open map · live Ratroo data",
  StopMapPicker: OpenStopMapPicker,
  TransitMap: OpenTransitMap,
});

providers.set("google", {
  id: "google",
  publicLabel: "Google Maps · live Ratroo data",
  StopMapPicker: GoogleStopMapPicker,
  TransitMap: GoogleTransitMap,
});

/** Infrastructure adapters register here without changing Rider or planner UI. */
export function registerMapProvider(provider: MapProvider) {
  providers.set(provider.id, provider);
}

export function resolveMapProvider(name = process.env.NEXT_PUBLIC_MAP_PROVIDER || "open") {
  const provider = providers.get(name);
  if (!provider) {
    throw new Error(`Map provider "${name}" is not registered. Register its adapter before selecting it.`);
  }
  return provider;
}
