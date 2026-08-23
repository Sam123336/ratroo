export type RiderAuthTokens = {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  user?: unknown;
};

type CookieJar = {
  set(name: string, value: string, options?: {
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: "lax" | "strict" | "none";
    path?: string;
    maxAge?: number;
  }): void;
};

export function setRiderSession(jar: CookieJar, data: RiderAuthTokens) {
  const secure = process.env.NODE_ENV === "production";
  jar.set("ratroo_rider_access", data.accessToken, {
    httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: Number(data.expiresIn || 900),
  });
  if (data.refreshToken) {
    jar.set("ratroo_rider_refresh", data.refreshToken, {
      httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 30 * 24 * 60 * 60,
    });
  }
}

export function unwrapAuthTokens(value: unknown): RiderAuthTokens | null {
  let current = value;
  for (let index = 0; index < 3; index += 1) {
    if (current && typeof current === "object" && "data" in current) current = (current as { data: unknown }).data;
  }
  if (!current || typeof current !== "object") return null;
  const data = current as Record<string, unknown>;
  if (typeof data.accessToken !== "string") return null;
  return {
    accessToken: data.accessToken,
    refreshToken: typeof data.refreshToken === "string" ? data.refreshToken : undefined,
    expiresIn: typeof data.expiresIn === "number" ? data.expiresIn : undefined,
    user: data.user,
  };
}
