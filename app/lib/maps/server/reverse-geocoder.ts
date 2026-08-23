export type ReverseGeocodeResult = { address: string };

export interface ReverseGeocoder {
  readonly id: string;
  reverse(latitude: number, longitude: number, signal?: AbortSignal): Promise<ReverseGeocodeResult | null>;
}

function compactAddress(address: Record<string, string> | undefined, fallback: string) {
  if (!address) return fallback;
  const locality = address.suburb || address.neighbourhood || address.road || address.village;
  const city = address.city || address.town || address.municipality || address.county;
  return Array.from(new Set([locality, city, address.state].filter(Boolean))).join(", ") || fallback;
}

class OpenReverseGeocoder implements ReverseGeocoder {
  readonly id = "open";

  async reverse(latitude: number, longitude: number, signal?: AbortSignal) {
    const endpoint = new URL(process.env.OPEN_MAP_GEOCODING_URL || "https://nominatim.openstreetmap.org/reverse");
    endpoint.search = new URLSearchParams({
      format: "jsonv2",
      lat: String(latitude),
      lon: String(longitude),
      zoom: "16",
      addressdetails: "1",
      "accept-language": "en",
    }).toString();
    const response = await fetch(endpoint, {
      signal,
      headers: {
        Accept: "application/json",
        "User-Agent": process.env.MAP_GEOCODING_USER_AGENT || "RatrooTransit/1.0 (https://ratroo.vercel.app)",
      },
    });
    if (!response.ok) return null;
    const place = await response.json() as { display_name?: string; address?: Record<string, string> };
    return { address: compactAddress(place.address, place.display_name || `${latitude}, ${longitude}`) };
  }
}

class GoogleReverseGeocoder implements ReverseGeocoder {
  readonly id = "google";

  async reverse(latitude: number, longitude: number, signal?: AbortSignal) {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) throw new Error("GOOGLE_MAPS_API_KEY is required for the Google geocoding provider.");
    const endpoint = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    endpoint.search = new URLSearchParams({ latlng: `${latitude},${longitude}`, key: apiKey }).toString();
    const response = await fetch(endpoint, { signal, headers: { Accept: "application/json" } });
    if (!response.ok) return null;
    const payload = await response.json() as { status?: string; results?: Array<{ formatted_address?: string }> };
    const address = payload.results?.[0]?.formatted_address;
    return payload.status === "OK" && address ? { address } : null;
  }
}

const providers: Record<string, ReverseGeocoder> = {
  open: new OpenReverseGeocoder(),
  google: new GoogleReverseGeocoder(),
};

export function resolveReverseGeocoder(name = process.env.MAP_GEOCODING_PROVIDER || "open") {
  const provider = providers[name];
  if (!provider) throw new Error(`Reverse-geocoding provider "${name}" is not registered.`);
  return provider;
}
