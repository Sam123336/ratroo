const RATROO_API = (process.env.RATROO_API_URL || "https://ratroo-backend-sams-projects-83758424.vercel.app/v1").replace(/\/$/, "");

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
  let body: { from?: string; to?: string; region?: string };
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
      throw new Error(error.message || error.error?.message || `Ratroo API returned ${response.status}.`);
    }

    if (region === "bengaluru") return Response.json({ data: normalizeBengaluru(payload, from, to) });
    const journey = deepestData(payload);
    return Response.json({ data: journey });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown backend error";
    return Response.json({
      message: "The Ratroo transit backend is temporarily unavailable.",
      detail,
    }, { status: 503 });
  }
}
