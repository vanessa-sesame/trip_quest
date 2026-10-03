import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import {
  bookletPdfFilename,
  bookletPdfPageCount,
  createBookletPdf,
} from "../app/lib/pdf/booklet-pdf.ts";
import { sampleGeneratedBooklet } from "./fixtures/generated-booklet.ts";
import { buildBooklet, getDestinationProfile } from "../app/lib/booklet/booklet.ts";
import { bookletDayPageEntries } from "../app/lib/booklet/pages.ts";
import { validateBookletDraft, type GeneratedBookletData } from "../app/lib/generation/booklet-ai.ts";

test("a generated booklet becomes a complete A5 PDF", async () => {
  const booklet = sampleGeneratedBooklet();
  const bytes = await createBookletPdf(booklet);
  const document = await PDFDocument.load(bytes);

  assert.equal(new TextDecoder().decode(bytes.slice(0, 4)), "%PDF");
  assert.equal(document.getPageCount(), bookletPdfPageCount(booklet));
  // cover, guide, treat trail, 5 days x (queue + in-place + sit-down),
  // answer notes, memory, certificate = 21, padded with "My notes" to 24.
  assert.equal(document.getPageCount(), 24);
  assert.equal(document.getTitle(), "Singapore Explorer - Age 7");
  for (const page of document.getPages()) {
    assert.ok(Math.abs(page.getWidth() - 419.53) < 0.1);
    assert.ok(Math.abs(page.getHeight() - 595.28) < 0.1);
  }
});

test("every game gets its own A5 page and the total pads to a multiple of 4", async () => {
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
    // The reveal page is covered by its own test below.
    delete day.slots.questReveal;
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
  // cover, guide, treat trail, (queue + queue game + in-place + second
  // in-place + sit-down) x 2 days, answer notes, memory, certificate = 16:
  // already whole sheets, so no "My notes" page.
  const kinds = bookletDayPageEntries(booklet.dayPlans).map((entry) => entry.kind === "activity" ? entry.slot : entry.kind);
  assert.deepEqual(kinds.slice(0, 5), ["queue", "queueGame", "inThePlace", "inThePlaceSecond", "sitDown"]);
  assert.equal(document.getPageCount(), 16);
});

test("a queue mystery with a reveal adds exactly one page for that day, and only that day", async () => {
  const dayPlans = buildBooklet(6, "Rome", 2);
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
  // buildBooklet's offline fallback already populates questReveal (with a
  // nested targetLabel) on every day (see app/lib/booklet/booklet.ts's buildDaySlots) —
  // strip day 2's so only day 1 gets the reveal page, proving the extra
  // page is per-day, not whole-booklet.
  delete dayPlans[1].slots.questReveal;

  const booklet: GeneratedBookletData = {
    destination: "Rome",
    age: 6,
    days: 2,
    itinerary: ["", ""],
    profile: getDestinationProfile("Rome"),
    dayPlans,
    sources: [],
    generatedAt: "2026-09-22T00:00:00.000Z",
    family: [{
      id: "child-1",
      name: "Explorer 1",
      age: 6,
      readingLevel: "reader",
      interests: [],
      avoid: [],
      preferredMechanics: [],
    }],
  };
  assert.ok(booklet.dayPlans[0].slots.questReveal, "expected day 1 to keep its reveal content");
  assert.ok(!booklet.dayPlans[1].slots.questReveal, "expected day 2's reveal content to be stripped");

  const bytes = await createBookletPdf(booklet);
  const document = await PDFDocument.load(bytes);
  assert.equal(document.getPageCount(), bookletPdfPageCount(booklet));
  const revealDays = bookletDayPageEntries(booklet.dayPlans)
    .filter((entry) => entry.kind === "reveal")
    .map((entry) => entry.day.day);
  assert.deepEqual(revealDays, [1]);
  assert.equal(document.getPageCount() % 4, 0);
});

