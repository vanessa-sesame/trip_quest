import type { DayPlan } from "../../booklet/booklet.ts";
import {
  FAMILY_BADGES,
  familyChildDisplayName,
  familyRoleDescription,
  mechanicLabel,
  mechanicMissionPrompt,
} from "../../family.ts";
import { STICKER_DIAMETER, addPage, drawPageHeader, drawStickerSpot, type FamilyPackContext, type PdfContext } from "../context.ts";
import { drawBulletList, drawCard, drawDottedLine, drawPill, drawText, Flow, measureText, pdfText } from "../layout.ts";
import { RELAY_DAYS_PER_PAGE } from "../plan.ts";
import { CONTENT_BOTTOM, CONTENT_WIDTH, MARGIN, colors } from "../theme.ts";


const fills = [colors.yellowSoft, colors.greenSoft, colors.tealSoft, colors.coralSoft];
const inks = [colors.yellow, colors.green, colors.teal, colors.coral];

function childList(pack: FamilyPackContext) {
  return pack.children.map((child, index) => `${pdfText(familyChildDisplayName(child, index))} (age ${child.age})`).join(", ");
}

export function drawFamilyRelayPage(ctx: PdfContext, pack: FamilyPackContext, days: DayPlan[], part: number, parts: number) {
  const { fonts, type } = ctx;
  const page = addPage(ctx, "Family relay", colors.coral);
  const top = drawPageHeader(ctx, page, {
    kicker: parts > 1 ? `Family relay / ${part} of ${parts}` : "Family relay and interest lens",
    title: "A fresh handoff for every day",
    accent: colors.coral,
    soft: colors.coralSoft,
    titleLines: 1,
  });
  const flow = new Flow(page, fonts, { x: MARGIN, top, width: CONTENT_WIDTH, bottom: CONTENT_BOTTOM });
  flow.text("The grown-up map: each day's interest moment and a relay job that changes, so nobody is stuck doing the same thing.", {
    size: type.small, color: colors.muted, maxLines: 3,
  });
  flow.space(12);

  const footerHeight = part === parts ? 44 : 0;
  const gap = 10;
  const width = (CONTENT_WIDTH - gap) / 2;
  const rowsPerColumn = RELAY_DAYS_PER_PAGE / 2;
  const height = (flow.remaining() - footerHeight - gap * (rowsPerColumn - 1)) / rowsPerColumn;
  days.forEach((day, index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = MARGIN + column * (width + gap);
    const y = flow.y - (row + 1) * height - row * gap;
    drawCard(page, { x, y, width, height }, { fill: fills[(day.day - 1) % 4] });
    const titleRow = drawBulletList(page, fonts, [{ title: day.theme, marker: String(day.day) }], {
      x: x + 10, top: y + height - 10, width: width - 20, size: type.small, marker: "number", markerColor: inks[(day.day - 1) % 4], maxLines: 2,
    });
    const interest = day.interestHook || "Notice one detail that connects to your world.";
    const relay = day.siblingMission || "Share one observation before the next stop.";
    let textTop = titleRow.bottom - 5;
    textTop = drawText(page, `Interest: ${interest}`, fonts, { x: x + 10, top: textTop, width: width - 20 }, {
      size: 8.5, color: colors.teal, maxLines: 3,
    }).bottom - 3;
    const relayLines = Math.max(1, Math.floor((textTop - y - 8) / (8.5 * 1.35)));
    drawText(page, `Relay: ${relay}`, fonts, { x: x + 10, top: textTop, width: width - 20 }, {
      size: 8.5, color: colors.muted, maxLines: Math.min(3, relayLines),
    });
  });

  if (footerHeight) {
    const pill = drawPill(page, fonts, "Explorers in this relay", { x: MARGIN, top: CONTENT_BOTTOM + footerHeight - 4, color: colors.green, fill: colors.greenSoft, size: type.label });
    drawText(page, childList(pack), fonts, { x: MARGIN, top: pill.y - 4, width: CONTENT_WIDTH }, { size: type.small, color: colors.muted, maxLines: 1 });
  }
}

