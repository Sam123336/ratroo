import assert from "node:assert/strict";
import test from "node:test";
import { forRegion } from "../app/api/suggestions/region-filter.ts";

const placed = (name, region) => ({ name, region });
const unplaceable = (name) => ({ name, region: undefined });

test("a stop with no coordinates is kept, not discarded as foreign", () => {
  const kept = forRegion("bengaluru", [unplaceable("Junnasandra Gate Wipro Regional Office")]);
  assert.deepEqual(kept.map((item) => item.name), ["Junnasandra Gate Wipro Regional Office"]);
});

test("a stop positively placed in another region is dropped", () => {
  const kept = forRegion("bengaluru", [placed("Sealdah", "kolkata")]);
  assert.deepEqual(kept, []);
});

test("placed results lead, unplaceable ones follow", () => {
  const kept = forRegion("bengaluru", [
    unplaceable("Some Office"),
    placed("Indiranagar", "bengaluru"),
    placed("Howrah", "kolkata"),
  ]);
  assert.deepEqual(kept.map((item) => item.name), ["Indiranagar", "Some Office"]);
});
