import assert from "node:assert/strict";
import test from "node:test";
import {
  capAtWordBoundary,
  cleanDailyPlan,
  defaultFamilyWorkspace,
  eventsToDailyPlans,
  isTravelOnlyPlan,
  mergeDailyPlans,
  familyChildDisplayName,
  familyEditionContext,
  familyPromptSummary,
  interestPlanForTrip,
  mechanicPlanForTrip,
  normalizeFamilyChildren,
  parseFamilyTags,
  parseItineraryText,
} from "../app/lib/family.ts";
import {
  bookletPdfPageCount,
  createBookletPdf,
  familyPackPdfFilename,
} from "../app/lib/pdf/booklet-pdf.ts";
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
  assert.equal(familyChildDisplayName({ ...children[0], name: "Explorer" }, 0), "Explorer 1");
  assert.deepEqual(parseFamilyTags("dinosaurs; Pokemon\ntrains, drawing"), [
    "dinosaurs",
    "pokemon",
    "trains",
    "drawing",
  ]);
});

test("edition context freezes names and structured itinerary events without exposing them to Kimi", () => {
  const children = normalizeFamilyChildren([
    { name: "Mia", age: 5, interests: ["dinosaurs"] },
    { name: "Leo", age: 9, interests: ["trains"] },
  ]);
  const events = parseItineraryText("Day 1: airport and hotel", 2);
  const edition = familyEditionContext(children, events);

  assert.match(edition, /Mia/);
  assert.match(edition, /airport/);
  assert.doesNotMatch(familyPromptSummary(children), /Mia|Leo/);
  assert.notEqual(edition, familyEditionContext([{ ...children[0], name: "Nora" }, children[1]], events));

  const detailedEvent = [{
    id: "event-1",
    day: 1,
    type: "attraction" as const,
    title: "Museum visit",
    place: "National Museum",
    details: "Dinosaur gallery at 10:00",
  }];
  assert.notEqual(
    familyEditionContext(children, detailedEvent),
    familyEditionContext(children, [{ ...detailedEvent[0], details: "Space gallery at 10:00" }]),
  );
  assert.match(familyEditionContext(children, detailedEvent), /National Museum/);
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
  // 20 base pages (answers are separate) + relay, mission map, mission
  // cards and badge tracker = 24.
  assert.equal((await PDFDocument.load(family)).getPageCount(), 24);
  assert.equal(familyPackPdfFilename(booklet), "tripquest-singapore-age-7-family-pack.pdf");
});

// The table a parent pasted for a 4-day Ipoh trip (reconstructed from the
// fragments the older importer kept). Days 1 and 4 are only flights and
// hotel time.
const IPOH_TABLE = `| Date | Plan |
|---|---|
| **Sat 10 Oct** | ✈️ **Scoot TR484** Singapore → Ipoh **12:35–13:50**. Check in at **TUI BLUE The Haven Ipoh**, Two-Bedroom Suite. Easy afternoon: pool, hotel playground and an early dinner at the hotel. |
| **Sun 11 Oct** | 🌿 **Kek Lok Tong + gardens** in the morning → 🍜 **Old Town** for lunch → short Old Town wander / street art → back to the hotel for a rest. |
| **Mon 12 Oct** | 🐯 **Lost World of Tambun** from around **11:00am**. Focus on animals, train/dry activities and suitable kids' rides — **swimsuits optional; no swimming required**. Leave around **3–4pm** or whenever the boys are tired. |
| **Tue 13 Oct** | 🥐 Breakfast → pack and enjoy the hotel a little → leave around **11:30am** → ✈️ **Scoot TR485** Ipoh → Singapore **14:40–15:55**. |`;

