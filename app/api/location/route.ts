const KOLKATA_BOUNDS = { south: 22.40, north: 22.75, west: 88.20, east: 88.55 };
const BENGALURU_BOUNDS = { south: 12.75, north: 13.25, west: 77.35, east: 77.85 };

type Region = "kolkata" | "bengaluru" | "unsupported";

function inside(lat: number, lng: number, bounds: typeof KOLKATA_BOUNDS) {
  return lat >= bounds.south && lat <= bounds.north && lng >= bounds.west && lng <= bounds.east;
}

function regionFor(lat: number, lng: number): Region {
  if (inside(lat, lng, KOLKATA_BOUNDS)) return "kolkata";
  if (inside(lat, lng, BENGALURU_BOUNDS)) return "bengaluru";
  return "unsupported";
}

const regionDetails = {
  kolkata: {
    name: "Kolkata",
    backendSlug: "west-bengal",
    modes: ["BUS", "METRO", "FERRY", "TRAM", "SUBURBAN_RAIL"],
  },
  bengaluru: {
    name: "Bengaluru",
    backendSlug: "bengaluru",
    modes: ["BUS", "METRO"],
  },
  unsupported: {
    name: "Outside current coverage",
    backendSlug: null,
    modes: [],
  },
} as const;

function compactAddress(address: Record<string, string> | undefined, fallback: string) {
  if (!address) return fallback;
  const locality = address.suburb || address.neighbourhood || address.road || address.village;
  const city = address.city || address.town || address.municipality || address.county;
  const parts = [locality, city, address.state].filter(Boolean);
  return Array.from(new Set(parts)).join(", ") || fallback;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const lat = Number(url.searchParams.get("lat"));
  const lng = Number(url.searchParams.get("lng"));

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return Response.json({ message: "Valid latitude and longitude are required." }, { status: 400 });
  }

  const region = regionFor(lat, lng);
  let address = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

  try {
    const endpoint = new URL("https://nominatim.openstreetmap.org/reverse");
    endpoint.search = new URLSearchParams({
      format: "jsonv2",
      lat: String(lat),
      lon: String(lng),
      zoom: "16",
      addressdetails: "1",
      "accept-language": "en",
    }).toString();
    const response = await fetch(endpoint, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "RatrooTransit/1.0 (https://ratroo-transit.sambitghosh56.chatgpt.site)",
      },
    });
    if (response.ok) {
      const place = await response.json() as { display_name?: string; address?: Record<string, string> };
      address = compactAddress(place.address, place.display_name || address);
    }
  } catch {
    // Coordinates and region remain useful when the optional address service is unavailable.
  }

  return Response.json({
    latitude: lat,
    longitude: lng,
    address,
    region,
    ...regionDetails[region],
  }, {
    headers: { "Cache-Control": "public, max-age=300, s-maxage=86400" },
  });
}
