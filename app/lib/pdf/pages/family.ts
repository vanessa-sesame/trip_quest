import type { DayPlan } from "../../booklet/booklet.ts";
import {
  FAMILY_BADGES,
  familyChildDisplayName,
  familyRoleDescription,
  mechanicLabel,
  mechanicMissionPrompt,
} from "../../family.ts";
import { STICKER_DIAMETER, addPage, drawPageHeader, drawStickerSpot, type FamilyPackContext, type PdfContext } from "../context.ts";
import { drawBulletList, drawCard, drawPill, drawText, fitTextSize, Flow, measureText, pdfText } from "../layout.ts";
import { drawRuledRows } from "../writing.ts";
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
  const inner = width - 20;
  const textSize = 8.5;
  const textLine = textSize * 1.35;
  const rowCount = Math.max(1, Math.min(RELAY_DAYS_PER_PAGE / 2, Math.ceil(days.length / 2)));
  const available = (flow.remaining() - footerHeight - gap * (rowCount - 1)) / rowCount;
  const texts = days.map((day) => ({
    interest: `Interest: ${day.interestHook || "Notice one detail that connects to your world."}`,
    relay: `Relay: ${day.siblingMission || "Share one observation before the next stop."}`,
  }));
  // Cards are as tall as their words need (up to five lines each), never
  // taller, so a short trip doesn't leave half-empty cards.
  const titleOptions = { size: type.small, marker: "number" as const, maxLines: 2 };
  const needs = days.map((day, index) =>
    10 - drawBulletList(null, fonts, [{ title: day.theme, marker: String(day.day) }], { ...titleOptions, x: 0, top: 0, width: inner }).bottom
    + 5 + measureText(texts[index].interest, fonts, inner, { size: textSize, maxLines: 5 }).height
    + 3 + measureText(texts[index].relay, fonts, inner, { size: textSize, maxLines: 5 }).height + 10,
  );
  let rowTop = flow.y;
  for (let row = 0; row < rowCount; row += 1) {
    const height = Math.min(available, Math.max(...needs.slice(row * 2, row * 2 + 2)));
    days.slice(row * 2, row * 2 + 2).forEach((day, column) => {
      const index = row * 2 + column;
      const x = MARGIN + column * (width + gap);
      const y = rowTop - height;
      drawCard(page, { x, y, width, height }, { fill: fills[(day.day - 1) % 4] });
      const titleRow = drawBulletList(page, fonts, [{ title: day.theme, marker: String(day.day) }], {
        ...titleOptions, x: x + 10, top: y + height - 10, width: inner, markerColor: inks[(day.day - 1) % 4],
      });
      const space = (top: number) => Math.max(1, Math.floor((top - y - 8) / textLine));
      let textTop = titleRow.bottom - 5;
      const interestLines = Math.min(5, Math.max(1, space(textTop) - 1));
      textTop = drawText(page, texts[index].interest, fonts, { x: x + 10, top: textTop, width: inner }, {
        size: textSize, color: colors.teal, maxLines: interestLines,
      }).bottom - 3;
      drawText(page, texts[index].relay, fonts, { x: x + 10, top: textTop, width: inner }, {
        size: textSize, color: colors.muted, maxLines: Math.min(5, space(textTop)),
      });
    });
    rowTop -= height + gap;
  }

  if (footerHeight) {
    const pill = drawPill(page, fonts, "Explorers in this relay", { x: MARGIN, top: rowTop - 4, color: colors.green, fill: colors.greenSoft, size: type.label });
    drawText(page, childList(pack), fonts, { x: MARGIN, top: pill.y - 4, width: CONTENT_WIDTH }, { size: type.small, color: colors.muted, maxLines: 1 });
  }
}

