function requireServerEnv(name: "RATROO_API_URL"): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not configured. Add it to .env.local and the Vercel project settings.`);
  }
  return value;
}

/** Server-only backend address. The value always comes from deployment config. */
export const RATROO_API = requireServerEnv("RATROO_API_URL").replace(/\/$/, "");
