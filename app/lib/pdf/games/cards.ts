import type { RGB } from "pdf-lib";
import type { GameItem } from "../../booklet/booklet.ts";
import { drawRoundedRect } from "../illustrations.ts";
import {
  bulletMarkerRadius,
  drawBulletList,
  drawCard,
  drawNumberBadge,
  drawPill,
  drawText,
  measureText,
  type Box,
} from "../layout.ts";
import { colors } from "../theme.ts";
import { drawRuledRows, drawWriteArea } from "../writing.ts";
import type { GameArgs } from "./types.ts";

const stickerFills: RGB[] = [colors.coralSoft, colors.tealSoft, colors.yellowSoft, colors.greenSoft];
const stickerInks: RGB[] = [colors.coral, colors.teal, colors.yellow, colors.green];

function gameItems(items: GameItem[] | undefined) {
  return (items ?? []).slice(0, 4);
}

// Stacks rows of the given natural heights from the top of `box`. With
// `fill`, the box's spare height is shared out between the rows; rows that
// need more than the box has are shrunk to fit.
function stackRows(box: Box, needed: number[], gap: number, fill: boolean) {
  const count = needed.length;
  if (!count) return [];
  const natural = needed.reduce((sum, height) => sum + height, 0);
  const available = box.height - gap * (count - 1);
  const scale = natural > available ? available / natural : 1;
  const extra = fill && natural < available ? (available - natural) / count : 0;
  let top = box.y + box.height;
  return needed.map((height) => {
    const rowHeight = height * scale + extra;
    const row = { x: box.x, y: top - rowHeight, width: box.width, height: rowHeight };
    top -= rowHeight + gap;
    return row;
  });
}

function lastBottom(rows: Box[], box: Box) {
  return rows.length ? rows[rows.length - 1].y : box.y + box.height;
}

// Word cards on the left, lettered clues on the right. Each row's number
// badge, word, both connector dots, letter badge and clue block all centre
// on the row's middle, so every pair reads as one straight line across.
export function drawMatching(args: GameArgs) {
  const { ctx, page, activity, box, fill = true } = args;
  const { fonts, type } = ctx;
  const items = gameItems(activity.items);
  // Clues run in reverse so no word sits beside its own clue; the answer
  // key's "1-D / 2-C / 3-B / 4-A" depends on this order.
  const reversed = [...items].reverse();
  const leftWidth = box.width * 0.4;
  const rightX = box.x + box.width * 0.52;
  const leftRadius = bulletMarkerRadius("number", type.body);
  const rightRadius = bulletMarkerRadius("letter", type.small);
  const leftTextX = box.x + 10 + leftRadius * 2 + 8;
  const leftTextWidth = box.x + leftWidth - 10 - leftTextX;
  const rightTextX = rightX + rightRadius * 2 + 8;
  const rightTextWidth = box.x + box.width - rightTextX;
  const leftStyle = { size: type.body, font: fonts.bold, maxLines: 3 };
  const rightStyle = { size: type.small, maxLines: 4 };
  const measured = items.map((item, index) => ({
    left: measureText(item.label, fonts, leftTextWidth, leftStyle).height,
    right: measureText(reversed[index].clue, fonts, rightTextWidth, rightStyle).height,
  }));
  const needed = measured.map(({ left, right }) => Math.max(56, Math.max(left, right, leftRadius * 2) + 24));
  const rows = stackRows(box, needed, 8, fill);
  rows.forEach((row, index) => {
    const item = items[index];
    const cy = row.y + row.height / 2;
    const ink = stickerInks[index % 4];
    drawCard(page, { x: box.x, y: row.y + 2, width: leftWidth, height: row.height - 4 }, { fill: stickerFills[index % 4] });
    drawNumberBadge(page, fonts, String(index + 1), { x: box.x + 10 + leftRadius, y: cy }, leftRadius, ink);
    // Text blocks are centred on the row's middle (a hair lower, so the
    // x-height rather than the line box sits on the centre line).
    drawText(page, item.label, fonts, { x: leftTextX, top: cy + measured[index].left / 2 + type.body * 0.05, width: leftTextWidth }, { ...leftStyle, color: colors.ink });
    drawNumberBadge(page, fonts, String.fromCharCode(65 + index), { x: rightX + rightRadius, y: cy }, rightRadius, colors.teal, colors.tealSoft);
    drawText(page, reversed[index].clue, fonts, { x: rightTextX, top: cy + measured[index].right / 2 + type.small * 0.05, width: rightTextWidth }, { ...rightStyle, color: colors.ink });
    page.drawCircle({ x: box.x + leftWidth + 7, y: cy, size: 3, color: colors.line });
    page.drawCircle({ x: rightX - 8, y: cy, size: 3, color: colors.line });
  });
  return lastBottom(rows, box);
}

