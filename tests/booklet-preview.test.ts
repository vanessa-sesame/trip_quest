import assert from "node:assert/strict";
import test from "node:test";
import {
  FREE_PREVIEW_PAGE_COUNT,
  createBookletPreview,
  isBookletPageLocked,
} from "../app/booklet-preview.ts";
import { sampleGeneratedBooklet } from "./fixtures/generated-booklet.ts";
import { buildBooklet, getDestinationProfile } from "../app/booklet.ts";
import type { GeneratedBookletData } from "../app/booklet-ai.ts";

test("only the first three booklet pages are exposed in a public preview", () => {
  const booklet = sampleGeneratedBooklet();
  const privateTitles = booklet.dayPlans
    .flatMap((day) => day.activities)
    .map((activity) => activity.title);
  const preview = createBookletPreview(booklet, false);
  const serialized = JSON.stringify(preview);

  assert.equal(FREE_PREVIEW_PAGE_COUNT, 3);
  assert.equal(isBookletPageLocked(2, false), false);
  assert.equal(isBookletPageLocked(3, false), true);
  assert.equal(preview.dayPlans[0].activities[0].title, "Locked printable page");
  assert.equal(preview.dayPlans[0].activities[1].title, "Locked printable page");
  assert.equal(preview.dayPlans[1].theme, "Day 2 adventure");
  for (const title of privateTitles) {
    assert.equal(serialized.includes(title), false, `preview leaked ${title}`);
  }
});

test("full preview mode can still expose every page without changing the stored booklet", () => {
  const booklet = sampleGeneratedBooklet();
  const preview = createBookletPreview(booklet, true);

  assert.equal(isBookletPageLocked(8, true), false);
  assert.equal(preview, booklet);
  assert.equal(
    preview.dayPlans[1].activities[0].title,
    booklet.dayPlans[1].activities[0].title,
  );
});

test("public preview mode is locked after the first three pages", () => {
  const booklet = sampleGeneratedBooklet();
  const preview = createBookletPreview(booklet, false);

  assert.equal(isBookletPageLocked(3, false), true);
  assert.equal(preview.dayPlans[0].activities[1].title, "Locked printable page");
});

test("tester mode exposes the same booklet data used for the printable edition", () => {
  const booklet = sampleGeneratedBooklet();
  const preview = createBookletPreview(booklet);

  assert.equal(isBookletPageLocked(12), false);
  assert.equal(preview, booklet);
});

test("a second in-place activity is locked with its page, not left exposed", () => {
  const booklet: GeneratedBookletData = {
    destination: "Paris",
    age: 5,
    days: 2,
    itinerary: ["", ""],
    profile: getDestinationProfile("Paris"),
    dayPlans: buildBooklet(5, "Paris", 2),
    sources: [],
    generatedAt: "2026-09-21T00:00:00.000Z",
    family: [{
      id: "child-1",
      name: "Explorer 1",
      age: 5,
      readingLevel: "pre-reader",
      interests: [],
      avoid: [],
      preferredMechanics: [],
    }],
  };
  assert.ok(booklet.dayPlans[0].slots.inThePlaceSecond, "buildBooklet should produce a second in-place activity");

  const preview = createBookletPreview(booklet, false);
  // Locked at the same page index as inThePlace, since they share one
  // physical page — leaving it unlocked would expose paid content through
  // the free preview even though inThePlace itself is correctly locked.
  assert.equal(preview.dayPlans[0].slots.inThePlace.title, "Locked printable page");
  assert.equal(preview.dayPlans[0].slots.inThePlaceSecond?.title, "Locked printable page");
});
