import { ratrooApiUrl } from "@/lib/ratroo-api";

/**
 * Buses moving near a point.
 *
 * Proxied rather than called from the browser so the backend origin stays
 * private, and given a short timeout: the map is useful without buses, and a
 * slow upstream must not stall the page. An empty list is a valid answer —
 * BMTC reports almost nothing after about 22:00 — so a failure here returns
 * empty with `available: false` rather than an error the map has to handle.
 */
const TIMEOUT_MS = 6000;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const lat = Number(url.searchParams.get("lat"));
  const lng = Number(url.searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return Response.json({ message: "lat and lng are required." }, { status: 400 });
  }

  const params = new URLSearchParams({
    lat: String(lat),
    lng: String(lng),
    radius: url.searchParams.get("radius") || "2000",
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${ratrooApiUrl()}/live/vehicles?${params}`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) return Response.json({ data: [], available: false });
    const payload = await response.json();
    // The API wraps every response in a success/data/metadata envelope, so the
    // controller's own `{ data, meta }` arrives one level down. Reading
    // `payload.data` alone returns that inner object, not the array — which
    // would have shown an empty map at every hour of the day.
    const body = payload?.data ?? payload;
    const vehicles = Array.isArray(body) ? body : Array.isArray(body?.data) ? body.data : [];

    return Response.json({
      data: vehicles,
      meta: body?.meta ?? null,
      available: true,
    });
  } catch {
    return Response.json({ data: [], available: false });
  } finally {
    clearTimeout(timer);
  }
}
