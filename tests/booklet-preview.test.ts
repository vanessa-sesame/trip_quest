import assert from "node:assert/strict";
import test from "node:test";
import {
  FREE_PREVIEW_PAGE_COUNT,
  createBookletPreview,
  isBookletPageLocked,
} from "../app/booklet-preview.ts";
import { sampleGeneratedBooklet } from "./fixtures/generated-booklet.ts";

test("only the first three booklet pages are exposed in a public preview", () => {
  const booklet = sampleGeneratedBooklet();
  const firstActivity = booklet.dayPlans[0].activities[0];
  const privateTitles = booklet.dayPlans
    .flatMap((day) => day.activities)
    .slice(1)
    .map((activity) => activity.title);
  const preview = createBookletPreview(booklet);
  const serialized = JSON.stringify(preview);

  assert.equal(FREE_PREVIEW_PAGE_COUNT, 3);
  assert.equal(isBookletPageLocked(2), false);
  assert.equal(isBookletPageLocked(3), true);
  assert.deepEqual(preview.dayPlans[0].activities[0], firstActivity);
  assert.equal(preview.dayPlans[0].activities[1].title, "Locked printable page");
  assert.equal(preview.dayPlans[1].theme, "Day 2 adventure");
  for (const title of privateTitles) {
    assert.equal(serialized.includes(title), false, `preview leaked ${title}`);
  }
});
