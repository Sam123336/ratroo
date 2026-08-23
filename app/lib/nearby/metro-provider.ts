import { BENGALURU_METRO_STATIONS } from "./bengaluru-metro-stations";

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
    return BENGALURU_METRO_STATIONS.map((station, index) => ({
      id: `osm-metro-${index}`,
      name: station.name,
      latitude: station.latitude,
      longitude: station.longitude,
      provider: "BMRCL_OSM",
      category: "METRO_STATION" as const,
      distanceMeters: distanceMeters(latitude, longitude, station.latitude, station.longitude),
      routes: [],
    })).filter((station) => station.distanceMeters <= radiusMeters)
      .sort((a, b) => a.distanceMeters - b.distanceMeters)
      .slice(0, 12);
  }
}

/** Swap this provider for Google later without changing the route or UI. */
export function resolveNearbyMetroProvider(): NearbyMetroProvider {
  return new OpenStreetMapMetroProvider();
}
