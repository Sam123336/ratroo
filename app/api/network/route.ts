import { ratrooApiUrl } from "@/lib/ratroo-api";
import { hasCoordinates, regionForResult } from "../suggestions/region-filter";

function unwrapArray(payload: unknown): unknown[] {
  let current = payload;
  for (let index = 0; index < 3; index += 1) {
    if (Array.isArray(current)) return current;
    if (current && typeof current === "object" && "data" in current) current = (current as { data: unknown }).data;
    else break;
  }
  return Array.isArray(current) ? current : [];
}

function present(item: unknown, index: number) {
  const value = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
  const title = String(value.longName || value.name || value.title || value.shortName || `Service ${index + 1}`);
  return {
    id: String(value.id || `${title}-${index}`),
    title,
    subtitle: String(value.providerCode || value.provider || value.subtitle || value.operationalStatus || "Ratroo network"),
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const region = url.searchParams.get("region");
  const mode = (url.searchParams.get("mode") || "").toLowerCase();
  // Number(null) is 0, not NaN, and Number.isFinite(0) is true — so an absent
  // lat/lng used to look like a valid position at 0,0 in the Gulf of Guinea.
  // Every bus request therefore asked for stops near the null island, found
  // none, and the page reported West Bengal's 200 routes as "not published yet".
  const latParam = url.searchParams.get("lat");
  const lngParam = url.searchParams.get("lng");
  const lat = latParam === null ? NaN : Number(latParam);
  const lng = lngParam === null ? NaN : Number(lngParam);
  if ((region !== "kolkata" && region !== "bengaluru") || !mode) {
    return Response.json({ message: "A supported region and mode are required." }, { status: 400 });
  }

  const regionSlug = region === "kolkata" ? "west-bengal" : "bengaluru";
  let endpoint: string | null = null;
  const useNearbyBus = mode === "bus" && Number.isFinite(lat) && Number.isFinite(lng);
  if (useNearbyBus) endpoint = `${ratrooApiUrl()}/stops/nearby?${new URLSearchParams({ lat: String(lat), lng: String(lng), radius: "5000" })}`;
  else if (mode === "bus") endpoint = `${ratrooApiUrl()}/regions/${regionSlug}/bus/routes`;
  else if (mode === "metro") endpoint = `${ratrooApiUrl()}/regions/${regionSlug}/metro/lines`;
  // These three have no network endpoint, so they fall back to a name search
  // for the mode word. That matches "Railway Station" anywhere in India, which
  // is why the results have to be region-filtered below.
  let isSearchFallback = false;
  if (!endpoint && region === "kolkata" && ["tram", "ferry", "rail"].includes(mode)) {
    endpoint = `${ratrooApiUrl()}/search?${new URLSearchParams({ q: mode })}`;
    isSearchFallback = true;
  }

  if (!endpoint) return Response.json({ data: [], status: "planned", message: `${mode} data is not available in this region.` });

  try {
    const response = await fetch(endpoint, { headers: { "Accept": "application/json" } });
    if (!response.ok) {
      return Response.json({ data: [], status: "development", message: `${mode} APIs are under development.` });
    }

    // Read the body, then parse it, so a body that arrives unreadable is not
    // reported as an absence of data. `response.json().catch(() => ({}))` used
    // to turn a parse failure into an empty array, which this route then
    // published as "no active dataset yet" — West Bengal has 200 bus routes
    // and the page said none were published.
    const raw = await response.text();
    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      return Response.json({
        data: [],
        status: "unreadable",
        message: `The ${mode} response could not be read (${raw.length} bytes). This is a fault here, not missing data.`,
      });
    }

    let data = unwrapArray(payload).map(present).slice(0, 24);

    // A text search for "rail" matches every "Railway Station" in the country,
    // so Kolkata was being shown KR Pura and Yeshawanthapura — Bengaluru
    // stations, 1,500 km away. Anything the coordinates place in another region
    // is dropped; anything unplaceable is kept, since most West Bengal rows
    // carry no coordinates at all and Sealdah is not a Karnataka station.
    if (isSearchFallback) {
      data = unwrapArray(payload)
        .filter((item) => {
          const value = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
          // Keep a row only if it is not somewhere else. A row that carries no
          // usable coordinates stays — most West Bengal records have none, and
          // Sealdah is not a Karnataka station. A row that does carry them must
          // land in this region: a bounding box it merely misses is still not
          // here, which is how Solur Railway Station survived the first pass.
          return !hasCoordinates(value) || regionForResult(value) === region;
        })
        .map(present)
        .slice(0, 24);
    }
    if (useNearbyBus) {
      const seen = new Set<string>();
      data = unwrapArray(payload).flatMap((item) => {
        const stop = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
        const routes = Array.isArray(stop.routes) ? stop.routes : [];
        return routes.map((route) => {
          const row = (route && typeof route === "object" ? route : {}) as Record<string, unknown>;
          const id = String(row.id || "");
          if (!id || seen.has(id)) return null;
          seen.add(id);
          const distance = Number(stop.distanceMeters || 0);
          return {
            id,
            title: String(row.name || "Bus service"),
            subtitle: `${String(stop.name || "Nearby stop")} · ${distance < 1000 ? `${Math.round(distance)} m` : `${(distance / 1000).toFixed(1)} km`} away`,
          };
        });
      }).filter((item): item is { id: string; title: string; subtitle: string } => item !== null).slice(0, 24);
    }
    return Response.json({
      data,
      status: data.length ? "active" : "empty",
      message: data.length ? null : `No active ${mode} dataset is published yet.`,
    });
  } catch {
    return Response.json({ data: [], status: "unavailable", message: "The local transit backend did not respond." });
  }
}
