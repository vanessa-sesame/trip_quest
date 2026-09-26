import { treatMilestones } from "../../booklet/stickers.ts";
import { drawStickerIcon } from "../art/icons.ts";
import { STICKER_DIAMETER, STICKER_TONES, addPage, drawPageHeader, drawStickerSpot, type PdfContext } from "../context.ts";
import { drawBulletList, drawCard, drawDottedLine, drawPill, drawText, Flow } from "../layout.ts";
import { CONTENT_BOTTOM, CONTENT_WIDTH, MARGIN, colors } from "../theme.ts";

// The treat trail: one dot per game to colour in, day by day, with treat
// stops along the way. Each stop is a sticker spot and a line where a
// grown-up writes the treat; the end of the trail opens the mystery
// envelope.
export function drawTreatTrail(ctx: PdfContext) {
  const { fonts, type, booklet } = ctx;
  const page = addPage(ctx, "Treat trail", colors.teal);
  const top = drawPageHeader(ctx, page, {
    kicker: "Treat trail",
    title: "Every game gets you closer to a treat",
    accent: colors.teal,
    soft: colors.tealSoft,
    titleLines: 2,
  });
  const flow = new Flow(page, fonts, { x: MARGIN, top, width: CONTENT_WIDTH, bottom: CONTENT_BOTTOM });
  flow.text("Colour a dot for every game you finish. Reach a stop, add its sticker, and enjoy the treat!", {
    size: type.small, color: colors.muted, maxLines: 3,
  });
  flow.space(10);

  const milestones = treatMilestones(booklet.dayPlans.length);
  const stopHeight = STICKER_DIAMETER + 64;
  const envelopeHeight = 40;
  const trailSpace = flow.remaining() - stopHeight - envelopeHeight - 24;
  const rowHeight = Math.max(14, Math.min(24, trailSpace / Math.max(1, booklet.dayPlans.length)));
  const dotRadius = Math.min(7, rowHeight / 2 - 2);
  const labelWidth = 44;

  // Day rows: "Day N", then a dot per game joined by a dotted path, and a
  // flag where a treat stop falls.
  booklet.dayPlans.forEach((day, index) => {
    const row = flow.take(rowHeight);
    const cy = row.y + row.height / 2;
    const tone = STICKER_TONES[index % STICKER_TONES.length];
    drawText(page, `Day ${day.day}`, fonts, { x: MARGIN, top: cy + type.label * 0.45, width: labelWidth }, {
      size: type.label, font: fonts.bold, color: tone.ink, maxLines: 1,
    });
    const games = ctx.stickers.filter((sticker) => sticker.kind === "game" && sticker.spot.page === "activity" && sticker.spot.day === day.day);
    const step = dotRadius * 2 + 8;
    const firstX = MARGIN + labelWidth + dotRadius;
    const lastX = firstX + Math.max(0, games.length - 1) * step;
    if (games.length > 1) drawDottedLine(page, firstX, lastX, cy, tone.ink, 1.5, 3);
    games.forEach((_, game) => {
      page.drawCircle({ x: firstX + game * step, y: cy, size: dotRadius, color: colors.white, borderColor: tone.ink, borderWidth: 1.2 });
    });
    const stop = milestones.findIndex((milestone) => milestone.afterDay === day.day);
    if (stop >= 0) {
      drawDottedLine(page, lastX + dotRadius + 4, lastX + dotRadius + 22, cy, colors.line, 1.5, 3);
      drawPill(page, fonts, `Stop ${stop + 1}`, {
        x: lastX + dotRadius + 26, top: cy + type.label, color: colors.coral, fill: colors.coralSoft, size: type.label,
      });
    }
  });
  flow.space(12);

  // Treat stops, side by side: sticker spot, name, and the treat line.
  const stops = flow.take(stopHeight);
  const gap = 8;
  const width = (CONTENT_WIDTH - gap * (milestones.length - 1)) / milestones.length;
  const cardWidth = Math.min(width, 150);
  const rowWidth = cardWidth * milestones.length + gap * (milestones.length - 1);
  milestones.forEach((milestone, index) => {
    const box = { x: MARGIN + (CONTENT_WIDTH - rowWidth) / 2 + index * (cardWidth + gap), y: stops.y, width: cardWidth, height: stopHeight };
    drawCard(page, box, { fill: colors.white, border: colors.softLine });
    drawStickerSpot(ctx, page, { page: "treats", milestone: index }, box.x + cardWidth / 2, box.y + stopHeight - STICKER_DIAMETER / 2 - 8);
    drawText(page, `Stop ${index + 1}: ${milestone.label}`, fonts, { x: box.x + 6, top: box.y + 50, width: cardWidth - 12 }, {
      size: type.label, font: fonts.bold, color: colors.ink, maxLines: 1, align: "center",
    });
    drawText(page, "Our treat:", fonts, { x: box.x + 8, top: box.y + 32, width: cardWidth - 16 }, { size: 8, color: colors.muted, maxLines: 1 });
    drawDottedLine(page, box.x + 8, box.x + cardWidth - 8, box.y + 12, colors.line, 3, 3);
  });
  flow.space(12);

  // The end of the trail.
  const end = flow.take(envelopeHeight);
  drawCard(page, { x: MARGIN, y: end.y, width: CONTENT_WIDTH, height: envelopeHeight }, { fill: colors.yellowSoft });
  drawStickerIcon(page, fonts, "envelope", MARGIN + 24, end.y + envelopeHeight / 2, 22, colors.coral);
  drawText(page, "Trail finished? Open your mystery envelope!", fonts, {
    x: MARGIN + 46, top: end.y + envelopeHeight / 2 + type.small * 0.45, width: CONTENT_WIDTH - 56,
  }, { size: type.small, font: fonts.bold, color: colors.ink, maxLines: 1 });

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
  drawBulletList(page, fonts, ideas.slice(0, 3).map((text) => ({ text })), {
    x: box.x + 12, top: pill.y - 6, width: columnWidth, size: type.small, marker: "dot", markerColor: colors.teal, lineHeight: type.small * 1.5, gap: 0,
  });
  drawBulletList(page, fonts, ideas.slice(3).map((text) => ({ text })), {
    x: box.x + 12 + columnWidth, top: pill.y - 6, width: columnWidth, size: type.small, marker: "dot", markerColor: colors.teal, lineHeight: type.small * 1.5, gap: 0,
  });
}
