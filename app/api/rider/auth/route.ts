import { cookies } from "next/headers";
import { ratrooApiUrl } from "@/lib/ratroo-api";
import { setRiderSession, unwrapAuthTokens } from "@/lib/rider-session";

type AuthAction = "login" | "register" | "logout";

export async function POST(request: Request) {
  try {
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
    const data = unwrapAuthTokens(payload);
    if (!response.ok || !data) {
      const error = payload as { message?: string };
      return Response.json({ message: error.message || "Incorrect email or password." }, { status: response.status || 500 });
    }

    setRiderSession(jar, data);
    return Response.json({ data: { user: data.user } });
  } catch (error) {
    const message = error instanceof Error && error.message.includes("RATROO_API_URL")
      ? "Ratroo Rider is not connected to the backend yet. Please redeploy after configuring RATROO_API_URL."
      : "The Ratroo backend could not be reached. Please try again shortly.";
    return Response.json({ message }, { status: 503 });
  }
}
