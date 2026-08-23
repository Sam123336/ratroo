import { ratrooApiUrl } from "@/lib/ratroo-api";
const BACKEND_TIMEOUT_MS = process.env.NODE_ENV === "development" ? 6000 : 1800;

type CityRegion = "kolkata" | "bengaluru";
type Region = CityRegion | "all";
type Suggestion = {
  id: string;
  name: string;
  type: string;
  mode: string;
  providerCode: string;
  subtitle: string;
  region?: CityRegion;
  latitude?: number;
  longitude?: number;
};

const curated: Record<CityRegion, Suggestion[]> = {
  kolkata: [
    { id: "kol-esplanade", name: "Esplanade", type: "BUS_STOP", mode: "BUS", providerCode: "WBTC", subtitle: "Bus stop · Central Kolkata" },
    { id: "kol-howrah", name: "Howrah Station", type: "RAILWAY_STATION", mode: "RAIL", providerCode: "EASTERN_RAILWAY_SUBURBAN", subtitle: "Railway station · Howrah" },
    { id: "kol-sealdah", name: "Sealdah Station", type: "RAILWAY_STATION", mode: "RAIL", providerCode: "EASTERN_RAILWAY_SUBURBAN", subtitle: "Railway station · Kolkata" },
    { id: "kol-rabindra-sadan", name: "Rabindra Sadan", type: "METRO_STATION", mode: "METRO", providerCode: "KOLKATA_METRO", subtitle: "Metro station · Line 1" },
    { id: "kol-rabindra-sarobar", name: "Rabindra Sarobar", type: "METRO_STATION", mode: "METRO", providerCode: "KOLKATA_METRO", subtitle: "Metro station · Line 1" },
    { id: "kol-park-street", name: "Park Street", type: "METRO_STATION", mode: "METRO", providerCode: "KOLKATA_METRO", subtitle: "Metro station · Central Kolkata" },
    { id: "kol-dakshineswar", name: "Dakshineswar", type: "METRO_STATION", mode: "METRO", providerCode: "KOLKATA_METRO", subtitle: "Metro station · North Kolkata" },
    { id: "kol-shyambazar", name: "Shyambazar", type: "METRO_STATION", mode: "METRO", providerCode: "KOLKATA_METRO", subtitle: "Metro and bus interchange" },
    { id: "kol-garia", name: "Garia", type: "BUS_STOP", mode: "BUS", providerCode: "WBTC", subtitle: "Bus and Metro area · South Kolkata" },
    { id: "kol-dumdum", name: "Dum Dum", type: "RAILWAY_STATION", mode: "RAIL", providerCode: "EASTERN_RAILWAY_SUBURBAN", subtitle: "Rail and Metro interchange" },
    { id: "kol-babughat", name: "Babughat Ferry Ghat", type: "FERRY_GHAT", mode: "FERRY", providerCode: "WB_FERRY", subtitle: "Ferry ghat · Hooghly River" },
    { id: "kol-millennium", name: "Millennium Park Ferry Ghat", type: "FERRY_GHAT", mode: "FERRY", providerCode: "WB_FERRY", subtitle: "Ferry ghat · Strand Road" },
  ],
  bengaluru: [
    { id: "blr-majestic", name: "Majestic", type: "METRO_STATION", mode: "METRO", providerCode: "BMRCL_METRO", subtitle: "Namma Metro and BMTC interchange" },
    { id: "blr-indiranagar", name: "Indiranagar", type: "METRO_STATION", mode: "METRO", providerCode: "BMRCL_METRO", subtitle: "Namma Metro · Purple Line" },
    { id: "blr-mg-road", name: "MG Road", type: "METRO_STATION", mode: "METRO", providerCode: "BMRCL_METRO", subtitle: "Namma Metro · Purple Line" },
    { id: "blr-yeshwanthpur", name: "Yeshwanthpur", type: "METRO_STATION", mode: "METRO", providerCode: "BMRCL_METRO", subtitle: "Metro, rail and BMTC interchange" },
    { id: "blr-silk-board", name: "Central Silk Board", type: "BUS_STOP", mode: "BUS", providerCode: "BMTC_OFFICIAL", subtitle: "BMTC bus stop · South Bengaluru" },
    { id: "blr-airport", name: "Kempegowda International Airport", type: "BUS_STOP", mode: "BUS", providerCode: "BMTC_OFFICIAL", subtitle: "Vayu Vajra airport bus" },
    { id: "blr-baiyappanahalli", name: "Baiyappanahalli", type: "METRO_STATION", mode: "METRO", providerCode: "BMRCL_METRO", subtitle: "Namma Metro · Purple Line" },
    { id: "blr-whitefield", name: "Whitefield", type: "METRO_STATION", mode: "METRO", providerCode: "BMRCL_METRO", subtitle: "Metro and BMTC area · East Bengaluru" },
    { id: "blr-koramangala", name: "Koramangala", type: "BUS_STOP", mode: "BUS", providerCode: "BMTC_OFFICIAL", subtitle: "BMTC bus area · Bengaluru" },
    { id: "blr-banashankari", name: "Banashankari", type: "METRO_STATION", mode: "METRO", providerCode: "BMRCL_METRO", subtitle: "Metro and BMTC interchange" },
  ],
};