export function drawBingo({ ctx, page, activity, box, fill = true }: GameArgs) {
  const { fonts, type } = ctx;
  const items = gameItems(activity.items);
  const gap = 10;
  const width = (box.width - gap) / 2;
  const titleStyle = { size: type.heading, font: fonts.display, maxLines: 2 };
  const clueStyle = { size: type.small, maxLines: 4 };
  const cardNeeds = items.map((item) =>
    12 + measureText(item.label, fonts, width - 50, titleStyle).height + 4 + measureText(item.clue, fonts, width - 24, clueStyle).height + 12,
  );
  const rowNeeds = [0, 1].map((row) => Math.max(96, ...cardNeeds.slice(row * 2, row * 2 + 2))).slice(0, Math.ceil(items.length / 2));
  const rows = stackRows(box, rowNeeds, gap, fill);
  items.forEach((item, index) => {
    const row = rows[Math.floor(index / 2)];
    const x = box.x + (index % 2) * (width + gap);
    const { y, height } = row;
    const ink = stickerInks[index % 4];
    drawCard(page, { x, y, width, height }, { fill: stickerFills[index % 4] });
    // A big empty circle to stamp or tick once it is spotted.
    page.drawCircle({ x: x + width - 22, y: y + height - 22, size: 12, color: colors.white, borderColor: ink, borderWidth: 1.4 });
    const title = drawText(page, item.label, fonts, { x: x + 12, top: y + height - 12, width: width - 50 }, { ...titleStyle, color: colors.ink });
    drawText(page, item.clue, fonts, { x: x + 12, top: title.bottom - 4, width: width - 24 }, {
      size: type.small, color: colors.muted, maxLines: Math.max(1, Math.min(4, Math.floor((title.bottom - 4 - y - 10) / (type.small * 1.35)))),
    });
  });
  return lastBottom(rows, box);
}

export function drawChecklist({ ctx, page, activity, box, fill = true }: GameArgs) {
  const { fonts, type } = ctx;
  const items = gameItems(activity.items);
  const innerWidth = box.width - 24;
  const listOptions = { size: type.body, marker: "check" as const, maxLines: 3 };
  const measured = items.map((item) => -drawBulletList(null, fonts, [{ title: item.label, text: item.clue }], { ...listOptions, x: 0, top: 0, width: innerWidth }).bottom);
  const rows = stackRows(box, measured.map((height) => Math.max(48, height + 22)), 8, fill);
  rows.forEach((row, index) => {
    const item = items[index];
    drawCard(page, row, { fill: index % 2 ? colors.greenSoft : colors.white, border: colors.softLine });
    drawBulletList(page, fonts, [{ title: item.label, text: item.clue }], {
      ...listOptions,
      x: row.x + 12,
      top: row.y + row.height / 2 + measured[index] / 2,
      width: innerWidth,
      markerColor: colors.coral,
    });
  });
  return lastBottom(rows, box);
}

// Four short questions: the clue is the question, the label is the answer
// (shown only in the grown-up answer notes). Each card ends in a writing
// row for the answer, one writing pitch tall. When four long questions
// cannot fit at that size, the questions drop to the small size first and
// only then do the answer rows give up a little height (never below 70%).
export function drawQuiz({ ctx, page, activity, box, fill = true }: GameArgs) {
  const { fonts, type } = ctx;
  const items = gameItems(activity.items);
  const innerWidth = box.width - 24;
  const gap = 8;
  const questionHeights = (size: number) => items.map((item, index) =>
    -drawBulletList(null, fonts, [{ text: item.clue, marker: String(index + 1) }], { size, marker: "number", maxLines: 3, x: 0, top: 0, width: innerWidth }).bottom,
  );
  const frame = 10 + 2 + 6;
  const total = (heights: number[], pitch: number) => heights.reduce((sum, height) => sum + frame + height + pitch, 0) + gap * Math.max(0, items.length - 1);
  let size = type.body;
  let pitch = type.writeLine;
  let heights = questionHeights(size);
  if (total(heights, pitch) > box.height) {
    size = type.small;
    heights = questionHeights(size);
  }
  if (total(heights, pitch) > box.height && items.length) {
    pitch = Math.max(type.writeLine * 0.7, pitch - (total(heights, pitch) - box.height) / items.length);
  }
  const rows = stackRows(box, heights.map((height) => frame + height + pitch), gap, fill);
  rows.forEach((row, index) => {
    const item = items[index];
    drawCard(page, row, { fill: colors.white, border: colors.softLine });
    const question = drawBulletList(page, fonts, [{ text: item.clue, marker: String(index + 1) }], {
      size,
      marker: "number",
      maxLines: 3,
      x: row.x + 12,
      top: row.y + row.height - 10,
      width: innerWidth,
      markerColor: stickerInks[index % 4],
    });
    // The answer row fills the card below the question, so it can never
    // run into the question's words.
    const textX = question.rows[0].textX;
    const answerHeight = Math.max(14, question.bottom - 2 - (row.y + 6));
    drawWriteArea(page, fonts, { intro: "", choices: [], fields: [{ label: "Answer:", slots: [""] }] }, {
      x: textX, y: row.y + 6, width: row.x + row.width - 12 - textX, height: answerHeight,
    }, { pitch: answerHeight, size: type.small, minLines: 1, maxLines: 1 });
  });
  return lastBottom(rows, box);
}