test("a reveal photo path survives re-validation and is actually embedded", async () => {
  // Regression test: createBookletPdf re-validates the booklet via
  // validateBookletDraft before rendering, and that validator used to
  // rebuild slots.questReveal from an explicit field whitelist that did not
  // include photoPath (unlike Activity.illustrationPath, which does have an
  // equivalent whitelist entry) — silently dropping any reveal photo
  // addRevealPhoto had generated, every single time, before the PDF ever
  // saw it. This went unnoticed because the OpenAI image path had been
  // failing on quota throughout development; it only surfaced once a
  // second image provider (Cloudflare Workers AI) started succeeding.
  const dayPlans = buildBooklet(6, "Rome", 1);
  const fourItems = [
    { label: "a", clue: "clue one here" },
    { label: "b", clue: "clue two here" },
    { label: "c", clue: "clue three here" },
    { label: "d", clue: "clue four here" },
  ];
  dayPlans[0].slots.inThePlace = { ...dayPlans[0].slots.inThePlace, gameType: "bingo", items: fourItems };
  dayPlans[0].slots.sitDown = { ...dayPlans[0].slots.sitDown, gameType: "story", items: fourItems };
  if (dayPlans[0].slots.inThePlaceSecond) {
    dayPlans[0].slots.inThePlaceSecond = { ...dayPlans[0].slots.inThePlaceSecond, gameType: "matching", items: fourItems };
  }
  dayPlans[0].activities = [dayPlans[0].slots.inThePlace, dayPlans[0].slots.sitDown];
  const photoPath = `/api/illustration?key=${encodeURIComponent(`illustrations/v2/${"a".repeat(64)}/artwork.png`)}`;
  dayPlans[0].slots.questReveal = {
    ...dayPlans[0].slots.questReveal!,
    photoPath,
    photoCredit: "Photo: A. Photographer / CC BY-SA 4.0 / Wikimedia Commons",
  };
  const booklet: GeneratedBookletData = {
    destination: "Rome",
    age: 6,
    days: 1,
    itinerary: [""],
    profile: getDestinationProfile("Rome"),
    dayPlans,
    sources: [],
    generatedAt: "2026-09-22T00:00:00.000Z",
  };
  assert.equal(booklet.dayPlans[0].slots.questReveal?.photoPath, photoPath, "photoPath should be set on the input booklet");

  const requestedPaths: string[] = [];
  const resolver = async (path: string) => {
    requestedPaths.push(path);
    return new Uint8Array(await readFile("public/illustrations/market-coloring-v1.png"));
  };
  const bytesWithPhoto = await createBookletPdf(booklet, undefined, resolver);
  const bytesWithoutPhoto = await createBookletPdf(
    { ...booklet, dayPlans: [{ ...dayPlans[0], slots: { ...dayPlans[0].slots, questReveal: { ...dayPlans[0].slots.questReveal!, photoPath: undefined } } }] },
    undefined,
    resolver,
  );

  assert.ok(requestedPaths.includes(photoPath), "the reveal photo path should have survived validation and reached the image resolver");
  assert.ok(bytesWithPhoto.length > bytesWithoutPhoto.length, "the PDF with an embedded reveal photo should be larger");
  assert.equal(
    validateBookletDraft(booklet, 1, 6).dayPlans[0].slots.questReveal?.photoCredit,
    "Photo: A. Photographer / CC BY-SA 4.0 / Wikimedia Commons",
    "a real photo's credit must survive re-validation so it is printed",
  );
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

test("two activities that land on the same curated scene do not embed the same picture twice", async () => {
  const buildTwoDayBooklet = (secondDaySubject: string) => {
    const dayPlans = buildBooklet(6, "Riverside", 2);
    const fourItems = [
      { label: "a", clue: "clue one here" },
      { label: "b", clue: "clue two here" },
      { label: "c", clue: "clue three here" },
      { label: "d", clue: "clue four here" },
    ];
    dayPlans[0].slots.sitDown = {
      ...dayPlans[0].slots.sitDown,
      title: "Hawker Market Sketch",
      body: "Draw the local hawker market stalls.",
      gameType: "drawing",
      items: fourItems,
    };
    dayPlans[1].slots.sitDown = {
      ...dayPlans[1].slots.sitDown,
      title: secondDaySubject,
      body: `Draw the ${secondDaySubject.toLowerCase()}.`,
      gameType: "drawing",
      items: fourItems,
    };
    dayPlans.forEach((day) => {
      day.slots.inThePlace = { ...day.slots.inThePlace, gameType: "bingo", items: fourItems };
      if (day.slots.inThePlaceSecond) {
        day.slots.inThePlaceSecond = { ...day.slots.inThePlaceSecond, gameType: "matching", items: fourItems };
      }
      day.activities = [day.slots.inThePlace, day.slots.sitDown];
    });
    const booklet: GeneratedBookletData = {
      destination: "Riverside",
      age: 6,
      days: 2,
      itinerary: ["", ""],
      profile: getDestinationProfile("Riverside"),
      dayPlans,
      sources: [],
      generatedAt: "2026-09-22T00:00:00.000Z",
      family: [{
        id: "child-1",
        name: "Explorer 1",
        age: 6,
        readingLevel: "reader",
        interests: [],
        avoid: [],
        preferredMechanics: [],
      }],
    };
    return booklet;
  };
  const resolver = async (path: string) => new Uint8Array(await readFile(`public${path}`));

  // Day 2 lands on the exact same "market" scene as day 1 (both mention
  // a local market) — the second occurrence must not embed the same
  // picture again.
  const collidingBytes = await createBookletPdf(buildTwoDayBooklet("Local Market Stalls"), undefined, resolver);
  // Day 2 lands on a different scene ("mountain") — both days should get
  // their own distinct embedded picture.
  const distinctBytes = await createBookletPdf(buildTwoDayBooklet("Mountain Trail View"), undefined, resolver);

  assert.ok(
    distinctBytes.length > collidingBytes.length + 100_000,
    "expected the colliding-scene booklet to embed one fewer curated image than the distinct-scene booklet",
  );
});

test("a wide in-place game and a drawing second game each render on their own page", async () => {
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

test("a spot-the-difference game embeds both of its pictures", async () => {
  const dayPlans = buildBooklet(7, "Hoi An", 1);
  const items = [
    { label: "Lantern", clue: "What glows above the stall?" },
    { label: "Basket", clue: "What holds the fruit?" },
    { label: "Awning", clue: "What keeps the sun off?" },
    { label: "Barrel", clue: "What wooden drum sits in front?" },
  ];
  const path = (letter: string) => `/api/illustration?key=${encodeURIComponent(`illustrations/v2/${letter.repeat(64)}/artwork.png`)}`;
  const slots = dayPlans[0].slots;
  slots.inThePlace = {
    ...slots.inThePlace,
    gameType: "spot_the_difference",
    items,
    differencePaths: {
      a: path("a"),
      b: path("b"),
      regions: [
        { x: 0.7, y: 0.02, w: 0.2, h: 0.18, label: "a bird" },
        { x: 0.7, y: 0.75, w: 0.24, h: 0.24, label: "a cat" },
        { x: 0.02, y: 0.75, w: 0.22, h: 0.24, label: "a ball" },
      ],
    },
  };
  slots.sitDown = { ...slots.sitDown, gameType: "story", items };
  delete slots.inThePlaceSecond;
  dayPlans[0].activities = [slots.inThePlace, slots.sitDown];
  const booklet: GeneratedBookletData = {
    destination: "Hoi An",
    age: 7,
    days: 1,
    itinerary: [""],
    profile: getDestinationProfile("Hoi An"),
    dayPlans,
    sources: [],
    generatedAt: "2026-09-26T00:00:00.000Z",
  };
  const requested: string[] = [];
  const picture = await readFile("public/illustrations/market-coloring-v1.png");
  const withPictures = await createBookletPdf(booklet, undefined, async (requestedPath) => {
    requested.push(requestedPath);
    return new Uint8Array(picture);
  });
  const withoutPictures = await createBookletPdf(booklet);
  assert.ok(requested.includes(path("a")) && requested.includes(path("b")), "both pictures are requested");
  assert.ok(withPictures.length > withoutPictures.length + picture.length, "both pictures are embedded");
});

test("the web preview can release a pdf.js document through its loading task", async () => {
  // app/components/pdf-preview.tsx frees each superseded preview this way.
  // pdf.js 6 dropped PDFDocumentProxy.destroy(); calling it crashed the
  // preview (and the whole page) as soon as a generated booklet replaced
  // the sample.
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const booklet = sampleGeneratedBooklet();
  const task = getDocument({ data: await createBookletPdf(booklet) });
  const document = await task.promise;

  assert.equal(document.numPages, bookletPdfPageCount(booklet));
  assert.equal("destroy" in document, false);
  assert.equal(document.loadingTask, task);
  await document.loadingTask.destroy();
  assert.equal(task.destroyed, true);
});
