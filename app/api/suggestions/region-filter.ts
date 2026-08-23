export type CityRegion = "kolkata" | "bengaluru";

/**
 * Whether a result carries coordinates worth trusting.
 *
 * `Number(null)` is 0 and `Number.isFinite(0)` is true, so a record with no
 * position coerces to a valid-looking point at 0,0 in the Gulf of Guinea.
 * Reading the fields before coercing keeps "we do not know where this is"
 * distinct from "this is at the null island".
 */
export function hasCoordinates(value: Record<string, unknown>): boolean {
  const rawLat = value.latitude ?? value.lat;
  const rawLng = value.longitude ?? value.lng ?? value.lon;
  if (rawLat === null || rawLat === undefined || rawLng === null || rawLng === undefined) return false;

  const latitude = Number(rawLat);
  const longitude = Number(rawLng);
  return Number.isFinite(latitude) && Number.isFinite(longitude) && !(latitude === 0 && longitude === 0);
}

/**
 * Which region a result's coordinates place it in, if any.
 *
 * Boxes, not polygons: precise enough to tell Bengaluru from Kolkata, which is
 * the only question asked of it. A result outside both boxes is not forced into
 * one — `undefined` means unplaceable, and [forRegion] treats that differently
 * from "somewhere else".
 */
export function regionForResult(
  value: Record<string, unknown>,
  fallback?: CityRegion,
): CityRegion | undefined {
  const latitude = Number(value.latitude ?? value.lat);
  const longitude = Number(value.longitude ?? value.lng ?? value.lon);
  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    if (latitude >= 12.7 && latitude <= 13.3 && longitude >= 77.3 && longitude <= 78) return "bengaluru";
    if (latitude >= 21 && latitude <= 27.5 && longitude >= 85 && longitude <= 90) return "kolkata";
  }
  return fallback;
}

/**
 * Keep what belongs here, and what cannot be placed at all.
 *
 * Only a result whose coordinates put it in a *different* region is foreign. A
 * stop with no coordinates is unplaceable, not elsewhere — and roughly a tenth
 * of stops have none, which is why discarding them emptied the box of real
 * BMTC results. Placed results still lead; unplaceable ones follow.
 */
export function forRegion<T extends { region?: CityRegion }>(region: CityRegion, items: T[]): T[] {
  return items
    .filter((item) => item.region === region || item.region === undefined)
    .sort((left, right) => Number(left.region !== region) - Number(right.region !== region));
}
