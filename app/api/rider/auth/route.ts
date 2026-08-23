import { cookies } from "next/headers";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  if (String(body.action || "") !== "logout") {
    return Response.json(
      { message: "Rider access requires a verified Google account. Continue with Google." },
      { status: 403 },
    );
  }

  const jar = await cookies();
  jar.delete("ratroo_rider_access");
  jar.delete("ratroo_rider_refresh");
  return Response.json({ data: { loggedOut: true } });
}
