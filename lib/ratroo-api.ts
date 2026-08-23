/** Server-only backend address, resolved at request time from deployment config. */
export function ratrooApiUrl() {
  // Vercel discovers server-function variables statically, so this must be an
  // explicit property access rather than process.env[name]. No value is
  // bundled into the browser or committed to source.
  const value = process.env.RATROO_API_URL?.trim();
  if (!value) throw new Error("RATROO_API_URL is not configured in this deployment.");
  return value.replace(/\/$/, "");
}