export function drawStory({ ctx, page, activity, box }: GameArgs) {
  const { fonts, type } = ctx;
  const items = gameItems(activity.items);
  const gap = 8;
  const sparkWidth = (box.width - gap) / 2;
  const clueSize = Math.max(8.5, type.small - 1);
  // Spark cards are as tall as their words; the rest is writing space.
  const sparkNeed = Math.max(46, ...items.map((item) =>
    8 + measureText(item.label, fonts, sparkWidth - 20, { size: type.small, font: fonts.bold, maxLines: 1 }).height
    + measureText(item.clue, fonts, sparkWidth - 20, { size: clueSize, maxLines: 4, lineHeight: clueSize * 1.3 }).height + 10,
  ));
  const sparkHeight = Math.min(78, sparkNeed, (box.height * 0.42 - gap) / 2);
  const top = box.y + box.height;
  items.forEach((item, index) => {
    const x = box.x + (index % 2) * (sparkWidth + gap);
    const y = top - (Math.floor(index / 2) + 1) * sparkHeight - Math.floor(index / 2) * gap;
    drawCard(page, { x, y, width: sparkWidth, height: sparkHeight }, { fill: stickerFills[index % 4] });
    const title = drawText(page, item.label, fonts, { x: x + 10, top: y + sparkHeight - 8, width: sparkWidth - 20 }, {
      size: type.small, font: fonts.bold, color: stickerInks[index % 4], maxLines: 1,
    });
    const available = Math.max(1, Math.floor((title.bottom - y - 6) / (clueSize * 1.3)));
    drawText(page, item.clue, fonts, { x: x + 10, top: title.bottom, width: sparkWidth - 20 }, {
      size: clueSize, color: colors.ink, maxLines: available, lineHeight: clueSize * 1.3,
    });
  });
  const sparkRows = Math.ceil(items.length / 2);
  const writeTop = top - sparkRows * (sparkHeight + gap) - 6;
  drawPill(page, fonts, "Write or draw your story", { x: box.x, top: writeTop, color: colors.green, fill: colors.greenSoft, size: type.label });
  const writeBox = { x: box.x, y: box.y, width: box.width, height: writeTop - type.label * 2 - 8 - box.y };
  drawRoundedRect(page, writeBox, 12, { color: colors.white, borderColor: colors.softLine, borderWidth: 1 });
  drawRuledRows(page, { x: writeBox.x + 14, y: writeBox.y + 4, width: writeBox.width - 28, height: writeBox.height - 8 }, type.writeLine);
  return box.y;
}

// Until spot-the-difference has real paired art, the same subjects become a
// look-closely checklist rather than a placeholder drawing.
// A spot-the-difference game whose two pictures could not be made becomes
// a look-and-find in the real place. Its clues were written for the
// pictures ("…in the second picture"), so any clue about a picture is
// replaced with a plain find-it prompt for the same detail.
export function drawLookAndFind(args: GameArgs) {
  const items = (args.activity.items ?? []).map((item) => (
    /\b(?:pictures?|drawings?|image|copy|copies)\b/i.test(item.clue)
      ? { ...item, clue: `Find this here: ${item.label.toLocaleLowerCase()}.` }
      : item
  ));
  return drawChecklist({ ...args, activity: { ...args.activity, items } });
}
