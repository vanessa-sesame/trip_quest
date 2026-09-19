import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultFamilyWorkspace,
  eventsToDailyPlans,
  familyChildDisplayName,
  familyPromptSummary,
  interestPlanForTrip,
  mechanicPlanForTrip,
  normalizeFamilyChildren,
  parseFamilyTags,
  parseItineraryText,
} from "../app/family.ts";
import {
  bookletPdfPageCount,
  createBookletPdf,
  familyPackPdfFilename,
} from "../app/booklet-pdf.ts";
import { PDFDocument } from "pdf-lib";
import { sampleGeneratedBooklet } from "./fixtures/generated-booklet.ts";

test("family profiles normalize ages, reading levels, and bounded tags", () => {
  const children = normalizeFamilyChildren([
    { id: "a", name: "Mia", age: 5, interests: ["drawing; trains", "drawing"], avoid: ["writing"] },
    { id: "b", name: "Leo", age: 10, readingLevel: "independent-reader", interests: ["maps"] },
  ]);
  assert.equal(children[0].readingLevel, "pre-reader");
  assert.deepEqual(children[0].interests, ["drawing", "trains"]);
  assert.equal(children[1].readingLevel, "independent-reader");
  assert.match(familyPromptSummary(children), /Lead child: age 5/);
  assert.doesNotMatch(familyPromptSummary(children), /Mia|Leo/);
  assert.equal(defaultFamilyWorkspace().children.length, 1);
  assert.equal(defaultFamilyWorkspace().children[0].name, "Your child");
  assert.equal(familyChildDisplayName({ ...children[0], name: "Explorer" }, 0), "Your child");
  assert.deepEqual(parseFamilyTags("dinosaurs; Pokemon\ntrains, drawing"), [
    "dinosaurs",
    "pokemon",
    "trains",
    "drawing",
  ]);
});

test("interests are spread across the trip and tied to a specific child", () => {
  const children = normalizeFamilyChildren([
    { name: "Mia", age: 5, interests: ["dinosaurs", "drawing"] },
    { name: "Leo", age: 10, interests: ["trains"] },
  ]);
  const plan = interestPlanForTrip(children, 5);
  assert.equal(plan.length, 3);
  assert.deepEqual(plan.map((item) => item.interest), ["dinosaurs", "trains", "drawing"]);
  assert.deepEqual(plan.map((item) => item.childNumber), [1, 2, 1]);
  assert.equal(new Set(plan.map((item) => item.day)).size, plan.length);
});

test("pasted itinerary becomes typed daily events and plans", () => {
  const events = parseItineraryText("Day 1: airport and hotel\nDay 2: train to museum; lunch at the market\nDay 3: free time", 3);
  assert.equal(events.length, 5);
  assert.equal(events[0].type, "flight");
  assert.equal(events[1].type, "hotel");
  assert.equal(events[2].day, 2);
  assert.equal(events[2].type, "train");
  assert.match(eventsToDailyPlans(events, 3)[1], /Train/);
});

test("pasted itineraries recognize named dates without Day labels", () => {
  const events = parseItineraryText("10 Apri: airport and hotel\n11 April: museum and lunch", 5);
  assert.deepEqual(events.map((event) => event.day), [1, 1, 2, 2]);
  assert.equal(events[0].title, "airport");
  assert.equal(events[2].title, "museum");
  assert.match(eventsToDailyPlans(events, 5)[0], /airport/i);
  assert.match(eventsToDailyPlans(events, 5)[1], /museum/i);

  const dateOnly = parseItineraryText("10 April\n11 April", 5);
  assert.deepEqual(dateOnly.map((event) => event.day), [1, 2]);
});

test("quest planning deliberately varies mechanics and includes sibling cooperation", () => {
  const plan = mechanicPlanForTrip(normalizeFamilyChildren([
    { name: "A", age: 5 },
    { name: "B", age: 9 },
  ]), 6);
  assert.equal(plan.length, 6);
  assert.ok(plan.some((day) => day.mechanics.includes("cooperate")));
  assert.ok(new Set(plan.map((day) => day.mechanics[0])).size >= 5);
});

test("family PDF adds a usable pack section without changing the base booklet", async () => {
  const booklet = sampleGeneratedBooklet();
  const base = await createBookletPdf(booklet);
  const family = await createBookletPdf(booklet, {
    children: normalizeFamilyChildren([{ name: "Mia", age: 5 }, { name: "Leo", age: 9 }]),
    events: [{ id: "e1", day: 1, type: "attraction", title: "Gardens by the Bay" }],
    mechanicsByDay: [{ day: 1, mechanics: ["spot", "cooperate"] }],
  });
  assert.equal((await PDFDocument.load(base)).getPageCount(), bookletPdfPageCount(booklet));
  assert.equal((await PDFDocument.load(family)).getPageCount(), bookletPdfPageCount(booklet, true));
  assert.equal((await PDFDocument.load(family)).getPageCount(), 18);
  assert.equal(familyPackPdfFilename(booklet), "tripquest-singapore-age-7-family-pack.pdf");
});
