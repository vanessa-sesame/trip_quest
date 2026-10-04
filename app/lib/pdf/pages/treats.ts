import type { PDFPage } from "pdf-lib";
import type { DayPlan } from "../../booklet/booklet.ts";
import { MAX_TREAT_STOPS, treatMilestones } from "../../booklet/stickers.ts";
import { drawStickerIcon } from "../art/icons.ts";
import { STICKER_DIAMETER, STICKER_TONES, addPage, drawPageHeader, drawStickerSpot, type PdfContext } from "../context.ts";
import { drawBulletList, drawCard, drawDottedLine, drawNumberBadge, drawPill, drawText, Flow, type Box } from "../layout.ts";
import { CONTENT_WIDTH, CONTENT_BOTTOM, MARGIN, colors } from "../theme.ts";
import { drawWriteArea } from "../writing.ts";

// The treat trail: one dot per game to colour in, day by day, with treat
// stops along the way (app/lib/booklet/stickers.ts treatMilestones). Each
// stop is a card with its numbered badge, a 30mm sticker spot and a
// writing row where a grown-up writes the treat; the end of the trail
// opens the mystery envelope.
//
// Trips of up to four days have a stop every day, so each day is one card
// (its dots on top, its stop below) in a 2 x 2 trail. Longer trips list
// every day as a compact row (in up to three columns) with the stop's
// numbered badge on the days where stops fall, then the four stop cards.

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
  drawWriteArea(page, fonts, { intro: "", choices: [], fields: [{ label: "Our treat:", slots: [""] }] }, {
    x: box.x + 10, y: box.y + 6, width: box.width - 20, height: type.writeLine,
  }, { pitch: type.writeLine, size: type.small, minLines: 1, maxLines: 1 });
}

export function drawTreatTrail(ctx: PdfContext) {
  const { fonts, type, booklet } = ctx;
  const page = addPage(ctx, "Treat trail", colors.teal);
  const top = drawPageHeader(ctx, page, {
    kicker: "Treat trail",
    title: "Every game brings a treat closer",
    accent: colors.teal,
    soft: colors.tealSoft,
    titleLines: 1,
  });
  const flow = new Flow(page, fonts, { x: MARGIN, top, width: CONTENT_WIDTH, bottom: CONTENT_BOTTOM });
  flow.text("Colour a dot for every game you finish. Reach a stop, add its sticker, and enjoy the treat!", {
    size: type.small, color: colors.muted, maxLines: 3,
  });
  flow.space(10);

  const days = booklet.dayPlans;
  const stops = treatMilestones(days.length);
  const stopOn = (day: number) => stops.findIndex((stop) => stop.afterDay === day);
  const halfWidth = (CONTENT_WIDTH - GAP) / 2;
  const stopHeight = stopCardHeight(ctx);
  let showEnvelope = true;

  if (days.length <= MAX_TREAT_STOPS) {
    // One card per day: the day's dots, then its stop.
    const headerHeight = 24;
    const cardHeight = headerHeight + stopHeight;
    const rows = Math.ceil(days.length / 2);
    const grid = flow.take(rows * cardHeight + (rows - 1) * GAP);
    days.forEach((day, index) => {
      const row = Math.floor(index / 2);
      const alone = index === days.length - 1 && days.length % 2 === 1;
      const x = alone ? MARGIN + (CONTENT_WIDTH - halfWidth) / 2 : MARGIN + (index % 2) * (halfWidth + GAP);
      const box = { x, y: grid.y + grid.height - (row + 1) * cardHeight - row * GAP, width: halfWidth, height: cardHeight };
      const tone = STICKER_TONES[index % STICKER_TONES.length];
      drawCard(page, box, { fill: colors.white, border: tone.ink, borderWidth: 1 });
      // The day's dots on a soft band across the top of its card.
      const header = { x: box.x + 4, y: box.y + stopHeight, width: box.width - 8, height: headerHeight - 4 };
      drawCard(page, header, { fill: tone.soft, radius: 9 });
      drawDayTrail(ctx, page, day, index, { x: header.x + 8, cy: header.y + header.height / 2, width: header.width - 16, height: header.height - 2 }, -1);
      drawStop(ctx, page, stops[index], index, { ...box, height: stopHeight });
    });
  } else {
    // Day rows, compressed into columns as the trip grows, then the stops.
    const cardsHeight = 2 * stopHeight + GAP;
    const rowsSpace = flow.remaining() - cardsHeight - 12;
    const minRow = 15;
    const envelopeSpace = ENVELOPE_HEIGHT + 12;
    const fits = (columns: number, withEnvelope: boolean) => Math.ceil(days.length / columns) * minRow <= rowsSpace - (withEnvelope ? envelopeSpace : 0);
    const columns = [1, 2, 3].find((count) => fits(count, true)) ?? [1, 2, 3].find((count) => fits(count, false)) ?? 3;
    showEnvelope = fits(columns, true);
    const perColumn = Math.ceil(days.length / columns);
    const rowHeight = Math.min(24, (rowsSpace - (showEnvelope ? envelopeSpace : 0)) / perColumn);
    const columnGap = 12;
    const columnWidth = (CONTENT_WIDTH - columnGap * (columns - 1)) / columns;
    const trail = flow.take(perColumn * rowHeight);
    days.forEach((day, index) => {
      const column = Math.floor(index / perColumn);
      const row = index % perColumn;
      drawDayTrail(ctx, page, day, index, {
        x: MARGIN + column * (columnWidth + columnGap),
        cy: trail.y + trail.height - row * rowHeight - rowHeight / 2,
        width: columnWidth,
        height: rowHeight,
      }, stopOn(day.day));
    });
    flow.space(12);
    const grid = flow.take(cardsHeight);
    stops.forEach((stop, index) => {
      const row = Math.floor(index / 2);
      const box = { x: MARGIN + (index % 2) * (halfWidth + GAP), y: grid.y + grid.height - (row + 1) * stopHeight - row * GAP, width: halfWidth, height: stopHeight };
      drawCard(page, box, { fill: colors.white, border: colors.softLine });
      drawStop(ctx, page, stop, index, box);
    });
  }

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