// Event titles can arrive as raw markdown table rows ("| **Sat 10 Oct** |
// Plan |"); print them as plain words and skip header/separator rows.
function plainEventTitle(title: string) {
  const cells = title.replace(/\*\*|__|`/g, "").split("|").map((cell) => cell.replace(/^#+\s*/, "").trim()).filter(Boolean);
  const words = cells.filter((cell) => !/^:?-{2,}:?$/.test(cell));
  if (!words.length || /^(date|day)$/i.test(words[0]) && words.length <= 3 && words.every((cell) => cell.split(" ").length <= 2)) return "";
  return words.join(" - ");
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
    const events = pack.events.filter((event) => event.day === index + 1).map((event) => plainEventTitle(event.title)).filter(Boolean).join(" / ");
    return { marker: String(index + 1), text: events || booklet.dayPlans[index]?.theme || "Open adventure" };
  });
  const columns = lines.length > 7 ? 2 : 1;
  const perColumn = Math.ceil(lines.length / columns);
  const columnWidth = (CONTENT_WIDTH - 12 * (columns - 1)) / columns;
  const size = type.small;
  // Rows share the space left; with room, each day's thread gets two lines.
  const rowHeight = Math.max(size * 1.3 + 4, Math.min(size * 1.3 * 2 + 10, flow.remaining() / Math.max(1, perColumn)));
  const maxLines = rowHeight >= size * 1.3 * 2 + 6 ? 2 : 1;
  for (let column = 0; column < columns; column += 1) {
    lines.slice(column * perColumn, (column + 1) * perColumn).forEach((line, row) => {
      drawBulletList(page, fonts, [line], {
        x: MARGIN + column * (columnWidth + 12), top: flow.y - row * rowHeight, width: columnWidth, size, marker: "number", markerColor: colors.teal, maxLines, lineHeight: size * 1.3,
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
    const titleSize = fitTextSize(day.theme, fonts.display, width - 24, type.heading, Math.min(type.heading, 11), 2);
    const title = drawText(page, day.theme, fonts, { x: x + 12, top: pill.y - 8, width: width - 24 }, { size: titleSize, font: fonts.display, color: colors.ink, maxLines: 2 });
    // The mission in full where it fits (keeping at least one writing
    // row), then writing rows for what the child found in the rest.
    const pitch = type.writeLine;
    const mission = pdfText(mechanicMissionPrompt(mechanic, day.theme));
    const promptLine = type.small * 1.35;
    const promptTop = title.bottom - 4;
    const promptLines = Math.max(2, Math.floor((promptTop - y - 8 - pitch) / promptLine));
    const prompt = drawText(page, mission, fonts, { x: x + 12, top: promptTop, width: width - 24 }, {
      size: type.small, color: colors.muted, maxLines: promptLines,
    });
    drawRuledRows(page, { x: x + 12, y: y + 4, width: width - 24, height: prompt.bottom - y - 6 }, pitch, "bottom");
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
  // Each cell: the badge's sticker spot (captioned with the badge's name)
  // and a writing row for who earned it.
  FAMILY_BADGES.forEach((badge, index) => {
    const box = cell(index);
    drawCard(page, box, { fill: fills[index % 4] });
    drawStickerSpot(ctx, page, { page: "badges", index }, box.x + width / 2, box.y + height - STICKER_DIAMETER / 2 - 7, badge);
    const row = Math.min(type.writeLine, box.y + height - STICKER_DIAMETER - 14 - box.y - 4);
    drawRuledRows(page, { x: box.x + 10, y: box.y + 4, width: width - 20, height: row }, row);
  });
  const reward = cell(FAMILY_BADGES.length);
  drawCard(page, reward, { fill: colors.white, border: colors.softLine });
  const pill = drawPill(page, fonts, "Family reward", { x: reward.x + 8, top: reward.y + reward.height - 8, color: colors.teal, fill: colors.tealSoft, size: type.label });
  const rewardText = drawText(page, `Collect ${Math.min(8, Math.max(3, booklet.days + 1))} badges, then choose a shared treat together.`, fonts, {
    x: reward.x + 8, top: pill.y - 6, width: width - 16,
  }, { size: 8.5, color: colors.muted, maxLines: 5 });
  drawRuledRows(page, { x: reward.x + 10, y: reward.y + 4, width: width - 20, height: rewardText.bottom - reward.y - 8 }, type.writeLine, "bottom");
}
