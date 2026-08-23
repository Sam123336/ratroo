import { cookies } from "next/headers";
import { ratrooApiUrl } from "@/lib/ratroo-api";

const ALLOWED = [
  /^operators\/me$/,
  /^operators\/me\/vehicles$/,
  /^operators\/me\/routes$/,
  /^operators\/me\/routes\/[0-9a-f-]+$/i,
  /^operators\/me\/routes\/[0-9a-f-]+\/stops$/i,
  /^operators\/me\/routes\/[0-9a-f-]+\/publish-state$/i,
  /^operators$/,
];

async function proxy(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const path = (await context.params).path.join("/");
  if (!ALLOWED.some(pattern => pattern.test(path))) {
    return Response.json({ message: "Unsupported rider operation." }, { status: 404 });
  }
  const token = (await cookies()).get("ratroo_rider_access")?.value;
  if (!token) return Response.json({ message: "Please sign in first." }, { status: 401 });

  const body = request.method === "GET" || request.method === "DELETE" ? undefined : await request.text();
  const response = await fetch(`${ratrooApiUrl()}/${path}`, {
    method: request.method,
    headers: { "Accept": "application/json", "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
    body,
    cache: "no-store",
  });
  return new Response(await response.text(), { status: response.status, headers: { "Content-Type": "application/json" } });
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const PUT = proxy;
export const DELETE = proxy;
