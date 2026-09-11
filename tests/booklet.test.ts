import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBooklet,
  getAgeBand,
  getDestinationProfile,
} from "../app/booklet.ts";

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
