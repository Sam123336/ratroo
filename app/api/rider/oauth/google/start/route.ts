import { createHash, randomBytes } from "crypto";
import { cookies } from "next/headers";

export async function GET(request: Request) {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return Response.redirect(new URL("/rider?oauth_error=not_configured", request.url));
  }

  const origin = new URL(request.url).origin;
  const redirectUri = process.env.RIDER_GOOGLE_OAUTH_REDIRECT_URI || `${origin}/api/rider/oauth/google/callback`;
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(64).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const secure = process.env.NODE_ENV === "production";
  const jar = await cookies();
  const cookieOptions = { httpOnly: true, secure, sameSite: "lax" as const, path: "/api/rider/oauth/google", maxAge: 10 * 60 };
  jar.set("ratroo_rider_oauth_state", state, cookieOptions);
  jar.set("ratroo_rider_oauth_verifier", verifier, cookieOptions);

  const authorizationUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorizationUrl.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return Response.redirect(authorizationUrl);
}
