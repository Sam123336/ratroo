import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${path}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the Ratroo public experience", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Ratroo — Know the way\. Enjoy the ride\.<\/title>/i);
  assert.match(html, /Ratroo is getting your journey ready/);
  assert.match(html, /Plan a journey/);
  assert.match(html, /Ask Ratroo/);
  assert.doesNotMatch(html, /Your site is taking shape|Building your site/);
});

test("keeps Rider OAuth-only and supports nationwide pinned community routes", async () => {
  const page = await readFile(new URL("../app/rider/page.tsx", import.meta.url), "utf8");

  assert.match(page, /Continue with Google/);
  assert.doesNotMatch(page, /name="password"|name="email"/);
  assert.match(page, /AUTO.*E_RICKSHAW.*SHARED_TAXI/s);
  assert.match(page, /operatingDays/);
  assert.match(page, /every stop on the map/);
  assert.match(page, /detects its Indian state automatically/);
});
