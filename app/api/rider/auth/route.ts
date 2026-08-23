import { cookies } from "next/headers";
import { ratrooApiUrl } from "@/lib/ratroo-api";

type AuthAction = "login" | "register" | "logout";

function unwrap(value: unknown): Record<string, unknown> {
  let current = value;
  for (let index = 0; index < 3; index += 1) {
    if (current && typeof current === "object" && "data" in current) current = (current as { data: unknown }).data;
  }
  return (current && typeof current === "object" ? current : {}) as Record<string, unknown>;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = String(body.action || "") as AuthAction;
  const jar = await cookies();

  if (action === "logout") {
    jar.delete("ratroo_rider_access");
    jar.delete("ratroo_rider_refresh");
    return Response.json({ data: { loggedOut: true } });
  }
  if (action !== "login" && action !== "register") {
    return Response.json({ message: "Choose login or register." }, { status: 400 });
  }

  const response = await fetch(`${ratrooApiUrl()}/auth/${action}`, {
    method: "POST",
    headers: { "Accept": "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ email: body.email, password: body.password, displayName: body.displayName }),
  });
  const payload = await response.json().catch(() => ({}));
  const data = unwrap(payload);
  if (!response.ok || typeof data.accessToken !== "string") {
    const error = payload as { message?: string };
    return Response.json({ message: error.message || "We could not sign you in." }, { status: response.status || 500 });
  }

  const secure = process.env.NODE_ENV === "production";
  jar.set("ratroo_rider_access", data.accessToken, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: Number(data.expiresIn || 900) });
  if (typeof data.refreshToken === "string") {
    jar.set("ratroo_rider_refresh", data.refreshToken, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 30 * 24 * 60 * 60 });
  }
  return Response.json({ data: { user: data.user } });
}
