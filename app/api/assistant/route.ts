import { ratrooApiUrl } from "@/lib/ratroo-api";

type RateBucket = { count: number; resetsAt: number };
const runtime = globalThis as typeof globalThis & { __ratrooAssistantLimits?: Map<string, RateBucket> };
const limits = runtime.__ratrooAssistantLimits ??= new Map<string, RateBucket>();
const WINDOW_MS = 5 * 60 * 1000;
const MAX_QUESTIONS = 10;

function clientId(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")
    || "anonymous";
}

function isRateLimited(request: Request) {
  const id = clientId(request);
  const now = Date.now();
  const current = limits.get(id);
  if (!current || current.resetsAt <= now) {
    limits.set(id, { count: 1, resetsAt: now + WINDOW_MS });
    return false;
  }
  current.count += 1;
  return current.count > MAX_QUESTIONS;
}

function unwrap(value: unknown) {
  let current = value;
  for (let index = 0; index < 3; index += 1) {
    if (current && typeof current === "object" && "data" in current) current = (current as { data: unknown }).data;
  }
  return current as { answer?: string; toolCalls?: string[] } | null;
}

const BENGALURU_TERMS = /\b(bengaluru|bangalore|karnataka|whitefield|kasavanahalli|majestic|indiranagar|koramangala|electronic city|kempegowda)\b/i;
const WEST_BENGAL_ONLY = /(only (?:cover|covers|support|supports).*west bengal|tools?[\s\S]{0,220}west bengal|west bengal[\s\S]{0,100}(?:only|limited)|(?:cannot|can't|do not|don't)[\s\S]{0,180}(?:bmtc|bmrcl|bengaluru|karnataka)|karnataka.*(?:not|isn't|is not).*cover)/i;

function isBengaluruRequest(question: string, lat?: number, lng?: number) {
  const inBengaluru = lat !== undefined && lng !== undefined
    && lat >= 12.65 && lat <= 13.25 && lng >= 77.30 && lng <= 78.05;
  return inBengaluru || BENGALURU_TERMS.test(question);
}

type NearbyStop = { name: string; provider: string; category: string; distanceMeters: number; routes: string[] };

function nearbyStops(value: unknown): NearbyStop[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 10).map((item) => {
    const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const routes = Array.isArray(row.routes) ? row.routes : [];
    return {
      name: String(row.name || "").trim().slice(0, 100),
      provider: String(row.provider || "RATROO").trim().slice(0, 50),
      category: String(row.category || "TRANSIT_STOP").trim().slice(0, 40),
      distanceMeters: Math.max(0, Math.round(Number(row.distanceMeters) || 0)),
      routes: routes.slice(0, 5).map((route) => String(route && typeof route === "object" ? (route as Record<string, unknown>).name || "" : route).trim().slice(0, 60)).filter(Boolean),
    };
  }).filter((stop) => stop.name);
}

function questionWithNearbyStops(question: string, bengaluru: boolean, stops: NearbyStop[]) {
  if (!bengaluru && !stops.length) return question;
  const list = stops.slice(0, 6).map((stop) => {
    const mode = stop.category.startsWith("METRO") ? "metro" : "bus";
    const route = stop.routes[0] ? `,${stop.routes[0].slice(0, 20)}` : "";
    return `${stop.name.slice(0, 38)}(${mode},${stop.distanceMeters}m${route})`;
  }).join("; ").slice(0, 260);
  const prefix = [
    "Website context:",
    bengaluru ? "Bengaluru/Karnataka is supported; use canonical BMTC/BMRCL tools, not WBBus." : "",
    list ? `Nearby boarding options: ${list}.` : "",
    "Use the closest suitable origin; never invent a connection.",
  ].filter(Boolean).join(" ");
  const room = Math.max(2, 500 - prefix.length - 7);
  return `${prefix}\nUser: ${question.slice(0, room)}`;
}

function isRouteQuestion(question: string) {
  return /(?:\bfrom\b.*\bto\b|\bto\b|→|\btheke\b|\broute\b|\bjourney\b)/i.test(question);
}

function websiteAnswer(answer: string, bengaluru: boolean, grounded: boolean, routeQuestion: boolean) {
  if (!bengaluru || (!WEST_BENGAL_ONLY.test(answer) && (grounded || !routeQuestion))) return answer;
  return "🚏 Bengaluru journey\n\nRatroo found nearby BMTC stops, but it could not verify a published stop sequence connecting this origin and destination. A nearby stop does not automatically mean that one of its buses serves the requested destination. Try an exact BMTC stop name or route number.";
}

function nearbyFallback(stops: NearbyStop[]) {
  const distance = (metres: number) => metres < 1000 ? `${metres} m` : `${(metres / 1000).toFixed(1)} km`;
  const lines = (label: string, values: NearbyStop[]) => values.length
    ? [`${label}:`, ...values.slice(0, 3).map((stop) =>
      `• ${stop.name} — ${distance(stop.distanceMeters)}${stop.routes.length ? ` — ${stop.routes.slice(0, 3).join(", ")}` : ""}`,
    )]
    : [];
  const buses = stops.filter((stop) => stop.category.startsWith("BUS"));
  const metros = stops.filter((stop) => stop.category.startsWith("METRO"));
  return [
    "🚏 Nearby boarding options",
    "",
    ...lines("🚌 Bus stops", buses),
    ...(buses.length && metros.length ? [""] : []),
    ...lines("🚇 Metro stations", metros),
    "",
    "The full route lookup is taking longer than expected. These are live nearby options; choose an exact stop or route number and try again.",
  ].join("\n");
}

function fallbackResponse(stops: NearbyStop[]) {
  return Response.json({ data: { answer: nearbyFallback(stops), toolCalls: ["nearby_stops"] } }, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  if (isRateLimited(request)) {
    return Response.json({ message: "Too many questions right now. Please wait a few minutes and try again." }, { status: 429 });
  }

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (question.length < 2 || question.length > 500) {
    return Response.json({ message: "Ask a question between 2 and 500 characters." }, { status: 400 });
  }

  const lat = Number(body.lat);
  const lng = Number(body.lng);
  const hasLocation = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  const bengaluru = isBengaluruRequest(question, hasLocation ? lat : undefined, hasLocation ? lng : undefined);
  const routeQuestion = isRouteQuestion(question);
  const stops = nearbyStops(body.nearbyStops);
  const controller = new AbortController();
  // Finish before the hosting gateway closes the connection. Bengaluru can
  // still return the already-resolved nearby network when the model is slow.
  const timer = setTimeout(() => controller.abort(), 25_000);

  try {
    const response = await fetch(`${ratrooApiUrl()}/assistant/ask`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ question: questionWithNearbyStops(question, bengaluru, stops), ...(hasLocation ? { lat, lng } : {}) }),
      signal: controller.signal,
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({}));
    const data = unwrap(payload);
    if (!response.ok || !data?.answer?.trim()) {
      if (bengaluru && stops.length) return fallbackResponse(stops);
      const error = payload as { message?: string | string[] };
      const detail = Array.isArray(error.message) ? error.message.join(" ") : error.message;
      return Response.json({ message: detail || "Ratroo AI could not answer that yet." }, { status: response.status || 502 });
    }
    const toolCalls = data.toolCalls || [];
    return Response.json({ data: { answer: websiteAnswer(data.answer.trim(), bengaluru, toolCalls.length > 0, routeQuestion), toolCalls } }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (bengaluru && stops.length) return fallbackResponse(stops);
    return Response.json({
      message: error instanceof Error && error.name === "AbortError"
        ? "Ratroo AI took too long. Please try a more specific journey question."
        : "Ratroo AI is temporarily unavailable. Please try again shortly.",
    }, { status: 503 });
  } finally {
    clearTimeout(timer);
  }
}