// What the older importer saved for that table (booklet.json, Ipoh).
const LEGACY_IPOH_PLANS = [
  "Attraction: | Date | Plan |; Attraction: |---|---|; Hotel: | **Sat 10 Oct** | ✈️ **Scoot TR484** Singapore → Ipoh **12:35–13:50**. Check in;",
  "Meal: | **Sun 11 Oct** | 🌿 **Kek Lok Tong + gardens** in the morning → 🍜 **Old Town** for lunch → short Old Town wander / st; Meal: | **Su",
  "Train: | **Mon 12 Oct** | 🐯 **Lost World of Tambun** from around **11:00am**. Focus on animals, train/dry activities and suita; Attraction:",
  "Hotel: | **Tue 13 Oct** | 🥐 Breakfast → pack and enjoy the hotel a little → leave around **11:30am** → ✈️ **Scoot TR485** Ipoh; Hotel: | **",
];

const MARKUP = /[|*`]|\p{Extended_Pictographic}/u;

function assertWholeWords(plan: string, source: string) {
  const words = new Set(source.replace(/[|*]/g, " ").split(/[\s;,.:/]+/).filter(Boolean));
  const last = plan.split(/[\s;,.:/]+/).filter(Boolean).pop() ?? "";
  assert.ok(words.has(last), `"${plan}" ends with a cut word "${last}"`);
}

test("a pasted markdown table becomes clean per-day plans without header rows, markup or cut words", () => {
  const events = parseItineraryText(IPOH_TABLE, 4);
  assert.deepEqual([...new Set(events.map((event) => event.day))], [1, 2, 3, 4]);
  for (const event of events) {
    assert.doesNotMatch(event.title, MARKUP, event.title);
    assert.doesNotMatch(event.title, /^(?:date|plan)$|---|Sat 10 Oct|Sun 11 Oct/i, event.title);
  }
  // Only what the text supports: no train ride on the Tambun day, and the
  // flights and check-in are typed as such.
  assert.ok(!events.some((event) => event.type === "train"));
  assert.deepEqual(events.filter((event) => event.day === 1).map((event) => event.type).slice(0, 2), ["flight", "hotel"]);
  assert.equal(events.find((event) => /Tambun/.test(event.title))?.type, "attraction");
  assert.equal(events.find((event) => /Focus on animals/.test(event.title))?.type, "other");

  const plans = eventsToDailyPlans(events, 4);
  assert.equal(plans[0], "Flight: Scoot TR484 Singapore to Ipoh 12:35–13:50; Hotel: Check in at TUI BLUE The Haven Ipoh, Two-Bedroom Suite");
  assert.match(plans[1], /^Attraction: Kek Lok Tong \+ gardens in the morning; Meal: Old Town for lunch/);
  assert.match(plans[2], /^Attraction: Lost World of Tambun/);
  assert.match(plans[3], /Flight: Scoot TR485 Ipoh to Singapore/, "the departure flight is kept when the day is long");
  plans.forEach((plan) => {
    assert.ok(plan.length <= 140, plan);
    assert.doesNotMatch(plan, MARKUP, plan);
    assertWholeWords(plan, IPOH_TABLE);
  });
  assert.deepEqual(plans.map((plan) => isTravelOnlyPlan(plan)), [true, false, false, true]);
});

test("plans saved by the older importer are cleaned before research and composition", () => {
  const cleaned = LEGACY_IPOH_PLANS.map((plan) => cleanDailyPlan(plan));
  assert.equal(cleaned[0], "Flight: Scoot TR484 Singapore to Ipoh 12:35–13:50; Hotel: Check in");
  cleaned.forEach((plan) => {
    assert.ok(plan.length > 10 && plan.length <= 140, plan);
    assert.doesNotMatch(plan, MARKUP, plan);
    assert.doesNotMatch(plan, /\bDate\b|---|\bSu$|Train:/, plan);
  });
  assert.deepEqual(LEGACY_IPOH_PLANS.map((plan) => isTravelOnlyPlan(plan)), [true, false, false, true]);
});

test("plain lists and day-by-day notes are parsed into typed days", () => {
  const list = parseItineraryText([
    "- Day 1: Fly to Penang, check in at the hotel",
    "- Day 2: Penang Hill funicular; lunch at a hawker centre",
    "- Day 3: pack, taxi to the airport",
  ].join("\n"), 3);
  assert.deepEqual(eventsToDailyPlans(list, 3), [
    "Flight: Fly to Penang, check in at the hotel",
    "Attraction: Penang Hill funicular; Meal: lunch at a hawker centre",
    "Flight: pack, taxi to the airport",
  ]);
  assert.deepEqual(eventsToDailyPlans(list, 3).map((plan) => isTravelOnlyPlan(plan)), [true, false, true]);

  const notes = parseItineraryText([
    "## Day 1 — Sat 10 Oct",
    "* ✈️ Flight SQ 106 Singapore → Kuala Lumpur",
    "* Check in at the hotel",
    "",
    "**Day 2 (Sun 11 Oct)**",
    "1. Batu Caves early, before the heat",
    "2. Lunch in Little India",
  ].join("\n"), 2);
  assert.deepEqual(notes.map((event) => [event.day, event.type, event.title]), [
    [1, "flight", "Flight SQ 106 Singapore to Kuala Lumpur"],
    [1, "hotel", "Check in at the hotel"],
    [2, "attraction", "Batu Caves early, before the heat"],
    [2, "meal", "Lunch in Little India"],
  ]);

  const columns = parseItineraryText([
    "| Day | Morning | Afternoon |",
    "| :-- | :-- | :-- |",
    "| Day 1 | Arrive and check in | Hotel pool |",
    "| Day 2 | Gardens by the Bay | Hawker dinner at Lau Pa Sat |",
  ].join("\n"), 2);
  assert.deepEqual(eventsToDailyPlans(columns, 2), [
    "Hotel: Arrive and check in; Hotel: Hotel pool",
    "Attraction: Gardens by the Bay; Meal: Hawker dinner at Lau Pa Sat",
  ]);
});

test("clean typed plans are kept as written and a long day is cut at a word boundary", () => {
  for (const plan of ["old town and river cruise", "Colosseum and Roman Forum", "Hotel: Grand Hyatt; Meal: dim sum lunch"]) {
    assert.equal(cleanDailyPlan(plan), plan);
  }
  assert.equal(isTravelOnlyPlan("Colosseum and Roman Forum"), false);
  assert.equal(isTravelOnlyPlan("airport and hotel"), true);
  assert.equal(isTravelOnlyPlan("Fly to Ipoh, lunch at Nam Heong"), false, "a named lunch stop is a visit");
  assert.equal(isTravelOnlyPlan(""), false);

  const long = "Morning wander through the colourful murals of the old quarter with plenty of stops for photos and snacks before an unhurried afternoon at the riverside";
  const [plan] = eventsToDailyPlans(parseItineraryText(`Day 1: ${long}`, 1), 1);
  assert.ok(plan.length <= 140, plan);
  assertWholeWords(plan, long);
  assert.equal(capAtWordBoundary("Kek Lok Tong and the gardens", 18), "Kek Lok Tong");
});

test("importing again does not repeat a plan and replaces an older import's markup", () => {
  assert.equal(mergeDailyPlans("", "Flight: Scoot TR484"), "Flight: Scoot TR484");
  assert.equal(mergeDailyPlans("Flight: Scoot TR484", "Flight: Scoot TR484"), "Flight: Scoot TR484");
  assert.equal(mergeDailyPlans("swim at the hotel", "Flight: Scoot TR484"), "swim at the hotel; Flight: Scoot TR484");
  assert.equal(mergeDailyPlans(LEGACY_IPOH_PLANS[0], "Flight: Scoot TR484"), "Flight: Scoot TR484");
  const merged = mergeDailyPlans("a".repeat(5) + " lots of words here ".repeat(6), "Flight: Scoot TR484 Singapore to Ipoh");
  assert.ok(merged.length <= 140);
  assert.doesNotMatch(merged, /\s$/);
});
