import type { PDFPage } from "pdf-lib";
import type { DayPlan } from "../../booklet/booklet.ts";
import { treatMilestones } from "../../booklet/stickers.ts";
import { drawStickerIcon } from "../art/icons.ts";
import { STICKER_DIAMETER, STICKER_TONES, addPage, drawPageHeader, drawStickerSpot, type PdfContext } from "../context.ts";
import { drawBulletList, drawCard, drawDottedLine, drawNumberBadge, drawPill, drawText, Flow, type Box } from "../layout.ts";
import { CONTENT_WIDTH, CONTENT_BOTTOM, MARGIN, colors } from "../theme.ts";

// The treat trail: one card per day (app/lib/booklet/stickers.ts
// treatMilestones gives every day a stop). Each card has the day's game
// dots on a soft band, the stop's numbered badge, a 30mm sticker spot and a
// writing row where a grown-up writes the treat. Up to four days make a
// 2 x 2 trail; longer trips use pages of six cards (three columns, two
// rows, treatTrailPages). The last page ends at the mystery envelope.

type Stop = ReturnType<typeof treatMilestones>[number];

const GAP = 10;
const SPOT = STICKER_DIAMETER + 6;
const ENVELOPE_HEIGHT = 36;

function stopCardHeight(ctx: PdfContext) {
  return 6 + SPOT + 2 + ctx.type.writeLine + 6;
}

function gamesOn(ctx: PdfContext, day: number) {
  return ctx.stickers.filter((sticker) => sticker.kind === "game" && sticker.spot.page === "activity" && sticker.spot.day === day).length;
}

// "Day N", a dot per game joined by a dotted path and, on a stop day, the
// stop's numbered badge at the end of the path. Fits itself to `width`.
function drawDayTrail(ctx: PdfContext, page: PDFPage, day: DayPlan, index: number, row: { x: number; cy: number; width: number; height: number }, stop: number) {
  const { fonts, type } = ctx;
  const tone = STICKER_TONES[index % STICKER_TONES.length];
  const labelWidth = fonts.bold.widthOfTextAtSize("Day 14", type.label) + 8;
  drawText(page, `Day ${day.day}`, fonts, { x: row.x, top: row.cy + (type.label * 1.35) / 2, width: labelWidth }, {
    size: type.label, font: fonts.bold, color: tone.ink, maxLines: 1,
  });
  const games = Math.max(1, gamesOn(ctx, day.day));
  const badgeRadius = Math.min(9, row.height / 2 - 1);
  const stopSpace = stop >= 0 ? badgeRadius * 2 + 12 : 0;
  const dotsWidth = row.width - labelWidth - stopSpace;
  const radius = Math.max(3, Math.min(7, row.height / 2 - 2, (dotsWidth / games - 4) / 2));
  const step = Math.min(radius * 2 + 8, dotsWidth / games);
  const firstX = row.x + labelWidth + radius;
  const lastX = firstX + (games - 1) * step;
  if (games > 1) drawDottedLine(page, firstX, lastX, row.cy, tone.ink, 1.5, 3);
  for (let game = 0; game < games; game += 1) {
    page.drawCircle({ x: firstX + game * step, y: row.cy, size: radius, color: colors.white, borderColor: tone.ink, borderWidth: 1.2 });
  }
  if (stop >= 0) {
    drawDottedLine(page, lastX + radius + 2, lastX + radius + 10, row.cy, colors.line, 1.5, 3);
    drawNumberBadge(page, fonts, String(stop + 1), { x: lastX + radius + 12 + badgeRadius, y: row.cy }, badgeRadius, colors.coral);
  }
}

// One stop: its numbered badge, the sticker spot (captioned with the stop's
// name) and a writing row for the treat, filling `box`.
function drawStop(ctx: PdfContext, page: PDFPage, stop: Stop, index: number, box: Box) {
  const { fonts, type } = ctx;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height - 6 - SPOT / 2;
  drawStickerSpot(ctx, page, { page: "treats", milestone: index }, cx, cy, stop.label);
  drawNumberBadge(page, fonts, String(index + 1), { x: box.x + 17, y: box.y + box.height - 15 }, 9, colors.coral);
  // "Our treat:" and its writing line on one row, so the line stays inside
  // the card however narrow it is (three cards across on longer trips).
  const label = "Our treat:";
  const labelSize = Math.min(type.small, 10);
  const labelWidth = fonts.bold.widthOfTextAtSize(label, labelSize);
  const baseline = box.y + 6 + type.writeLine * 0.35;
  page.drawText(label, { x: box.x + 10, y: baseline, size: labelSize, font: fonts.bold, color: colors.ink });
  drawDottedLine(page, box.x + 14 + labelWidth, box.x + box.width - 10, baseline - 1, colors.line, 3, 3);
}

