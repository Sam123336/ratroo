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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 88_000);

  try {
    const response = await fetch(`${ratrooApiUrl()}/assistant/ask`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ question, ...(hasLocation ? { lat, lng } : {}) }),
      signal: controller.signal,
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({}));
    const data = unwrap(payload);
    if (!response.ok || !data?.answer?.trim()) {
      const error = payload as { message?: string };
      return Response.json({ message: error.message || "Ratroo AI could not answer that yet." }, { status: response.status || 502 });
    }
    return Response.json({ data: { answer: data.answer.trim(), toolCalls: data.toolCalls || [] } }, {
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
