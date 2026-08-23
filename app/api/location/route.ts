import { ratrooApiUrl } from "@/lib/ratroo-api";

type SupportedRegion = "kolkata" | "bengaluru" | "unsupported";

function deepestData(value: unknown): unknown {
  let current = value;
  for (let index = 0; index < 4; index += 1) {
    if (current && typeof current === "object" && "data" in current) current = (current as { data: unknown }).data;
    else break;
  }
  return current;
}

function compactAddress(address: Record<string, string> | undefined, fallback: string) {
  if (!address) return fallback;
  const locality = address.suburb || address.neighbourhood || address.road || address.village;
  const city = address.city || address.town || address.municipality || address.county;
  const parts = [locality, city, address.state].filter(Boolean);
  return Array.from(new Set(parts)).join(", ") || fallback;
}

function regionFromState(stateCode: string | null): SupportedRegion {
  if (stateCode === "WB") return "kolkata";
  if (stateCode === "KA") return "bengaluru";
  return "unsupported";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const lat = Number(url.searchParams.get("lat"));
  const lng = Number(url.searchParams.get("lng"));

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return Response.json({ message: "Valid latitude and longitude are required." }, { status: 400 });
  }

  let address = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  let stateCode: string | null = null;
  let coverageName: string | null = null;
  let coverageModes: string[] = [];
  let routeCount = 0;
  let stopCount = 0;

  const [coverageResult, addressResult] = await Promise.allSettled([
    fetch(`${ratrooApiUrl()}/coverage/summary?${new URLSearchParams({ lat: String(lat), lng: String(lng) })}`, {
      headers: { "Accept": "application/json" },
    }),
    (async () => {
      const endpoint = new URL("https://nominatim.openstreetmap.org/reverse");
      endpoint.search = new URLSearchParams({
        format: "jsonv2", lat: String(lat), lon: String(lng), zoom: "16", addressdetails: "1", "accept-language": "en",
      }).toString();
      return fetch(endpoint, {
        headers: { "Accept": "application/json", "User-Agent": "RatrooTransit/1.0 (https://ratroo-transit.sambitghosh56.chatgpt.site)" },
      });
    })(),
  ]);

  if (coverageResult.status === "fulfilled" && coverageResult.value.ok) {
    const coverage = deepestData(await coverageResult.value.json()) as {
      stateCode?: string | null; region?: string | null; modes?: string[]; routeCount?: number; stopCount?: number;
    };
    stateCode = coverage?.stateCode || null;
    coverageName = coverage?.region || null;
    coverageModes = coverage?.modes || [];
    routeCount = Number(coverage?.routeCount || 0);
    stopCount = Number(coverage?.stopCount || 0);
  }

  if (addressResult.status === "fulfilled" && addressResult.value.ok) {
    const place = await addressResult.value.json() as { display_name?: string; address?: Record<string, string> };
    address = compactAddress(place.address, place.display_name || address);
  }

  const region = regionFromState(stateCode);
  const expectedModes = region === "kolkata" ? ["BUS", "METRO", "FERRY", "TRAM", "RAIL"]
    : region === "bengaluru" ? ["BUS", "METRO"] : [];

  return Response.json({
    latitude: lat,
    longitude: lng,
    address,
    region,
    name: coverageName || (region === "unsupported" ? "Outside current coverage" : region),
    backendSlug: region === "kolkata" ? "west-bengal" : region === "bengaluru" ? "bengaluru" : null,
    stateCode,
    modes: Array.from(new Set([...coverageModes.map((mode) => mode.toUpperCase()), ...expectedModes])),
    routeCount,
    stopCount,
    coverageMethod: "backend-polygon",
  }, { headers: { "Cache-Control": "public, max-age=300, s-maxage=3600" } });
}