export function drawFamilyMissionPage(ctx: PdfContext, pack: FamilyPackContext) {
  const { fonts, type, booklet } = ctx;
  const page = addPage(ctx, "Family pack", colors.green);
  const top = drawPageHeader(ctx, page, {
    kicker: "Family mission map",
    title: "One trip, many ways to play",
    accent: colors.green,
    soft: colors.greenSoft,
    titleLines: 1,
  });
  const flow = new Flow(page, fonts, { x: MARGIN, top, width: CONTENT_WIDTH, bottom: CONTENT_BOTTOM });
  flow.text(`This ${pdfText(booklet.destination)} pack gives every explorer a useful role. Share the same place, then let each child notice it at their own level.`, {
    size: type.small, color: colors.muted, maxLines: 3,
  });
  flow.space(12);

  const rolesPill = drawPill(page, fonts, "Explorer roles", { x: MARGIN, top: flow.y, color: colors.coral, fill: colors.coralSoft, size: type.label });
  flow.y = rolesPill.y - 8;
  pack.children.slice(0, 6).forEach((child, index) => {
    const name = `${index === 0 ? "Lead: " : ""}${pdfText(familyChildDisplayName(child, index))}, age ${child.age}`;
    const role = pdfText(familyRoleDescription(child, index));
    const height = 16 + measureText(name, fonts, CONTENT_WIDTH - 60, { size: type.small, font: fonts.bold, maxLines: 1 }).height
      + measureText(role, fonts, CONTENT_WIDTH - 60, { size: 8.5, maxLines: 2 }).height;
    const box = flow.take(height);
    drawCard(page, box, { fill: index % 2 ? colors.greenSoft : colors.white, border: colors.softLine, radius: 10 });
    drawBulletList(page, fonts, [{ title: name, text: role, marker: String(index + 1) }], {
      x: box.x + 10, top: box.y + height - 8, width: box.width - 20, size: type.small, marker: "number", markerColor: index % 2 ? colors.green : colors.teal, maxLines: 2,
    });
    flow.space(6);
  });
  flow.space(8);

  const threadPill = drawPill(page, fonts, "Trip thread", { x: MARGIN, top: flow.y, color: colors.teal, fill: colors.tealSoft, size: type.label });
  flow.y = threadPill.y - 8;
  const lines = Array.from({ length: booklet.days }, (_, index) => {
    const events = pack.events.filter((event) => event.day === index + 1).map((event) => event.title).join(" / ");
    return { marker: String(index + 1), text: events || booklet.dayPlans[index]?.theme || "Open adventure" };
  });
  const columns = lines.length > 7 ? 2 : 1;
  const perColumn = Math.ceil(lines.length / columns);
  const columnWidth = (CONTENT_WIDTH - 12 * (columns - 1)) / columns;
  const lineHeight = Math.max(8.5 * 1.3, Math.min(20, flow.remaining() / Math.max(1, perColumn)));
  for (let column = 0; column < columns; column += 1) {
    lines.slice(column * perColumn, (column + 1) * perColumn).forEach((line, row) => {
      drawBulletList(page, fonts, [line], {
        x: MARGIN + column * (columnWidth + 12), top: flow.y - row * lineHeight, width: columnWidth, size: 8.5, marker: "number", markerColor: colors.teal, maxLines: 1,
      });
    });
  }
}

