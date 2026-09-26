import assert from "node:assert/strict";
import test from "node:test";
import { stickerPlan, stickersForBooklet, treatMilestones, type Sticker } from "../app/lib/booklet/stickers.ts";
import { normalizeFamilyChildren } from "../app/lib/family.ts";
import { createBookletPdf } from "../app/lib/pdf/booklet-pdf.ts";
import { normalizedBooklet } from "../app/lib/pdf/plan.ts";
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

test("sticker ids are unique and the envelope sheet holds at most 20", () => {
  const booklet = sampleGeneratedBooklet();
  for (const familyPack of [false, true]) {
    const stickers = stickerPlan(normalizedBooklet(booklet), { familyPack });
    assert.equal(new Set(stickers.map((sticker) => sticker.id)).size, stickers.length);
    assert.ok(stickers.filter((sticker) => sticker.sheet === "envelope").length <= 20);
  }
});

test("treat stops: one for a day trip, then day 1, halfway and the end", () => {
  assert.deepEqual(treatMilestones(1).map((stop) => stop.afterDay), [1]);
  assert.deepEqual(treatMilestones(2).map((stop) => stop.afterDay), [1, 2]);
  assert.deepEqual(treatMilestones(5).map((stop) => stop.afterDay), [1, 3, 5]);
});
