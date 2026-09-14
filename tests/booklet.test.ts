import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBooklet,
  getAgeBand,
  getDestinationProfile,
  sanitizeAge,
} from "../app/booklet.ts";
import { validateBookletDraft } from "../app/booklet-ai.ts";

function bookletText(age: number, destination: string) {
  return JSON.stringify(buildBooklet(age, destination, 5));
}

test("named destinations produce genuinely different local content", () => {
  const tokyo = bookletText(7, "Tokyo");
  const paris = bookletText(7, "Paris");
  const singapore = bookletText(7, "Singapore");

  assert.match(tokyo, /vending machine|Tokyo Skytree|train line/i);
  assert.match(paris, /blue street sign|Eiffel Tower|croissant/i);
  assert.match(singapore, /shophouse|Marina Bay|kaya toast/i);
  assert.notEqual(tokyo, paris);
  assert.notEqual(paris, singapore);
});

test("unknown destinations still use the entered place throughout the quest", () => {
  const profile = getDestinationProfile("Reykjavik");
  const text = bookletText(10, "Reykjavik");

  assert.equal(profile.id, "discovery");
  assert.match(profile.intro, /Reykjavik/);
  assert.match(text, /Reykjavik/);
  assert.match(text, /symbol people connect|building or landscape locals recognize/i);
});

test("activity format and difficulty change across developmental age levels", () => {
  const little = bookletText(4, "Tokyo");
  const navigator = bookletText(7, "Tokyo");
  const investigator = bookletText(10, "Tokyo");
  const correspondent = bookletText(13, "Tokyo");

  assert.match(little, /A grown-up reads|grown-up writes your exact words/);
  assert.match(navigator, /7-point challenge|five-star scorecard/);
  assert.match(investigator, /pieces of evidence|annotated version/);
  assert.match(correspondent, /field note|fact, inference, and opinion|trade-off/);
  assert.equal(getAgeBand(4).label, "Little Explorer");
  assert.equal(getAgeBand(7).label, "Curious Navigator");
  assert.equal(getAgeBand(10).label, "Travel Investigator");
  assert.equal(getAgeBand(13).label, "Young Correspondent");
});

test("every activity in a full 14-day booklet has a distinct creative title", () => {
  const booklet = buildBooklet(7, "Tokyo", 14);
  const titles = booklet.flatMap((day) =>
    day.activities.map((activity) => activity.title),
  );
  const kinds = new Set(
    booklet.flatMap((day) => day.activities.map((activity) => activity.kind)),
  );

  assert.equal(titles.length, 42);
  assert.equal(new Set(titles).size, 42);
  assert.ok(kinds.size >= 20);
  assert.doesNotMatch(JSON.stringify(booklet), /Map the Moment|Local Detail Story/);
});

test("day mechanics change instead of repeating one create template", () => {
  const booklet = buildBooklet(7, "Paris", 6);
  const titleSets = booklet.map((day) =>
    day.activities.map((activity) => activity.title).join("|"),
  );

  assert.equal(new Set(titleSets).size, 6);
  assert.match(JSON.stringify(booklet[2]), /Flavor Detective|Menu Mash-Up|Snack Awards/);
  assert.match(JSON.stringify(booklet[3]), /Transit Codebreaker|Human Route Map|Dream Ride Lab/);
  assert.match(JSON.stringify(booklet[5]), /Pocket Bioblitz|Creature Superpower|Ranger Rescue/);
});

test("trip length controls the number of tailored day pages", () => {
  assert.equal(buildBooklet(7, "Paris", 1).length, 1);
  assert.equal(buildBooklet(7, "Paris", 6).length, 6);
  assert.equal(buildBooklet(7, "Paris", 99).length, 14);
});

test("every age from 3 through 14 can be selected", () => {
  for (let age = 3; age <= 14; age += 1) {
    assert.equal(sanitizeAge(age), age);
  }

  assert.equal(sanitizeAge(1), 3);
  assert.equal(sanitizeAge(18), 14);
});

test("AI booklet validation requires the requested day count and unique activities", () => {
  const draft = {
    profile: {
      style: "Harbour stories and tiled streets",
      intro: "A bright family quest through a real city and its living culture.",
      word: "obrigado — thank you",
      etiquette: "Use a quiet voice in churches and ask before photographing people.",
    },
    dayPlans: [
      {
        day: 8,
        theme: "Belém Tower Lookout",
        focusLabel: "River history",
        mission: "Spot the carved details that connect this tower to Portugal's sea journeys.",
        activities: [
          {
            title: "Stone Sailor Search",
            kind: "Observation hunt",
            body: "Find three shapes carved into the pale stone and choose the one that looks most seaworthy.",
            prompt: "My seaworthy shape is…",
          },
          {
            title: "Tagus Tide Map",
            kind: "Map play",
            body: "Trace the river edge with one line, then mark the tower and the direction a boat travels.",
            prompt: "Tower / boat / river bend",
          },
        ],
      },
    ],
  };

  const valid = validateBookletDraft(draft, 1);
  assert.equal(valid.dayPlans[0].day, 1);
  assert.equal(valid.dayPlans[0].activities.length, 2);
  assert.throws(() => validateBookletDraft(draft, 2), /exactly 2 day pages/i);

  const repeated = structuredClone(draft);
  repeated.dayPlans[0].activities[1].title = "Stone Sailor Search";
  assert.throws(() => validateBookletDraft(repeated, 1), /repeated/i);
});
