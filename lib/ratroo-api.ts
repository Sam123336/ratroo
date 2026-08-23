function requireServerEnv(name: "RATROO_API_URL"): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not configured. Add it to .env.local and the Vercel project settings.`);
  }
  return value;
}

/** Server-only backend address, resolved at request time from deployment config. */
export function ratrooApiUrl() {
  return requireServerEnv("RATROO_API_URL").replace(/\/$/, "");
}
