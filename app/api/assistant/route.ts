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
const WEST_BENGAL_ONLY = /(only (?:cover|covers|support|supports).*west bengal|tools? (?:available|provided).*west bengal|karnataka.*(?:not|isn't|is not).*cover)/i;

function isBengaluruRequest(question: string, lat?: number, lng?: number) {
  const inBengaluru = lat !== undefined && lng !== undefined
    && lat >= 12.65 && lat <= 13.25 && lng >= 77.30 && lng <= 78.05;
  return inBengaluru || BENGALURU_TERMS.test(question);
}

function websiteQuestion(question: string, bengaluru: boolean) {
  if (!bengaluru) return question;
  return `PUBLIC WEBSITE COVERAGE: This journey is in Bengaluru/Karnataka, one of Ratroo's supported launch networks. Use the canonical journey and service tools for BMTC/BMRCL data. WBBus.in is West-Bengal-only and an empty WBBus.in result does not mean Bengaluru is unsupported. If the canonical tools find nothing, say only that no matching published route was found in Ratroo's current Bengaluru data.\n\nUSER QUESTION: ${question}`;
}

function websiteAnswer(answer: string, bengaluru: boolean) {
  if (!bengaluru || !WEST_BENGAL_ONLY.test(answer)) return answer;
  return "🚏 Bengaluru journey\n\nI couldn't find a matching published route in Ratroo's current Bengaluru data. Try the official BMTC stop names or a bus route number so I can search more precisely.";
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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 88_000);

  try {
    const response = await fetch(`${ratrooApiUrl()}/assistant/ask`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ question: websiteQuestion(question, bengaluru), ...(hasLocation ? { lat, lng } : {}) }),
      signal: controller.signal,
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({}));
    const data = unwrap(payload);
    if (!response.ok || !data?.answer?.trim()) {
      const error = payload as { message?: string };
      return Response.json({ message: error.message || "Ratroo AI could not answer that yet." }, { status: response.status || 502 });
    }
    return Response.json({ data: { answer: websiteAnswer(data.answer.trim(), bengaluru), toolCalls: data.toolCalls || [] } }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return Response.json({
      message: error instanceof Error && error.name === "AbortError"
        ? "Ratroo AI took too long. Please try a more specific journey question."
        : "Ratroo AI is temporarily unavailable. Please try again shortly.",
    }, { status: 503 });
  } finally {
    clearTimeout(timer);
  }
}
