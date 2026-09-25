import assert from "node:assert/strict";
import test from "node:test";
import { buildBooklet, getDestinationProfile } from "../app/lib/booklet/booklet.ts";
import { assertBookletQa, composedContentIssues, wordCount } from "../app/lib/booklet/qa.ts";
import type { GeneratedBookletData } from "../app/lib/generation/booklet-ai.ts";

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
  assert.equal(assertBookletQa(booklet), booklet);
});

test("a second in-place game requires presence and joins the landmark-leak scan", () => {
  const booklet = strictBooklet();
  const day = booklet.dayPlans[0];
  assert.ok(day.slots.inThePlaceSecond, "buildBooklet should produce a second in-place activity");
  assert.equal(day.slots.inThePlaceSecond.requiresPresence, true);
  assert.doesNotThrow(() => assertBookletQa(booklet));

  const remoteSecond = strictBooklet();
  remoteSecond.dayPlans[0].slots.inThePlaceSecond.requiresPresence = false;
  assert.throws(() => assertBookletQa(remoteSecond), /second in-place puzzle can be completed before arrival/i);

  const leakedSecond = strictBooklet();
  const leakDay = leakedSecond.dayPlans[0];
  leakDay.slots.inThePlaceSecond.body = `Look closely at ${leakDay.landmark.display}.`;
  assert.throws(() => assertBookletQa(leakedSecond), /display string/i);
});

test("word counts ignore standalone punctuation but keep hyphenated and accented words", () => {
  assert.equal(wordCount("Colour it with broken-tile patches — no straight lines allowed!"), 9);
  assert.equal(wordCount("Gaudí's bench... amazing!"), 3);
  assert.equal(wordCount(""), 0);
  assert.equal(wordCount("   "), 0);
  assert.equal(wordCount("—"), 0);
});

test("QA rejects display strings interpolated into sentences", () => {
  const booklet = strictBooklet();
  const day = booklet.dayPlans[0];
  day.slots.whileYouWait.instruction = `Count one detail beside ${day.landmark.display}.`;
  assert.throws(() => assertBookletQa(booklet), /display string/i);
});

test("QA rejects repeated facts, missing queues, and fake in-place puzzles", () => {
  const duplicatedFact = strictBooklet();
  duplicatedFact.dayPlans[0].slots.factCard = [
    "The tower opened in 1889.",
    "The tower opened in 1889.",
    "Four pillars support the tower.",
  ];
  assert.throws(() => assertBookletQa(duplicatedFact), /repeats a fact/i);

  const wordy = strictBooklet();
  wordy.dayPlans[0].slots.sitDown.body = Array.from({ length: 60 }, () => "word").join(" ");
  assert.doesNotThrow(() => assertBookletQa(wordy));

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

function draftWith(items: { label: string; clue: string }[], gameType: "bingo" | "quiz" | "matching" | "drawing" = "bingo") {
  const dayPlans = buildBooklet(7, "Tokyo", 1);
  dayPlans[0].slots.inThePlace = { ...dayPlans[0].slots.inThePlace, gameType, items };
  return { dayPlans };
}

test("numbered or ordinal filler labels are flagged at composition time", () => {
  // Live examples from the 50-scenario run: "First/Second/Third/Fourth red
  // lantern" (Tokyo), "Treasure 1/Treasure 2" (Cairo), "Food 1/Food 2" (New York).
  const ordinal = composedContentIssues(draftWith([
    { label: "First red lantern you see", clue: "A red paper lantern." },
    { label: "Second red lantern", clue: "Another one." },
    { label: "Tuna block", clue: "Big red fish at a stall." },
    { label: "Onigiri", clue: "Rice triangle wrapped in seaweed." },
  ]));
  assert.match(ordinal.join(" "), /numbered filler labels \(First red lantern you see, Second red lantern\)/);

  const counted = composedContentIssues(draftWith([
    { label: "Stall roof", clue: "A striped awning." },
    { label: "Treasure 1", clue: "A brass lamp." },
    { label: "Treasure 2", clue: "A woven basket." },
    { label: "Price tag", clue: "Egyptian pounds." },
  ]));
  assert.match(counted.join(" "), /Treasure 1, Treasure 2/);

  const fine = composedContentIssues(draftWith([
    { label: "Platform 9", clue: "Where the express stops." },
    { label: "Onigiri", clue: "Rice triangle wrapped in seaweed." },
    { label: "Lantern", clue: "Red paper light." },
    { label: "Tuna block", clue: "Big red fish at a stall." },
  ]));
  assert.deepEqual(fine.filter((issue) => issue.includes("filler")), [], "a lone numbered proper noun is fine");
});

test("drawing instructions as clues are flagged on clue-based games", () => {
  const issues = composedContentIssues(draftWith([
    { label: "Stall roof", clue: "Draw a striped roof over your shop." },
    { label: "Lamp", clue: "A brass lamp." },
    { label: "Basket", clue: "A woven basket." },
    { label: "Price tag", clue: "Egyptian pounds." },
  ], "matching"));
  assert.match(issues.join(" "), /matching game but its clues are drawing\/writing instructions/);

  const drawingPage = composedContentIssues(draftWith([
    { label: "Roof", clue: "Draw a striped roof over your shop." },
    { label: "Lamp", clue: "Draw a brass lamp." },
    { label: "Basket", clue: "Draw a woven basket." },
    { label: "Price tag", clue: "Write a price." },
  ], "drawing"));
  assert.deepEqual(drawingPage.filter((issue) => issue.includes("instructions")), [], "drawing pages may use instructions");
});

test("quiz clues must be real questions", () => {
  // Live example: a quiz whose "question" was the statement "space between
  // the left building and the center hall", answered by "left gap / right gap".
  const issues = composedContentIssues(draftWith([
    { label: "Two", clue: "space between the left building and the center hall" },
    { label: "Red", clue: "What color is the main gate?" },
    { label: "Lion", clue: "Which animal guards the steps?" },
    { label: "Nine", clue: "How many roof tiers can you count?" },
  ], "quiz"));
  assert.match(issues.join(" "), /is a quiz but "space between the left building and the center hall" is not a question/);
});

test("a day's three games must be three different game types", () => {
  // Live example: Kuala Lumpur day 1 came back matching (in-place) + story +
  // matching (sit-down) with near-identical labels, despite a matching+story schedule.
  const four = (labels: string[]) => labels.map((label) => ({ label, clue: `The ${label.toLowerCase()} by the towers.` }));
  const dayPlans = buildBooklet(6, "Kuala Lumpur", 1);
  dayPlans[0].slots.inThePlace = { ...dayPlans[0].slots.inThePlace, gameType: "matching", items: four(["Two spires", "Sky bridge", "Glass shine", "Same height"]) };
  dayPlans[0].slots.inThePlaceSecond = { ...dayPlans[0].slots.inThePlace, gameType: "story", items: four(["Tracks", "Station", "Signal", "Bridge"]) };
  dayPlans[0].slots.sitDown = { ...dayPlans[0].slots.sitDown, gameType: "matching", items: four(["Spire", "Walkway", "Window", "Base"]) };
  assert.match(composedContentIssues({ dayPlans }).join(" "), /Day 1 uses matching for more than one game/);
});
