const RATROO_API = (process.env.RATROO_API_URL || (process.env.NODE_ENV === "development"
  ? "http://localhost:3000/v1"
  : "https://ratroo-backend-sams-projects-83758424.vercel.app/v1")).replace(/\/$/, "");

function unwrapArray(payload: unknown): unknown[] {
  let current = payload;
  for (let index = 0; index < 3; index += 1) {
    if (Array.isArray(current)) return current;
    if (current && typeof current === "object" && "data" in current) current = (current as { data: unknown }).data;
    else break;
  }
  return Array.isArray(current) ? current : [];
}

function present(item: unknown, index: number) {
  const value = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
  const title = String(value.longName || value.name || value.title || value.shortName || `Service ${index + 1}`);
  return {
    id: String(value.id || `${title}-${index}`),
    title,
    subtitle: String(value.providerCode || value.provider || value.subtitle || value.operationalStatus || "Ratroo network"),
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const region = url.searchParams.get("region");
  const mode = (url.searchParams.get("mode") || "").toLowerCase();
  if ((region !== "kolkata" && region !== "bengaluru") || !mode) {
    return Response.json({ message: "A supported region and mode are required." }, { status: 400 });
  }

  const regionSlug = region === "kolkata" ? "west-bengal" : "bengaluru";
  let endpoint: string | null = null;
  if (mode === "bus") endpoint = `${RATROO_API}/regions/${regionSlug}/bus/routes`;
  else if (mode === "metro") endpoint = `${RATROO_API}/regions/${regionSlug}/metro/lines`;
  else if (region === "kolkata" && ["tram", "ferry", "rail"].includes(mode)) {
    endpoint = `${RATROO_API}/search?${new URLSearchParams({ q: mode })}`;
  }

  if (!endpoint) return Response.json({ data: [], status: "planned", message: `${mode} data is not available in this region.` });

  try {
    const response = await fetch(endpoint, { headers: { "Accept": "application/json" } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return Response.json({ data: [], status: "development", message: `${mode} APIs are under development.` });
    }
    const data = unwrapArray(payload).map(present).slice(0, 16);
    return Response.json({
      data,
      status: data.length ? "active" : "empty",
      message: data.length ? null : `No active ${mode} dataset is published yet.`,
    });
  } catch {
    return Response.json({ data: [], status: "unavailable", message: "The local transit backend did not respond." });
  }
}
