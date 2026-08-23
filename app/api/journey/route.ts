const RATROO_API = (process.env.RATROO_API_URL || (process.env.NODE_ENV === "development"
  ? "http://localhost:3000/v1"
  : "https://ratroo-backend-sams-projects-83758424.vercel.app/v1")).replace(/\/$/, "");

type BengaluruLeg = {
  mode: string;
  routeName?: string;
  providerCode?: string;
  from: { name: string };
  to: { name: string };
  estimatedMinutes: number;
  instruction: string;
};

function deepestData(value: unknown): unknown {
  let current = value;
  for (let index = 0; index < 3; index += 1) {
    if (current && typeof current === "object" && "data" in current) current = (current as { data: unknown }).data;
    else break;
  }
  return current;
}

function normalizeBengaluru(payload: unknown, from: string, to: string) {
  const data = deepestData(payload) as {
    itineraries?: Array<{
      confidence: number;
      estimatedMinutes: number;
      transferCount: number;
      legs: BengaluruLeg[];
    }>;
    warnings?: string[];
  };
  const itinerary = data?.itineraries?.[0];
  if (!itinerary) {
    throw new Error(data?.warnings?.[0] || "No Bengaluru journey was found for those places.");
  }

  return {
    fromInput: from,
    toInput: to,
    legs: itinerary.legs.map((leg, index) => ({
      legNumber: index + 1,
      mode: leg.mode,
      fromName: leg.from.name,
      toName: leg.to.name,
      distanceKm: "—",
      durationMinutes: leg.estimatedMinutes,
      serviceName: leg.routeName,
      instructions: leg.instruction,
    })),
    totalDistanceKm: "—",
    totalDurationMinutes: itinerary.estimatedMinutes,
    transfersCount: itinerary.transferCount,
    totalFare: null,
    confidenceScore: itinerary.confidence,
    confidenceBadges: ["BMRCL / BMTC active data", "Bengaluru journey engine"],
  };
}

export async function POST(request: Request) {
  let body: { from?: string; to?: string; region?: string; routeId?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ message: "A JSON request body is required." }, { status: 400 });
  }

  const from = body.from?.trim();
  const to = body.to?.trim();
  const region = body.region;
  if (!from || !to) return Response.json({ message: "Both from and to locations are required." }, { status: 400 });
  if (region !== "kolkata" && region !== "bengaluru") {
    return Response.json({ message: "Choose Kolkata or Bengaluru before planning a journey." }, { status: 400 });
  }

  try {
    if (region === "bengaluru" && body.routeId) {
      const direct = await directRouteJourney(body.routeId, from, to);
      if (direct) return Response.json({ data: direct });
    }
    const endpoint = region === "bengaluru"
      ? `${RATROO_API}/regions/bengaluru/journeys?${new URLSearchParams({ from, to, limit: "5" })}`
      : `${RATROO_API}/journey`;
    const response = await fetch(endpoint, region === "bengaluru" ? {
      headers: { "Accept": "application/json" },
    } : {
      method: "POST",
      headers: { "Accept": "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ from, to }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = payload as { message?: string; error?: { message?: string } };
      const message = error.message || error.error?.message || `Ratroo API returned ${response.status}.`;
      return Response.json({ message }, { status: response.status >= 500 ? 503 : response.status });
    }

    if (region === "bengaluru") return Response.json({ data: normalizeBengaluru(payload, from, to) });
    const journey = deepestData(payload);
    return Response.json({ data: journey });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown backend error";
    const noMatch = /no matching|no .*journey|not found/i.test(detail);
    return Response.json({
      message: noMatch ? detail : "The Ratroo transit backend is temporarily unavailable.",
      detail,
    }, { status: noMatch ? 404 : 503 });
  }
}

async function directRouteJourney(routeId: string, from: string, to: string) {
  const response = await fetch(`${RATROO_API}/routes/${encodeURIComponent(routeId)}`, { headers: { "Accept": "application/json" } });
  if (!response.ok) return null;
  const route = deepestData(await response.json()) as Record<string, unknown>;
  const stops = (Array.isArray(route.stops) ? route.stops : []) as Array<Record<string, unknown>>;
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
  const fromKey = normalize(from);
  const toKey = normalize(to);
  const originIndex = stops.findIndex((stop) => normalize(String(stop.name || "")) === fromKey);
  const destinationIndex = stops.findIndex((stop) => normalize(String(stop.name || "")) === toKey);
  if (destinationIndex < 0 || originIndex === destinationIndex) return null;
  // Some provider route records only expose their two terminal stops even
  // though the selected place is linked to that route. The reachable-place
  // lookup is the authoritative boarding association in that case.
  const origin = originIndex >= 0 ? stops[originIndex] : { name: from };
  const destination = stops[destinationIndex];
  const stopCount = originIndex >= 0 ? Math.abs(destinationIndex - originIndex) : Math.max(1, stops.length - 1);
  const durationMinutes = Math.max(4, stopCount * 2);
  const serviceName = String(route.longName || route.routeCode || route.shortName || "BMTC service");
  return {
    fromInput: from,
    toInput: to,
    legs: [{
      legNumber: 1,
      mode: String(route.routeType || "BUS"),
      fromName: String(origin.name || from),
      toName: String(destination.name || to),
      distanceKm: "—",
      durationMinutes,
      serviceName,
      routeId: String(route.id || routeId),
      departureTime: origin.departureTime || null,
      arrivalTime: destination.departureTime || null,
      instructions: `Board ${serviceName} at ${String(origin.name || from)} and ride ${stopCount} stops to ${String(destination.name || to)}.`,
    }],
    totalDistanceKm: "—",
    totalDurationMinutes: durationMinutes,
    transfersCount: 0,
    totalFare: null,
    confidenceScore: originIndex >= 0 ? 0.92 : 0.84,
    confidenceBadges: [
      String(route.providerCode || "BMTC_OFFICIAL"),
      originIndex >= 0 ? "Direct route stop sequence" : "Boarding stop linked by provider place data",
    ],
  };
}
