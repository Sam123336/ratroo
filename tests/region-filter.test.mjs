import assert from "node:assert/strict";
import test from "node:test";
import { forRegion, hasCoordinates, regionForResult } from "../app/api/suggestions/region-filter.ts";

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

/**
 * The null-island trap. `Number(null)` is 0 and `Number.isFinite(0)` is true, so
 * a missing position reads as a real one at 0,0 off West Africa. That is what
 * made /api/network query stops near the Gulf of Guinea and report West
 * Bengal's 200 bus routes as "not published yet".
 */
test("a record with no position is not treated as being at 0,0", () => {
  assert.equal(hasCoordinates({}), false);
  assert.equal(hasCoordinates({ latitude: null, longitude: null }), false);
  assert.equal(hasCoordinates({ latitude: undefined, longitude: undefined }), false);
  assert.equal(hasCoordinates({ latitude: 0, longitude: 0 }), false);
});

test("a record with a real position is usable", () => {
  assert.equal(hasCoordinates({ latitude: 22.5726, longitude: 88.3639 }), true);
  assert.equal(hasCoordinates({ lat: 12.9716, lng: 77.5946 }), true);
});

test("coordinates outside both regions are not claimed by either", () => {
  // Solur Railway Station: Karnataka, but just outside the Bengaluru box. It
  // must not come back as "unplaceable", or a Kolkata rail list keeps it.
  assert.equal(regionForResult({ latitude: 13.06514, longitude: 77.25698 }), undefined);
  assert.equal(regionForResult({ latitude: 12.9716, longitude: 77.5946 }), "bengaluru");
  assert.equal(regionForResult({ latitude: 22.5726, longitude: 88.3639 }), "kolkata");
});
