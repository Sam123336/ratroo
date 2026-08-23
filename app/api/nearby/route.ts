import { RATROO_API } from "@/lib/ratroo-api";

type NearbyRoute = { id: string; name: string };

function deepestData(value: unknown): unknown {
  let current = value;
  for (let index = 0; index < 4; index += 1) {
    if (current && typeof current === "object" && "data" in current) current = (current as { data: unknown }).data;
    else break;
  }
  return current;
}

function normalize(value: unknown) {
  const stop = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const latitude = Number(stop.latitude);
  const longitude = Number(stop.longitude);
  if (!String(stop.id || "") || !String(stop.name || "") || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const routes = Array.isArray(stop.routes) ? stop.routes : [];
  return {
    id: String(stop.id), name: String(stop.name), latitude, longitude,
    provider: String(stop.provider || "RATROO"), category: String(stop.category || "BUS_STOP"),
    distanceMeters: Number(stop.distanceMeters || 0),
    routes: routes.map((route) => {
      const row = route as Record<string, unknown>;
      return { id: String(row.id || ""), name: String(row.name || "") };
    }).filter((route: NearbyRoute) => route.id && route.name).slice(0, 8),
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const lat = Number(url.searchParams.get("lat"));
  const lng = Number(url.searchParams.get("lng"));
  const mode = (url.searchParams.get("mode") || "").toUpperCase();
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return Response.json({ message: "Valid coordinates are required." }, { status: 400 });

  for (const radius of [1000, 5000, 15000, 30000]) {
    try {
      const response = await fetch(`${RATROO_API}/stops/nearby?${new URLSearchParams({ lat: String(lat), lng: String(lng), radius: String(radius) })}`, {
        headers: { "Accept": "application/json" },
      });
      if (!response.ok) continue;
      const raw = deepestData(await response.json());
      const stops = (Array.isArray(raw) ? raw : []).map(normalize).filter((stop): stop is NonNullable<ReturnType<typeof normalize>> => stop !== null);
      const filtered = mode ? stops.filter((stop) => stop.category.startsWith(mode)) : stops;
      if (filtered.length) return Response.json({ data: filtered.slice(0, 40), radiusMeters: radius, widened: radius > 1000 });
    } catch {
      // Widen or return the honest empty state after the final attempt.
    }
  }
  return Response.json({ data: [], radiusMeters: 30000, widened: true });
}
