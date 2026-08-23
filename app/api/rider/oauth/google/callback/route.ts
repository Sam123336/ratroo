import { cookies } from "next/headers";
import { ratrooApiUrl } from "@/lib/ratroo-api";
import { setRiderSession, unwrapAuthTokens } from "@/lib/rider-session";

function riderRedirect(request: Request, error?: string) {
  const url = new URL("/rider", request.url);
  if (error) url.searchParams.set("oauth_error", error);
  else url.searchParams.set("oauth", "success");
  return Response.redirect(url);
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  if (requestUrl.searchParams.get("error")) return riderRedirect(request, "cancelled");
  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const jar = await cookies();
  const expectedState = jar.get("ratroo_rider_oauth_state")?.value;
  const verifier = jar.get("ratroo_rider_oauth_verifier")?.value;
  jar.delete("ratroo_rider_oauth_state");
  jar.delete("ratroo_rider_oauth_verifier");
  if (!code || !state || !expectedState || state !== expectedState || !verifier) return riderRedirect(request, "invalid_state");

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return riderRedirect(request, "not_configured");
  const redirectUri = process.env.RIDER_GOOGLE_OAUTH_REDIRECT_URI || `${requestUrl.origin}/api/rider/oauth/google/callback`;

  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code", code_verifier: verifier }),
    });
    const googleTokens = await tokenResponse.json().catch(() => ({})) as { id_token?: string };
    if (!tokenResponse.ok || !googleTokens.id_token) return riderRedirect(request, "token_exchange");

    const backendResponse = await fetch(`${ratrooApiUrl()}/auth/oauth/google`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ idToken: googleTokens.id_token }),
    });
    const payload = await backendResponse.json().catch(() => ({}));
    const session = unwrapAuthTokens(payload);
    if (!backendResponse.ok || !session) return riderRedirect(request, "backend_rejected");
    setRiderSession(jar, session);
    return riderRedirect(request);
  } catch {
    return riderRedirect(request, "temporarily_unavailable");
  }
}
