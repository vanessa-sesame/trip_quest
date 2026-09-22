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

test("a reveal page shifts every later lock boundary by one, day by day", () => {
  // buildBooklet's offline fallback (app/booklet.ts's buildDaySlots) always
  // sets questReveal + whileYouWait.targetLabel, so day 1 here is 4 pages
  // (queue, reveal, in-place, sit-down) instead of 3 — proving the lock
  // logic derives indices from bookletDayPageEntries rather than assuming a
  // fixed stride, which would silently misalign every day after the first.
  const booklet: GeneratedBookletData = {
    destination: "Rome",
    age: 7,
    days: 2,
    itinerary: ["", ""],
    profile: getDestinationProfile("Rome"),
    dayPlans: buildBooklet(7, "Rome", 2),
    sources: [],
    generatedAt: "2026-09-22T00:00:00.000Z",
    family: [{
      id: "child-1",
      name: "Explorer 1",
      age: 7,
      readingLevel: "reader",
      interests: [],
      avoid: [],
      preferredMechanics: [],
    }],
  };
  assert.ok(booklet.dayPlans[0].slots.questReveal, "expected buildBooklet to produce a reveal for day 1");

  const preview = createBookletPreview(booklet, false);
  // Free preview: cover(0), guide(1), day-1 queue(2) — day 1's reveal(3) is
  // the first locked page now that a reveal page exists, one earlier than
  // it would be without this feature.
  assert.equal(preview.dayPlans[0].slots.questReveal?.revealText, "Included in the printable booklet.");
  assert.equal(preview.dayPlans[0].slots.inThePlace.title, "Locked printable page");
  // Day 2's queue page (index 6: cover, guide, day1 queue/reveal/inThePlace/
  // sitDown, day2 queue) keeps its own targetLabel visible — whileYouWait is
  // never content-locked, matching today's behavior for day 1's queue page.
  assert.equal(preview.dayPlans[1].slots.whileYouWait.targetLabel, booklet.dayPlans[1].slots.whileYouWait.targetLabel);
});
