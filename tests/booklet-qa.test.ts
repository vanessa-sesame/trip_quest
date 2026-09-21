import assert from "node:assert/strict";
import test from "node:test";
import { buildBooklet, getDestinationProfile } from "../app/booklet.ts";
import { assertBookletQa, readerBandForAge } from "../app/booklet-qa.ts";
import type { GeneratedBookletData } from "../app/booklet-ai.ts";

function strictBooklet(days = 2): GeneratedBookletData {
  return {
    destination: "Paris",
    age: 5,
    days,
    itinerary: Array.from({ length: days }, () => ""),
    profile: getDestinationProfile("Paris"),
    dayPlans: buildBooklet(5, "Paris", days),
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
}

test("five-slot day architecture passes the age-five export contract", () => {
  const booklet = strictBooklet();
  assert.equal(booklet.dayPlans[0].architectureVersion, 2);
  assert.equal(booklet.dayPlans[0].activities.length, 2);
  assert.equal(booklet.dayPlans[0].slots.inThePlace.requiresPresence, true);
  assert.equal(readerBandForAge(5).childPageWords, 60);
  assert.equal(assertBookletQa(booklet), booklet);
});

test("QA rejects display strings interpolated into sentences", () => {
  const booklet = strictBooklet();
  const day = booklet.dayPlans[0];
  day.slots.whileYouWait.instruction = `Count one detail beside ${day.landmark.display}.`;
  assert.throws(() => assertBookletQa(booklet), /display string/i);
});

test("QA rejects repeated facts, oversized pages, missing queues, and fake in-place puzzles", () => {
  const duplicatedFact = strictBooklet();
  duplicatedFact.dayPlans[0].slots.factCard = [
    "The tower opened in 1889.",
    "The tower opened in 1889.",
    "Four pillars support the tower.",
  ];
  assert.throws(() => assertBookletQa(duplicatedFact), /repeats a fact/i);

  const oversized = strictBooklet();
  oversized.dayPlans[0].slots.sitDown.body = Array.from({ length: 21 }, () => "word").join(" ");
  assert.throws(() => assertBookletQa(oversized), /instruction exceeds/i);

  const missingQueue = strictBooklet();
  missingQueue.dayPlans[0].slots.whileYouWait.required = true;
  missingQueue.dayPlans[0].slots.whileYouWait.instruction = "";
  assert.throws(() => assertBookletQa(missingQueue), /queue instruction|missing its required queue/i);

  const remotePuzzle = strictBooklet();
  remotePuzzle.dayPlans[0].slots.inThePlace.requiresPresence = false;
  assert.throws(() => assertBookletQa(remotePuzzle), /before arrival/i);
});

test("QA rejects duplicate mission cards and multi-child language for one child", () => {
  const duplicateCards = strictBooklet();
  duplicateCards.dayPlans[1].slots.sitDown.title = duplicateCards.dayPlans[0].slots.sitDown.title;
  duplicateCards.dayPlans[1].slots.sitDown.prompt = duplicateCards.dayPlans[0].slots.sitDown.prompt;
  assert.throws(() => assertBookletQa(duplicateCards), /mission card/i);

  const wrongRoster = strictBooklet();
  wrongRoster.dayPlans[0].siblingMission = "One explorer counts while the other writes. Swap roles.";
  assert.throws(() => assertBookletQa(wrongRoster), /one-child roster/i);
});
