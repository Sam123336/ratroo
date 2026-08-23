const RATROO_API = (process.env.RATROO_API_URL || (process.env.NODE_ENV === "development"
  ? "http://localhost:3000/v1"
  : "https://ratroo-backend-sams-projects-83758424.vercel.app/v1")).replace(/\/$/, "");

type RouteRow = { id?: string; name?: string; providerCode?: string };
type DepartureRow = { headsign?: string; routeId?: string; routeName?: string };

function deepestData(value: unknown): unknown {
  let current = value;
  for (let index = 0; index < 3; index += 1) {
    if (current && typeof current === "object" && "data" in current) current = (current as { data: unknown }).data;
    else break;
  }
  return current;
}

function key(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function otherEnd(routeName: string, origin: string) {
  const parts = routeName.split(/\s+(?:to|-|–|→)\s+/i).map((part) => part.trim()).filter(Boolean);
  if (parts.length !== 2) return null;
  if (key(parts[0]) === key(origin)) return parts[1];
  if (key(parts[1]) === key(origin)) return parts[0];
  return parts[1];
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const placeId = (url.searchParams.get("placeId") || "").trim();
  const origin = (url.searchParams.get("name") || "").trim();
  const region = url.searchParams.get("region");
  if (!placeId || !origin) return Response.json({ data: [] });

  try {
    const response = await fetch(`${RATROO_API}/places/${encodeURIComponent(placeId)}`, { headers: { "Accept": "application/json" } });
    if (!response.ok) throw new Error(`Place lookup returned ${response.status}`);
    const place = deepestData(await response.json()) as { routes?: RouteRow[]; departures?: DepartureRow[] };
    const seen = new Set<string>();
    const data: Array<{ id: string; name: string; type: string; mode: string; providerCode: string; subtitle: string }> = [];

    const add = (name: string | null | undefined, route?: RouteRow | DepartureRow) => {
      const value = name?.trim();
      if (!value || key(value) === key(origin) || seen.has(key(value))) return;
      seen.add(key(value));
      const providerCode = "providerCode" in (route || {}) ? String((route as RouteRow).providerCode || "RATROO") : "RATROO";
      const mode = providerCode.includes("TRAM") ? "TRAM" : providerCode.includes("METRO") ? "METRO" : "BUS";
      data.push({
        id: String((route as RouteRow | undefined)?.id || (route as DepartureRow | undefined)?.routeId || `reachable-${key(value)}`),
        name: value,
        type: `${mode}_DESTINATION`,
        mode,
        providerCode,
        subtitle: `Direct from ${origin}${providerCode !== "RATROO" ? ` · ${providerCode}` : ""}`,
      });
    };

    for (const departure of place.departures || []) add(departure.headsign, departure);
    for (const route of place.routes || []) add(otherEnd(route.name || "", origin), route);
    return Response.json({ data: data.slice(0, 12), region, source: "place-routes" });
  } catch {
    return Response.json({ data: [], source: "unavailable" });
  }
}
