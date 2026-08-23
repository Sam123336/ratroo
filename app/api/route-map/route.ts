import { RATROO_API } from "@/lib/ratroo-api";

function deepestData(value: unknown): unknown {
  let current = value;
  for (let index = 0; index < 3; index += 1) {
    if (current && typeof current === "object" && "data" in current) current = (current as { data: unknown }).data;
    else break;
  }
  return current;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const routeId = url.searchParams.get("routeId")?.trim();
  const centerLat = Number(url.searchParams.get("lat"));
  const centerLng = Number(url.searchParams.get("lng"));
  if (!routeId) return Response.json({ message: "A route id is required." }, { status: 400 });
  try {
    const response = await fetch(`${RATROO_API}/routes/${encodeURIComponent(routeId)}`, { headers: { "Accept": "application/json" } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return Response.json({ message: "Route geometry is unavailable." }, { status: response.status });
    const route = deepestData(payload) as Record<string, unknown>;
    const rows = Array.isArray(route.stops) ? route.stops : [];
    const stops = rows.map((item) => {
      const stop = item as Record<string, unknown>;
      if (stop.latitude == null || stop.longitude == null) return null;
      return { name: String(stop.name || "Stop"), latitude: Number(stop.latitude), longitude: Number(stop.longitude), sequence: Number(stop.stopSequence || 0) };
    }).filter((stop): stop is { name: string; latitude: number; longitude: number; sequence: number } => {
      if (!stop || !Number.isFinite(stop.latitude) || !Number.isFinite(stop.longitude) || (stop.latitude === 0 && stop.longitude === 0)) return false;
      if (!Number.isFinite(centerLat) || !Number.isFinite(centerLng)) return true;
      const distanceKm = Math.hypot((stop.latitude - centerLat) * 111, (stop.longitude - centerLng) * 100);
      return distanceKm <= 80;
    });
    return Response.json({ data: {
      id: String(route.id || routeId), name: String(route.longName || route.name || route.routeCode || "Selected route"),
      provider: String(route.providerCode || route.provider || "RATROO"), stops,
    } });
  } catch {
    return Response.json({ message: "The route map service did not respond." }, { status: 503 });
  }
}
