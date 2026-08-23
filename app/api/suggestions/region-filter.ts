export type CityRegion = "kolkata" | "bengaluru";

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
