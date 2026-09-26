import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import { STICKERS_PER_SHEET, stickerPlan, stickersForBooklet, treatMilestones, type Sticker } from "../app/lib/booklet/stickers.ts";
import { normalizeFamilyChildren } from "../app/lib/family.ts";
import { createBookletPdf } from "../app/lib/pdf/booklet-pdf.ts";
import { normalizedBooklet } from "../app/lib/pdf/plan.ts";
import { createStickerSheetPdf, stickerCellCenters } from "../app/lib/pdf/stickers.ts";
import { sampleGeneratedBooklet } from "./fixtures/generated-booklet.ts";

async function spotsDrawn(booklet: ReturnType<typeof sampleGeneratedBooklet>, familyPack?: Parameters<typeof createBookletPdf>[1]) {
  const drawn: Sticker[] = [];
  await createBookletPdf(booklet, familyPack, undefined, undefined, { onStickerSpot: (sticker) => drawn.push(sticker) });
  return drawn;
}

test("the booklet draws exactly one spot for every sticker that has a place", async () => {
  const booklet = sampleGeneratedBooklet();
  const planned = stickersForBooklet(normalizedBooklet(booklet)).filter((sticker) => sticker.spot.page !== "none");
  const drawn = await spotsDrawn(booklet);
  assert.deepEqual(drawn.map((sticker) => sticker.id).sort(), planned.map((sticker) => sticker.id).sort());
  assert.ok(planned.some((sticker) => sticker.kind === "game"));
  assert.ok(planned.some((sticker) => sticker.kind === "day"));
  assert.ok(planned.some((sticker) => sticker.kind === "milestone"));
  assert.ok(planned.some((sticker) => sticker.kind === "seal"));
});

test("a family pack adds a spot for each family badge sticker", async () => {
  const booklet = sampleGeneratedBooklet();
  const familyPack = {
    children: normalizeFamilyChildren([{ name: "Mia", age: 5 }, { name: "Leo", age: 9 }]),
    events: [],
    mechanicsByDay: [],
  };
  const planned = stickersForBooklet(normalizedBooklet(booklet), familyPack).filter((sticker) => sticker.spot.page !== "none");
  const drawn = await spotsDrawn(booklet, familyPack);
  assert.deepEqual(drawn.map((sticker) => sticker.id).sort(), planned.map((sticker) => sticker.id).sort());
  assert.equal(drawn.filter((sticker) => sticker.kind === "badge").length, 8);
  assert.equal(planned.find((sticker) => sticker.kind === "name")?.label, "Mia");
});

test("sticker ids are unique and the envelope sheet holds exactly one sheet", () => {
  const booklet = sampleGeneratedBooklet();
  for (const familyPack of [false, true]) {
    const stickers = stickerPlan(normalizedBooklet(booklet), { familyPack });
    assert.equal(new Set(stickers.map((sticker) => sticker.id)).size, stickers.length);
    assert.equal(stickers.filter((sticker) => sticker.sheet === "envelope").length, STICKERS_PER_SHEET);
  }
});

test("treat stops: one for a day trip, then day 1, halfway and the end", () => {
  assert.deepEqual(treatMilestones(1).map((stop) => stop.afterDay), [1]);
  assert.deepEqual(treatMilestones(2).map((stop) => stop.afterDay), [1, 2]);
  assert.deepEqual(treatMilestones(5).map((stop) => stop.afterDay), [1, 3, 5]);
});

test("sticker sheets print every planned sticker on A5 pages of 30mm circles", async () => {
  const booklet = sampleGeneratedBooklet();
  const familyPack = { children: normalizeFamilyChildren([{ name: "Mia", age: 7 }]), events: [], mechanicsByDay: [] };
  const planned = stickersForBooklet(normalizedBooklet(booklet), familyPack);
  const gameSheets = Math.ceil(planned.filter((sticker) => sticker.sheet === "game").length / STICKERS_PER_SHEET);
  const envelopeSheets = Math.ceil(planned.filter((sticker) => sticker.sheet === "envelope").length / STICKERS_PER_SHEET);
  const document = await PDFDocument.load(await createStickerSheetPdf(booklet, familyPack));
  assert.equal(document.getPageCount(), gameSheets + envelopeSheets);
  // Every sheet is full: game sheets are padded with extra cheers and the
  // envelope sheet with bonus stickers.
  assert.equal(planned.length, document.getPageCount() * STICKERS_PER_SHEET);
  for (const page of document.getPages()) {
    assert.ok(Math.abs(page.getWidth() - 419.53) < 0.1);
    assert.ok(Math.abs(page.getHeight() - 595.28) < 0.1);
  }
  const withTest = await PDFDocument.load(await createStickerSheetPdf(booklet, familyPack, undefined, { alignmentPage: true }));
  assert.equal(withTest.getPageCount(), document.getPageCount() + 1);
});

test("every sticker circle sits inside the A5 page with at least a 5mm margin", () => {
  const mm = 72 / 25.4;
  const radius = (30 * mm) / 2;
  const cells = stickerCellCenters();
  assert.equal(cells.length, STICKERS_PER_SHEET);
  for (const cell of cells) {
    assert.ok(cell.x - radius >= 5 * mm && cell.x + radius <= 419.53 - 5 * mm, `x ${cell.x}`);
    assert.ok(cell.y - radius >= 12 * mm && cell.y + radius <= 595.28 - 20 * mm, `y ${cell.y}`);
  }
  // Neighbouring circles never touch, so a punch can take each one cleanly.
  assert.ok(cells[1].x - cells[0].x - 2 * radius >= 4.9 * mm);
  assert.ok(cells[0].y - cells[4].y - 2 * radius >= 4.9 * mm);
});

test("a booklet without a named child still fills both sheets", () => {
  const stickers = stickerPlan(normalizedBooklet(sampleGeneratedBooklet()), { familyPack: false });
  assert.equal(stickers.find((sticker) => sticker.kind === "name")?.label, "Explorer");
  assert.equal(stickers.filter((sticker) => sticker.sheet === "envelope").length, STICKERS_PER_SHEET);
  assert.equal(stickers.filter((sticker) => sticker.sheet === "game").length % STICKERS_PER_SHEET, 0);
});