function unwrapArray(payload: unknown): unknown[] {
  let current = payload;
  for (let index = 0; index < 3; index += 1) {
    if (Array.isArray(current)) return current;
    if (current && typeof current === "object" && "data" in current) current = (current as { data: unknown }).data;
    else break;
  }
  return Array.isArray(current) ? current : [];
}

function readableType(type: string) {
  return type.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function regionForResult(value: Record<string, unknown>, fallback?: CityRegion): CityRegion | undefined {
  const latitude = Number(value.latitude ?? value.lat);
  const longitude = Number(value.longitude ?? value.lng ?? value.lon);
  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    if (latitude >= 12.7 && latitude <= 13.3 && longitude >= 77.3 && longitude <= 78) return "bengaluru";
    if (latitude >= 21 && latitude <= 27.5 && longitude >= 85 && longitude <= 90) return "kolkata";
  }
  return fallback;
}

function normalize(item: unknown, index: number, region?: CityRegion): Suggestion | null {
  if (!item || typeof item !== "object") return null;
  const value = item as Record<string, unknown>;
  const name = String(value.title || value.name || value.canonicalName || "").trim();
  if (!name) return null;
  const type = String(value.category || value.type || "TRANSIT_STOP");
  const mode = String(value.mode || type.split("_")[0] || "TRANSIT");
  const subtitle = String(value.subtitle || `${readableType(type)}${value.providerCode ? ` · ${value.providerCode}` : ""}`);
  return {
    id: String(value.id || `${name}-${index}`),
    name,
    type,
    mode,
    providerCode: String(value.providerCode || "RATROO"),
    subtitle,
    region: regionForResult(value, region),
    latitude: Number.isFinite(Number(value.latitude ?? value.lat)) ? Number(value.latitude ?? value.lat) : undefined,
    longitude: Number.isFinite(Number(value.longitude ?? value.lng ?? value.lon)) ? Number(value.longitude ?? value.lng ?? value.lon) : undefined,
  };
}

function localMatches(region: Region, query: string) {
  const term = query.toLowerCase();
  const pool = region === "all" ? [...curated.kolkata, ...curated.bengaluru] : curated[region];
  return pool
    .filter((item) => `${item.name} ${item.subtitle}`.toLowerCase().includes(term))
    .sort((left, right) => Number(!left.name.toLowerCase().startsWith(term)) - Number(!right.name.toLowerCase().startsWith(term)))
    .map((item) => ({ ...item, region: region === "all" ? (curated.kolkata.includes(item) ? "kolkata" : "bengaluru") : region }));
}

async function fetchBackendMatches(endpoint: string, region?: CityRegion) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BACKEND_TIMEOUT_MS);
  try {
    const response = await fetch(endpoint, { headers: { "Accept": "application/json" }, signal: controller.signal });
    if (!response.ok) return [];
    return unwrapArray(await response.json()).map((item, index) => normalize(item, index, region)).filter((item): item is Suggestion => item !== null);
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

async function backendMatches(region: CityRegion, query: string) {
  const params = new URLSearchParams({ q: query, limit: "12" });
  if (region !== "bengaluru") {
    return fetchBackendMatches(`${ratrooApiUrl()}/search?${params}`, region);
  }

  // The regional index is intentionally narrower than the canonical search
  // index and may return a successful empty response for real BMTC stops.
  // An empty result is therefore not authoritative: fall back to the general
  // index and retain only results whose coordinates place them in Bengaluru.
  const regional = await fetchBackendMatches(`${ratrooApiUrl()}/regions/bengaluru/search?${params}`, region);
  if (regional.length) return regional;

  const canonical = await fetchBackendMatches(`${ratrooApiUrl()}/search?${params}`);
  return canonical.filter((item) => item.region === "bengaluru");
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") || "").trim();
  const region = url.searchParams.get("region") as Region;
  if (region !== "kolkata" && region !== "bengaluru" && region !== "all") {
    return Response.json({ message: "A valid search region is required." }, { status: 400 });
  }
  if (!query) return Response.json({ data: [] });

  const fallback = localMatches(region, query);
  if (query.length < 2) return Response.json({ data: fallback.slice(0, 7), source: "curated" });

  try {
    const backend = region === "all"
      ? (await Promise.all([backendMatches("kolkata", query), backendMatches("bengaluru", query)])).flat()
      : await backendMatches(region, query);
    const merged = [...backend, ...fallback].filter((item, index, all) => all.findIndex((other) => other.name.toLowerCase() === item.name.toLowerCase()) === index);
    return Response.json({ data: merged.slice(0, 10), source: backend.length ? "backend" : "curated" });
  } catch {
    return Response.json({ data: fallback.slice(0, 10), source: "curated", backendAvailable: false });
  }
}
