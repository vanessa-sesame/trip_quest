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
  assert.match(text, /local word|place name|people gather/i);
});

test("activity format and difficulty change across developmental age levels", () => {
  const little = bookletText(4, "Tokyo");
  const navigator = bookletText(7, "Tokyo");
  const investigator = bookletText(10, "Tokyo");
  const correspondent = bookletText(13, "Tokyo");

  assert.match(little, /With a grown-up|Big Travel Drawing/);
  assert.match(navigator, /Earn 7 points|Map the Moment/);
  assert.match(investigator, /Evidence Log|Local Systems Challenge/);
  assert.match(correspondent, /Field Brief|what you inferred|honest trade-off/);
  assert.equal(getAgeBand(4).label, "Little Explorer");
  assert.equal(getAgeBand(7).label, "Curious Navigator");
  assert.equal(getAgeBand(10).label, "Travel Investigator");
  assert.equal(getAgeBand(13).label, "Young Correspondent");
});

test("trip length controls the number of tailored day pages", () => {
  assert.equal(buildBooklet(7, "Paris", 1).length, 1);
  assert.equal(buildBooklet(7, "Paris", 6).length, 6);
  assert.equal(buildBooklet(7, "Paris", 99).length, 14);
});
