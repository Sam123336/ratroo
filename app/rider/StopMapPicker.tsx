"use client";

import type { StopMapPickerProps } from "../lib/maps/contracts";
import { resolveMapProvider } from "../lib/maps/provider-registry";

export default function StopMapPicker(props: StopMapPickerProps) {
  const ProviderStopMapPicker = resolveMapProvider().StopMapPicker;
  return <ProviderStopMapPicker {...props} />;
}