export function drawTreatTrail(ctx: PdfContext, range: { firstDay: number; lastDay: number; part: number; parts: number }) {
  const { fonts, type, booklet } = ctx;
  const page = addPage(ctx, "Treat trail", colors.teal);
  const top = drawPageHeader(ctx, page, {
    kicker: range.parts > 1 ? `Treat trail / ${range.part} of ${range.parts}` : "Treat trail",
    title: range.part === 1 ? "Every game brings a treat closer" : "The trail keeps going",
    accent: colors.teal,
    soft: colors.tealSoft,
    titleLines: 1,
  });
  const flow = new Flow(page, fonts, { x: MARGIN, top, width: CONTENT_WIDTH, bottom: CONTENT_BOTTOM });
  if (range.part === 1) {
    flow.text("Colour the dots as your family plays. At the end of each day, add its sticker and write the reward.", {
      size: type.small, color: colors.muted, maxLines: 3,
    });
    flow.space(10);
  }

  const stops = treatMilestones(booklet.dayPlans.length);
  const days = booklet.dayPlans.filter((day) => day.day >= range.firstDay && day.day <= range.lastDay);
  const columns = booklet.dayPlans.length <= 4 ? 2 : 3;
  const cardWidth = (CONTENT_WIDTH - GAP * (columns - 1)) / columns;
  const headerHeight = 24;
  const stopHeight = stopCardHeight(ctx);
  const cardHeight = headerHeight + stopHeight;
  const rows = Math.ceil(days.length / columns);
  const grid = flow.take(rows * cardHeight + (rows - 1) * GAP);
  days.forEach((day, slot) => {
    const index = day.day - 1;
    const row = Math.floor(slot / columns);
    // A short last row is centred under the full ones.
    const inRow = row === rows - 1 ? days.length - row * columns : columns;
    const rowWidth = inRow * cardWidth + (inRow - 1) * GAP;
    const x = MARGIN + (CONTENT_WIDTH - rowWidth) / 2 + (slot % columns) * (cardWidth + GAP);
    const box = { x, y: grid.y + grid.height - (row + 1) * cardHeight - row * GAP, width: cardWidth, height: cardHeight };
    const tone = STICKER_TONES[index % STICKER_TONES.length];
    drawCard(page, box, { fill: colors.white, border: tone.ink, borderWidth: 1 });
    // The day's dots on a soft band across the top of its card.
    const header = { x: box.x + 4, y: box.y + stopHeight, width: box.width - 8, height: headerHeight - 4 };
    drawCard(page, header, { fill: tone.soft, radius: 9 });
    drawDayTrail(ctx, page, day, index, { x: header.x + 8, cy: header.y + header.height / 2, width: header.width - 16, height: header.height - 2 }, -1);
    drawStop(ctx, page, stops[index], index, { ...box, height: stopHeight });
  });
  if (range.part < range.parts) {
    flow.space(12);
    flow.text("The trail continues on the next page.", { size: type.small, color: colors.muted, maxLines: 1, align: "center" });
    return;
  }
  const showEnvelope = true;

  // The end of the trail.
  const message = "Trail finished? Open your mystery envelope!";
  flow.space(12);
  if (showEnvelope && flow.remaining() >= ENVELOPE_HEIGHT) {
    const end = flow.take(ENVELOPE_HEIGHT);
    drawCard(page, end, { fill: colors.yellowSoft });
    drawStickerIcon(page, fonts, "envelope", MARGIN + 24, end.y + ENVELOPE_HEIGHT / 2, 22, colors.coral);
    drawText(page, message, fonts, {
      x: MARGIN + 46, top: end.y + ENVELOPE_HEIGHT / 2 + (type.small * 1.35) / 2, width: CONTENT_WIDTH - 56,
    }, { size: type.small, font: fonts.bold, color: colors.ink, maxLines: 1 });
  } else {
    flow.space(-6);
    flow.text(message, { size: type.small, font: fonts.bold, color: colors.coral, maxLines: 1, align: "center" });
  }

  // Treat ideas for the grown-up filling in the stops, when there is room.
  const ideas = [
    "Pick the ice cream flavour",
    "Choose tonight's dinner",
    "One extra bedtime story",
    "Send a postcard home",
    "Pick the next stop",
    "A small souvenir",
  ];
  const ideasHeight = 20 + type.label * 2 + Math.ceil(ideas.length / 2) * (type.small * 1.5);
  flow.space(12);
  if (flow.remaining() < ideasHeight) return;
  const box = flow.take(ideasHeight);
  drawCard(page, box, { fill: colors.white, border: colors.softLine });
  const pill = drawPill(page, fonts, "Treat ideas for grown-ups", { x: box.x + 12, top: box.y + box.height - 10, color: colors.teal, fill: colors.tealSoft, size: type.label });
  const columnWidth = (CONTENT_WIDTH - 24) / 2;
  [ideas.slice(0, 3), ideas.slice(3)].forEach((column, index) => {
    drawBulletList(page, fonts, column.map((text) => ({ text })), {
      x: box.x + 12 + index * columnWidth, top: pill.y - 6, width: columnWidth, size: type.small, marker: "dot", markerColor: colors.teal, lineHeight: type.small * 1.5, gap: 0, maxLines: 1,
    });
  });
}
