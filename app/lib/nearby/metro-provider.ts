export type NearbyMetroStop = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  provider: string;
  category: "METRO_STATION";
  distanceMeters: number;
  routes: Array<{ id: string; name: string }>;
};

export interface NearbyMetroProvider {
  findNearby(latitude: number, longitude: number, radiusMeters: number): Promise<NearbyMetroStop[]>;
}

type OverpassElement = {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string>;
};

function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = radians(lat2 - lat1);
  const dLng = radians(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

class OpenStreetMapMetroProvider implements NearbyMetroProvider {
  async findNearby(latitude: number, longitude: number, radiusMeters: number) {
    // Fetch a fixed public city dataset, never a radius around the user's
    // coordinates. Distance is calculated locally so Overpass does not receive
    // anyone's location.
    const query = `[out:json][timeout:15];(nwr["railway"="station"]["station"="subway"](12.65,77.30,13.25,78.05);nwr["public_transport"="station"]["subway"="yes"](12.65,77.30,13.25,78.05););out center tags;`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9_000);
    try {
      const response = await fetch(process.env.OVERPASS_API_URL || "https://overpass-api.de/api/interpreter", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: new URLSearchParams({ data: query }),
        signal: controller.signal,
      });
      if (!response.ok) return [];
      const payload = await response.json() as { elements?: OverpassElement[] };
      const seen = new Set<string>();
      return (payload.elements || []).flatMap((element) => {
        const stationLat = Number(element.lat ?? element.center?.lat);
        const stationLng = Number(element.lon ?? element.center?.lon);
        const name = String(element.tags?.name || element.tags?.["name:en"] || "").trim();
        const key = name.toLowerCase();
        if (!name || !Number.isFinite(stationLat) || !Number.isFinite(stationLng) || seen.has(key)) return [];
        seen.add(key);
        const distance = distanceMeters(latitude, longitude, stationLat, stationLng);
        if (distance > radiusMeters) return [];
        return [{
          id: `osm-metro-${element.type}-${element.id}`,
          name,
          latitude: stationLat,
          longitude: stationLng,
          provider: "BMRCL_OSM",
          category: "METRO_STATION" as const,
          distanceMeters: distance,
          routes: [],
        }];
      }).sort((a, b) => a.distanceMeters - b.distanceMeters).slice(0, 12);
    } catch {
      return [];
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Swap this provider for Google later without changing the route or UI. */
export function resolveNearbyMetroProvider(): NearbyMetroProvider {
  return new OpenStreetMapMetroProvider();
}