export function drawMissionCardsPage(ctx: PdfContext, pack: FamilyPackContext) {
  const { fonts, type, booklet } = ctx;
  const page = addPage(ctx, "Mission cards", colors.teal);
  const top = drawPageHeader(ctx, page, {
    kicker: "Cut-out mission cards",
    title: "Pick one when the day needs a spark",
    accent: colors.teal,
    soft: colors.tealSoft,
  });
  const flow = new Flow(page, fonts, { x: MARGIN, top, width: CONTENT_WIDTH, bottom: CONTENT_BOTTOM });
  flow.text("Keep the cards together or cut along the dotted lines. The goal is to notice and enjoy the place, not to finish everything.", {
    size: type.small, color: colors.muted, maxLines: 2,
  });
  flow.space(12);
  const seen = new Set<string>();
  const cards = booklet.dayPlans.flatMap((day, dayIndex) => {
    const plan = pack.mechanicsByDay[dayIndex]?.mechanics || ["spot"];
    return plan.flatMap((mechanic) => {
      const key = `${day.day}|${mechanic}`;
      if (seen.has(key)) return [];
      seen.add(key);
      return [{ day, mechanic }];
    });
  }).slice(0, 4);
  const gap = 12;
  const width = (CONTENT_WIDTH - gap) / 2;
  const height = (flow.remaining() - gap) / 2;
  cards.forEach(({ day, mechanic }, index) => {
    const x = MARGIN + (index % 2) * (width + gap);
    const y = flow.y - (Math.floor(index / 2) + 1) * height - Math.floor(index / 2) * gap;
    drawCard(page, { x, y, width, height }, { fill: colors.white, border: inks[index % 4], borderWidth: 1.4, radius: 14 });
    const pill = drawPill(page, fonts, `Day ${day.day} / ${mechanicLabel(mechanic)}`, { x: x + 10, top: y + height - 10, color: inks[index % 4], fill: fills[index % 4], size: type.label, maxWidth: width - 20 });
    const title = drawText(page, day.theme, fonts, { x: x + 12, top: pill.y - 8, width: width - 24 }, { size: type.heading, font: fonts.display, color: colors.ink, maxLines: 2 });
    drawText(page, pdfText(mechanicMissionPrompt(mechanic, day.theme)), fonts, { x: x + 12, top: title.bottom - 4, width: width - 24 }, {
      size: type.small, color: colors.muted, maxLines: Math.max(1, Math.floor((title.bottom - 4 - y - 28) / (type.small * 1.35))),
    });
    drawDottedLine(page, x + 12, x + width - 12, y + 16, colors.line, 4, 4);
  });
}

export function drawBadgeTrackerPage(ctx: PdfContext) {
  const { fonts, type, booklet } = ctx;
  const page = addPage(ctx, "Badge tracker", colors.coral);
  const top = drawPageHeader(ctx, page, {
    kicker: "Badge tracker",
    title: "Collect the way you traveled",
    accent: colors.coral,
    soft: colors.coralSoft,
    titleLines: 1,
  });
  const flow = new Flow(page, fonts, { x: MARGIN, top, width: CONTENT_WIDTH, bottom: CONTENT_BOTTOM });
  flow.text("Each badge has a sticker in the mystery envelope. Stick it on when someone in the family earns it.", { size: type.small, color: colors.muted, maxLines: 2 });
  flow.space(10);
  // Three columns of 30mm sticker spots; the ninth cell is the family reward.
  const gap = 8;
  const width = (CONTENT_WIDTH - gap * 2) / 3;
  const height = (flow.y - CONTENT_BOTTOM - gap * 2) / 3;
  const cell = (index: number) => ({
    x: MARGIN + (index % 3) * (width + gap),
    y: flow.y - (Math.floor(index / 3) + 1) * height - Math.floor(index / 3) * gap,
    width,
    height,
  });
  FAMILY_BADGES.forEach((badge, index) => {
    const box = cell(index);
    drawCard(page, box, { fill: fills[index % 4] });
    drawStickerSpot(ctx, page, { page: "badges", index }, box.x + width / 2, box.y + height - STICKER_DIAMETER / 2 - 10);
    drawText(page, badge, fonts, { x: box.x + 6, top: box.y + height - STICKER_DIAMETER - 20, width: width - 12 }, { size: type.label, font: fonts.bold, color: colors.ink, maxLines: 2, align: "center" });
    drawDottedLine(page, box.x + 10, box.x + width - 10, box.y + 12, colors.line, 3, 3);
  });
  const reward = cell(FAMILY_BADGES.length);
  drawCard(page, reward, { fill: colors.white, border: colors.softLine });
  const pill = drawPill(page, fonts, "Family reward", { x: reward.x + 8, top: reward.y + reward.height - 8, color: colors.teal, fill: colors.tealSoft, size: type.label });
  drawText(page, `Collect ${Math.min(8, Math.max(3, booklet.days + 1))} badges, then choose a shared treat together.`, fonts, {
    x: reward.x + 8, top: pill.y - 6, width: width - 16,
  }, { size: 8.5, color: colors.muted, maxLines: 5 });
  drawDottedLine(page, reward.x + 10, reward.x + width - 10, reward.y + 14, colors.line, 3, 3);
}
