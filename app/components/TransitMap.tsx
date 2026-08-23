"use client";

import type { TransitMapProps } from "../lib/maps/contracts";
import { resolveMapProvider } from "../lib/maps/provider-registry";

export type { MappedRoute, NearbyStop } from "../lib/maps/contracts";

export default function TransitMap(props: TransitMapProps) {
  const ProviderTransitMap = resolveMapProvider().TransitMap;
  return <ProviderTransitMap {...props} />;
}
