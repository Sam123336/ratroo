import { ratrooApiUrl } from "@/lib/ratroo-api";
import { resolveReverseGeocoder } from "@/app/lib/maps/server/reverse-geocoder";

type SupportedRegion = "kolkata" | "bengaluru" | "unsupported";

function deepestData(value: unknown): unknown {
  let current = value;
  for (let index = 0; index < 4; index += 1) {
    if (current && typeof current === "object" && "data" in current) current = (current as { data: unknown }).data;
    else break;
  }
  return current;
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
    resolveReverseGeocoder().reverse(lat, lng),
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

  if (addressResult.status === "fulfilled" && addressResult.value) {
    address = addressResult.value.address;
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
