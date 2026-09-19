import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultFamilyWorkspace,
  eventsToDailyPlans,
  familyPromptSummary,
  mechanicPlanForTrip,
  normalizeFamilyChildren,
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
    { id: "a", name: "Mia", age: 5, interests: ["drawing", "drawing"], avoid: ["writing"] },
    { id: "b", name: "Leo", age: 10, readingLevel: "independent-reader", interests: ["maps"] },
  ]);
  assert.equal(children[0].readingLevel, "pre-reader");
  assert.deepEqual(children[0].interests, ["drawing"]);
  assert.equal(children[1].readingLevel, "independent-reader");
  assert.match(familyPromptSummary(children), /Child 1: age 5/);
  assert.doesNotMatch(familyPromptSummary(children), /Mia|Leo/);
  assert.equal(defaultFamilyWorkspace().children.length, 1);
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

