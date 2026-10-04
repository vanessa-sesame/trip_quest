import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import { MAX_TREAT_STOPS, STICKERS_PER_SHEET, stickerPlan, stickersForBooklet, treatMilestones, type Sticker } from "../app/lib/booklet/stickers.ts";
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

// The sample booklet's days repeated (renumbered, with their titles made
// unique) to any trip length.
function bookletOfDays(days: number) {
  const sample = sampleGeneratedBooklet();
  const retitle = (value: unknown, suffix: string): unknown => {
    if (Array.isArray(value)) return value.map((entry) => retitle(entry, suffix));
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value).map(([key, entry]) =>
      [key, (key === "title" || key === "theme") && typeof entry === "string" ? `${entry}${suffix}` : retitle(entry, suffix)]));
  };
  const dayPlans = Array.from({ length: days }, (_, index) => {
    const source = sample.dayPlans[index % sample.dayPlans.length];
    const round = Math.floor(index / sample.dayPlans.length);
    const day = (round ? retitle(source, ` ${round + 1}`) : structuredClone(source)) as typeof source;
    return { ...day, day: index + 1 };
  });
  return { ...sample, days, dayPlans, itinerary: dayPlans.map((day) => day.theme) };
}

test("sticker ids are unique and the envelope sheet holds exactly one sheet", () => {
  const booklet = sampleGeneratedBooklet();
  for (const familyPack of [false, true]) {
    const stickers = stickerPlan(normalizedBooklet(booklet), { familyPack });
    assert.equal(new Set(stickers.map((sticker) => sticker.id)).size, stickers.length);
    assert.equal(stickers.filter((sticker) => sticker.sheet === "envelope").length, STICKERS_PER_SHEET);
  }
});

test("treat stops: one every day for trips up to four days, then four spread evenly", () => {
  assert.deepEqual(treatMilestones(1).map((stop) => stop.afterDay), [1]);
  assert.deepEqual(treatMilestones(2).map((stop) => stop.afterDay), [1, 2]);
  assert.deepEqual(treatMilestones(3).map((stop) => stop.afterDay), [1, 2, 3]);
  assert.deepEqual(treatMilestones(4).map((stop) => stop.afterDay), [1, 2, 3, 4]);
  assert.deepEqual(treatMilestones(4).map((stop) => stop.label), ["Day 1 done!", "Day 2 done!", "Day 3 done!", "Trip done!"]);
  assert.deepEqual(treatMilestones(5).map((stop) => stop.afterDay), [1, 3, 4, 5]);
  assert.deepEqual(treatMilestones(8).map((stop) => stop.afterDay), [2, 4, 6, 8]);
  assert.deepEqual(treatMilestones(14).map((stop) => stop.afterDay), [4, 7, 11, 14]);
  assert.equal(treatMilestones(14)[1].label, "Halfway there!");
  for (let days = 1; days <= 14; days += 1) {
    const stops = treatMilestones(days);
    assert.equal(stops.length, Math.min(days, MAX_TREAT_STOPS), `${days} days`);
    assert.equal(stops[stops.length - 1].afterDay, days, `${days} days ends on the last day`);
    assert.equal(stops[stops.length - 1].label, "Trip done!");
    stops.forEach((stop, index) => {
      assert.ok(stop.afterDay >= 1 && stop.afterDay <= days);
      if (index > 0) assert.ok(stop.afterDay > stops[index - 1].afterDay, `${days} days: stops are on different days`);
    });
  }
});

test("every trip length draws one spot per treat stop and prints one milestone sticker per stop", async () => {
  for (const days of [1, 3, 4, 5, 9, 14]) {
    const booklet = bookletOfDays(days);
    const planned = stickersForBooklet(normalizedBooklet(booklet));
    const milestones = planned.filter((sticker) => sticker.kind === "milestone");
    assert.equal(milestones.length, Math.min(days, MAX_TREAT_STOPS), `${days} days`);
    const drawn = await spotsDrawn(booklet);
    assert.deepEqual(
      drawn.map((sticker) => sticker.id).sort(),
      planned.filter((sticker) => sticker.spot.page !== "none").map((sticker) => sticker.id).sort(),
      `${days} days: every planned sticker has exactly one drawn spot`,
    );
    assert.equal(planned.filter((sticker) => sticker.sheet === "game").length % STICKERS_PER_SHEET, 0, `${days} days: game sheets are full`);
    const sheets = await PDFDocument.load(await createStickerSheetPdf(booklet));
    assert.equal(sheets.getPageCount() * STICKERS_PER_SHEET, planned.length, `${days} days: every sheet is full`);
  }
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
