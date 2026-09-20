import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import {
  bookletPdfFilename,
  bookletPdfPageCount,
  createBookletPdf,
} from "../app/booklet-pdf.ts";
import { sampleGeneratedBooklet } from "./fixtures/generated-booklet.ts";

test("a generated booklet becomes a complete A4 PDF", async () => {
  const booklet = sampleGeneratedBooklet();
  const bytes = await createBookletPdf(booklet);
  const document = await PDFDocument.load(bytes);

  assert.equal(new TextDecoder().decode(bytes.slice(0, 4)), "%PDF");
  assert.equal(document.getPageCount(), bookletPdfPageCount(booklet));
  assert.equal(document.getPageCount(), 15);
  assert.equal(document.getTitle(), "Singapore Explorer - Age 7");
  for (const page of document.getPages()) {
    assert.ok(Math.abs(page.getWidth() - 595.28) < 0.1);
    assert.ok(Math.abs(page.getHeight() - 841.89) < 0.1);
  }
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
  const document = await PDFDocument.load(bytes);
  assert.equal(document.getPageCount(), bookletPdfPageCount(booklet));
  assert.ok(bytes.length > 30_000);
});
