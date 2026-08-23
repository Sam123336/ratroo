import { ratrooApiUrl } from "@/lib/ratroo-api";
import { resolveNearbyMetroProvider } from "@/app/lib/nearby/metro-provider";

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

  const inBengaluru = lat >= 12.65 && lat <= 13.25 && lng >= 77.30 && lng <= 78.05;
  if (inBengaluru && (!mode || mode === "BUS" || mode === "METRO")) {
    const busPromise = mode === "METRO" ? Promise.resolve([]) : fetch(`${ratrooApiUrl()}/stops/nearby?${new URLSearchParams({ lat: String(lat), lng: String(lng), radius: "5000" })}`, {
      headers: { Accept: "application/json" },
    }).then(async (response) => {
      if (!response.ok) return [];
      const raw = deepestData(await response.json());
      return (Array.isArray(raw) ? raw : []).map(normalize).filter((stop): stop is NonNullable<ReturnType<typeof normalize>> =>
        stop !== null && stop.category.startsWith("BUS") && stop.provider.includes("BMTC"),
      );
    }).catch(() => []);
    const metroPromise = mode === "BUS"
      ? Promise.resolve([])
      : resolveNearbyMetroProvider().findNearby(lat, lng, 15000);
    const [buses, metros] = await Promise.all([busPromise, metroPromise]);
    const data = [...buses, ...metros].sort((a, b) => a.distanceMeters - b.distanceMeters).slice(0, 40);
    const radiusMeters = data.length ? Math.max(...data.map((stop) => stop.distanceMeters)) : 15000;
    return Response.json({ data, radiusMeters, widened: radiusMeters > 1000, sources: [buses.length ? "Ratroo BMTC" : null, metros.length ? "OpenStreetMap BMRCL" : null].filter(Boolean) });
  }

  const collected = new Map<string, NonNullable<ReturnType<typeof normalize>>>();
  let searchedRadius = 1000;
  for (const radius of [1000, 5000, 15000, 30000]) {
    searchedRadius = radius;
    try {
      const response = await fetch(`${ratrooApiUrl()}/stops/nearby?${new URLSearchParams({ lat: String(lat), lng: String(lng), radius: String(radius) })}`, {
        headers: { "Accept": "application/json" },
      });
      if (!response.ok) continue;
      const raw = deepestData(await response.json());
      const stops = (Array.isArray(raw) ? raw : []).map(normalize).filter((stop): stop is NonNullable<ReturnType<typeof normalize>> => stop !== null);
      const filtered = mode ? stops.filter((stop) => stop.category.startsWith(mode)) : stops;
      for (const stop of filtered) collected.set(stop.id, stop);
      const values = [...collected.values()];
      if (mode && values.length) {
        return Response.json({ data: values.slice(0, 40), radiusMeters: radius, widened: radius > 1000 });
      }
      const hasBus = values.some((stop) => stop.category.startsWith("BUS"));
      const hasMetro = values.some((stop) => stop.category.startsWith("METRO"));
      if (hasBus && hasMetro) {
        return Response.json({ data: values.sort((a, b) => a.distanceMeters - b.distanceMeters).slice(0, 40), radiusMeters: radius, widened: radius > 1000 });
      }
    } catch {
      // Widen or return the honest empty state after the final attempt.
    }
  }
  return Response.json({
    data: [...collected.values()].sort((a, b) => a.distanceMeters - b.distanceMeters).slice(0, 40),
    radiusMeters: searchedRadius,
    widened: searchedRadius > 1000,
  });
}
