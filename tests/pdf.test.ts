import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import {
  bookletPdfFilename,
  bookletPdfPageCount,
  createBookletPdf,
} from "../app/booklet-pdf.ts";
import { sampleGeneratedBooklet } from "./fixtures/generated-booklet.ts";
import { buildBooklet, getDestinationProfile } from "../app/booklet.ts";
import type { GeneratedBookletData } from "../app/booklet-ai.ts";

test("a generated booklet becomes a complete A4 PDF", async () => {
  const booklet = sampleGeneratedBooklet();
  const bytes = await createBookletPdf(booklet);
  const document = await PDFDocument.load(bytes);

  assert.equal(new TextDecoder().decode(bytes.slice(0, 4)), "%PDF");
  assert.equal(document.getPageCount(), bookletPdfPageCount(booklet));
  assert.equal(document.getPageCount(), 20);
  assert.equal(document.getTitle(), "Singapore Explorer - Age 7");
  for (const page of document.getPages()) {
    assert.ok(Math.abs(page.getWidth() - 595.28) < 0.1);
    assert.ok(Math.abs(page.getHeight() - 841.89) < 0.1);
  }
});

test("a second in-place game and a real queue game do not add pages", async () => {
  const dayPlans = buildBooklet(5, "Paris", 2);
  // buildBooklet's own output never sets gameType/items (it is the offline
  // fallback generator, not the Kimi-validated shape) — patch every game
  // slot the same way an accepted AI draft would arrive.
  const fourItems = [
    { label: "a", clue: "clue one here" },
    { label: "b", clue: "clue two here" },
    { label: "c", clue: "clue three here" },
    { label: "d", clue: "clue four here" },
  ];
  dayPlans.forEach((day) => {
    day.slots.inThePlace = { ...day.slots.inThePlace, gameType: "bingo", items: fourItems };
    day.slots.sitDown = { ...day.slots.sitDown, gameType: "story", items: fourItems };
    if (day.slots.inThePlaceSecond) {
      day.slots.inThePlaceSecond = { ...day.slots.inThePlaceSecond, gameType: "matching", items: fourItems };
    }
    day.activities = [day.slots.inThePlace, day.slots.sitDown];
  });
  const booklet: GeneratedBookletData = {
    destination: "Paris",
    age: 5,
    days: 2,
    itinerary: ["", ""],
    profile: getDestinationProfile("Paris"),
    dayPlans,
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
  assert.ok(booklet.dayPlans[0].slots.inThePlaceSecond, "expected a second in-place activity");
  assert.ok(booklet.dayPlans[0].slots.whileYouWait.gameType, "expected a real queue game");

  const bytes = await createBookletPdf(booklet);
  const document = await PDFDocument.load(bytes);
  assert.equal(document.getPageCount(), bookletPdfPageCount(booklet));
  // Unchanged from the pre-existing 3-pages-per-day layout: cover, guide,
  // (queue + in-place + sit-down) x 2 days, answer notes, memory, certificate.
  assert.equal(document.getPageCount(), 11);
});

test("a coloring in-place activity keeps its full illustrated page instead of being paired away", async () => {
  const dayPlans = buildBooklet(5, "Singapore", 1);
  const fourItems = [
    { label: "MANE", clue: "The lion's hair-like outline." },
    { label: "SCALES", clue: "Small fish patterns along the body." },
    { label: "FOUNTAIN", clue: "Water spraying from the mouth." },
    { label: "BAY", clue: "The water around the statue." },
  ];
  const day = dayPlans[0];
  day.slots.inThePlace = {
    ...day.slots.inThePlace,
    title: "Merlion Color Bingo",
    gameType: "coloring",
    body: "Color the Merlion's lion head, fish tail, and fountain spray.",
    prompt: "Find the lion mane, fish scales, and water jet.",
    items: fourItems,
  };
  day.slots.sitDown = { ...day.slots.sitDown, gameType: "story", items: fourItems };
  assert.ok(day.slots.inThePlaceSecond, "expected a second in-place activity from buildBooklet");
  day.slots.inThePlaceSecond = { ...day.slots.inThePlaceSecond, gameType: "matching", items: fourItems };
  day.activities = [day.slots.inThePlace, day.slots.sitDown];

  const booklet: GeneratedBookletData = {
    destination: "Singapore",
    age: 5,
    days: 1,
    itinerary: [""],
    profile: getDestinationProfile("Singapore"),
    dayPlans,
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

  const bytes = await createBookletPdf(booklet);
  const illustratedBytes = await createBookletPdf(
    booklet,
    undefined,
    async (path) => new Uint8Array(await readFile(`public${path}`)),
  );
  // A coloring board embeds its landmark artwork; the buggy path (falling
  // through to drawStory's default case) never calls the image resolver at
  // all, so this only passes if the full illustrated coloring board — not a
  // paired/compacted mis-render — actually drew.
  assert.ok(illustratedBytes.length > bytes.length + 100_000, "expected a real illustration to be embedded");
});

test("a wide game paired with a second in-place game stacks instead of breaking the page count", async () => {
  const dayPlans = buildBooklet(7, "Singapore", 1);
  const wordSearchItems = [
    { label: "KOPI", clue: "Local coffee, often served with condensed milk." },
    { label: "HAWKER", clue: "A stall selling cheap, quick local food." },
    { label: "SHOPHOUSE", clue: "A narrow building with a shop below and home above." },
    { label: "MERLION", clue: "The half-lion, half-fish statue that is Singapore's mascot." },
  ];
  const fourItems = [
    { label: "a", clue: "clue one here" },
    { label: "b", clue: "clue two here" },
    { label: "c", clue: "clue three here" },
    { label: "d", clue: "clue four here" },
  ];
  const day = dayPlans[0];
  day.slots.inThePlace = { ...day.slots.inThePlace, gameType: "word_search", items: wordSearchItems };
  day.slots.sitDown = { ...day.slots.sitDown, gameType: "story", items: fourItems };
  assert.ok(day.slots.inThePlaceSecond, "expected a second in-place activity from buildBooklet");
  // drawing was previously excluded from pairing alongside coloring; it is
  // now pair-eligible, and word_search forces the pair to stack top/bottom.
  day.slots.inThePlaceSecond = { ...day.slots.inThePlaceSecond, gameType: "drawing", items: fourItems };
  day.activities = [day.slots.inThePlace, day.slots.sitDown];
  (day.slots.whileYouWait as unknown as { game?: unknown }).game = { gameType: "drawing", items: fourItems };

  const booklet: GeneratedBookletData = {
    destination: "Singapore",
    age: 7,
    days: 1,
    itinerary: [""],
    profile: getDestinationProfile("Singapore"),
    dayPlans,
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

  const bytes = await createBookletPdf(booklet);
  const document = await PDFDocument.load(bytes);
  assert.equal(document.getPageCount(), bookletPdfPageCount(booklet));
});

test("PDF filenames are stable and filesystem-safe", () => {
  assert.equal(
    bookletPdfFilename({ destination: "São Paulo, Brazil", age: 9 }),
    "tripquest-sao-paulo-brazil-age-9.pdf",
  );
});

test("PDF renderer supports explicit Merlion and guardian coloring subjects", async () => {
  const booklet = sampleGeneratedBooklet();
  booklet.dayPlans[0].theme = "Merlion Park and Marina Bay";
  booklet.dayPlans[0].activities[0] = {
    ...booklet.dayPlans[0].activities[0],
    title: "Merlion Color Bingo",
    gameType: "coloring",
    body: "Color the Merlion's lion head, fish tail, and fountain spray.",
    prompt: "Find the lion mane, fish scales, and water jet.",
    items: [
      { label: "MANE", clue: "The lion's hair-like outline." },
      { label: "SCALES", clue: "Small fish patterns along the body." },
      { label: "FOUNTAIN", clue: "Water spraying from the mouth." },
      { label: "BAY", clue: "The water around the statue." },
    ],
  };
  booklet.dayPlans[1].theme = "Little India temple guardians";
  booklet.dayPlans[1].activities[0] = {
    ...booklet.dayPlans[1].activities[0],
    title: "Temple Guardian Coloring",
    gameType: "coloring",
    body: "Color the temple guardian statue, headdress, shield, and pedestal.",
    prompt: "Look for the guardian's face, ornaments, and strong standing pose.",
    items: [
      { label: "GUARDIAN", clue: "A statue that watches over the temple." },
      { label: "HEADDRESS", clue: "An ornate shape above the face." },
      { label: "SHIELD", clue: "A broad shape held beside the body." },
      { label: "PEDESTAL", clue: "The platform beneath the statue." },
    ],
  };
  booklet.dayPlans[2].theme = "Katong-Joo Chiat shophouses";
  booklet.dayPlans[2].activities[0] = {
    ...booklet.dayPlans[2].activities[0],
    title: "Tile Pattern Drawing",
    gameType: "drawing",
    body: "Draw a repeating geometric tile motif inspired by the shophouse wall.",
    prompt: "Build a four-point flower, then repeat it in a border.",
    items: [
      { label: "TILE", clue: "A ceramic square with a repeating design." },
      { label: "MOTIF", clue: "A small shape that repeats." },
      { label: "BORDER", clue: "A pattern that travels around an edge." },
      { label: "SYMMETRY", clue: "A design that balances on both sides." },
    ],
  };

  const bytes = await createBookletPdf(booklet);
  const illustratedBytes = await createBookletPdf(
    booklet,
    undefined,
    async (path) => new Uint8Array(await readFile(`public${path}`)),
  );
  const document = await PDFDocument.load(bytes);
  assert.equal(document.getPageCount(), bookletPdfPageCount(booklet));
  assert.ok(bytes.length > 30_000);
  assert.ok(illustratedBytes.length > bytes.length + 500_000);
});
