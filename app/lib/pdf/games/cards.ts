import type { RGB } from "pdf-lib";
import type { GameItem } from "../../booklet/booklet.ts";
import { drawRoundedRect } from "../illustrations.ts";
import {
  drawBulletList,
  drawCard,
  drawDottedLine,
  drawPill,
  drawText,
  drawWriteLines,
  type Box,
} from "../layout.ts";
import { colors } from "../theme.ts";
import type { GameArgs } from "./types.ts";

const stickerFills: RGB[] = [colors.coralSoft, colors.tealSoft, colors.yellowSoft, colors.greenSoft];
const stickerInks: RGB[] = [colors.coral, colors.teal, colors.yellow, colors.green];

function gameItems(items: GameItem[] | undefined) {
  return (items ?? []).slice(0, 4);
}

// Splits `box` into `count` equal rows, top to bottom.
function rows(box: Box, count: number, gap: number) {
  const height = (box.height - gap * (count - 1)) / count;
  return Array.from({ length: count }, (_, index) => ({
    x: box.x,
    y: box.y + box.height - (index + 1) * height - index * gap,
    width: box.width,
    height,
  }));
}

// Places a one-item bullet list vertically centred in `row`.
function centredItem(args: GameArgs, row: Box, item: Parameters<typeof drawBulletList>[2][number], options: Omit<Parameters<typeof drawBulletList>[3], "top">) {
  const { fonts } = args.ctx;
  const measured = drawBulletList(null, fonts, [item], { ...options, top: 0 });
  const height = -measured.bottom;
  return drawBulletList(args.page, fonts, [item], { ...options, top: row.y + row.height / 2 + height / 2 }).rows[0];
}

export function drawMatching(args: GameArgs) {
  const { ctx, page, activity, box } = args;
  const { type } = ctx;
  const items = gameItems(activity.items);
  // Clues run in reverse so no word sits beside its own clue; the answer
  // key's "1-D / 2-C / 3-B / 4-A" depends on this order.
  const reversed = [...items].reverse();
  const leftWidth = box.width * 0.4;
  const rightX = box.x + box.width * 0.52;
  const rightWidth = box.x + box.width - rightX;
  rows(box, items.length || 1, 8).forEach((row, index) => {
    const item = items[index];
    if (!item) return;
    drawCard(page, { x: box.x, y: row.y + 2, width: leftWidth, height: row.height - 4 }, { fill: stickerFills[index % 4] });
    const left = centredItem(args, row, { title: item.label, marker: String(index + 1) }, {
      x: box.x + 8, width: leftWidth - 16, size: type.body, marker: "number", markerColor: stickerInks[index % 4],
    });
    const right = centredItem(args, row, { text: reversed[index].clue, marker: String.fromCharCode(65 + index) }, {
      x: rightX, width: rightWidth, size: type.small, marker: "letter", markerColor: colors.teal, markerFill: colors.tealSoft, maxLines: 4,
    });
    page.drawCircle({ x: box.x + leftWidth + 6, y: left.markerCenter.y, size: 3, color: colors.line });
    page.drawCircle({ x: rightX - 8, y: right.markerCenter.y, size: 3, color: colors.line });
  });
}

export function drawBingo({ ctx, page, activity, box }: GameArgs) {
  const { fonts, type } = ctx;
  const items = gameItems(activity.items);
  const gap = 10;
  const width = (box.width - gap) / 2;
  const height = (box.height - gap) / 2;
  items.forEach((item, index) => {
    const x = box.x + (index % 2) * (width + gap);
    const y = box.y + box.height - (Math.floor(index / 2) + 1) * height - Math.floor(index / 2) * gap;
    const ink = stickerInks[index % 4];
    drawCard(page, { x, y, width, height }, { fill: stickerFills[index % 4] });
    // A big empty circle to stamp or tick once it is spotted.
    page.drawCircle({ x: x + width - 22, y: y + height - 22, size: 12, color: colors.white, borderColor: ink, borderWidth: 1.4 });
    const title = drawText(page, item.label, fonts, { x: x + 12, top: y + height - 12, width: width - 50 }, {
      size: type.heading, font: fonts.display, color: colors.ink, maxLines: 2,
    });
    drawText(page, item.clue, fonts, { x: x + 12, top: title.bottom - 4, width: width - 24 }, {
      size: type.small, color: colors.muted, maxLines: Math.max(1, Math.floor((title.bottom - 4 - y - 10) / (type.small * 1.35))),
    });
  });
}

export function drawChecklist({ ctx, page, activity, box }: GameArgs) {
  const { fonts, type } = ctx;
  const items = gameItems(activity.items);
  rows(box, items.length || 1, 8).forEach((row, index) => {
    const item = items[index];
    if (!item) return;
    drawCard(page, row, { fill: index % 2 ? colors.greenSoft : colors.white, border: colors.softLine });
    const inner = { ...row, x: row.x + 12, width: row.width - 24 };
    const measured = -drawBulletList(null, fonts, [{ title: item.label, text: item.clue }], {
      x: 0, top: 0, width: inner.width, size: type.body, marker: "check", maxLines: 3,
    }).bottom;
    drawBulletList(page, fonts, [{ title: item.label, text: item.clue }], {
      x: inner.x,
      top: row.y + row.height / 2 + measured / 2,
      width: inner.width,
      size: type.body,
      marker: "check",
      markerColor: colors.coral,
      maxLines: 3,
    });
  });
}

// Four short questions: the clue is the question, the label is the answer
// (shown only in the grown-up answer notes).
export function drawQuiz({ ctx, page, activity, box }: GameArgs) {
  const { fonts, type } = ctx;
  const items = gameItems(activity.items);
  rows(box, items.length || 1, 8).forEach((row, index) => {
    const item = items[index];
    if (!item) return;
    drawCard(page, row, { fill: colors.white, border: colors.softLine });
    const inner = { x: row.x + 12, width: row.width - 24 };
    const question = drawBulletList(page, fonts, [{ text: item.clue, marker: String(index + 1) }], {
      x: inner.x,
      top: row.y + row.height - 10,
      width: inner.width,
      size: type.body,
      marker: "number",
      markerColor: stickerInks[index % 4],
      maxLines: 3,
    });
    const textX = question.rows[0].textX;
    const answerY = Math.min(question.bottom - 14, row.y + 16);
    drawText(page, "Answer:", fonts, { x: textX, top: answerY + type.label * 1.1, width: 60 }, {
      size: type.label, font: fonts.bold, color: colors.muted,
    });
    drawDottedLine(page, textX + fonts.bold.widthOfTextAtSize("Answer:", type.label) + 6, inner.x + inner.width, answerY, colors.line, 3, 3);
  });
}

export function drawStory({ ctx, page, activity, box }: GameArgs) {
  const { fonts, type } = ctx;
  const items = gameItems(activity.items);
  const gap = 8;
  const sparkWidth = (box.width - gap) / 2;
  const sparkHeight = Math.min(78, (box.height * 0.45 - gap) / 2);
  const top = box.y + box.height;
  items.forEach((item, index) => {
    const x = box.x + (index % 2) * (sparkWidth + gap);
    const y = top - (Math.floor(index / 2) + 1) * sparkHeight - Math.floor(index / 2) * gap;
    drawCard(page, { x, y, width: sparkWidth, height: sparkHeight }, { fill: stickerFills[index % 4] });
    const title = drawText(page, item.label, fonts, { x: x + 10, top: y + sparkHeight - 8, width: sparkWidth - 20 }, {
      size: type.small, font: fonts.bold, color: stickerInks[index % 4], maxLines: 1,
    });
    const available = Math.max(1, Math.floor((title.bottom - y - 6) / (8.5 * 1.3)));
    drawText(page, item.clue, fonts, { x: x + 10, top: title.bottom, width: sparkWidth - 20 }, {
      size: 8.5, color: colors.ink, maxLines: available, lineHeight: 8.5 * 1.3,
    });
  });
  const sparkRows = Math.ceil(items.length / 2);
  const writeTop = top - sparkRows * (sparkHeight + gap) - 6;
  drawPill(page, fonts, "Write or draw your story", { x: box.x, top: writeTop, color: colors.green, fill: colors.greenSoft, size: type.label });
  const writeBox = { x: box.x, y: box.y, width: box.width, height: writeTop - type.label * 2 - 8 - box.y };
  drawRoundedRect(page, writeBox, 12, { color: colors.white, borderColor: colors.softLine, borderWidth: 1 });
  drawWriteLines(page, { x: writeBox.x + 12, y: writeBox.y + 6, width: writeBox.width - 24, height: writeBox.height - 6 }, type.body * 2);
}

// Until spot-the-difference has real paired art, the same subjects become a
// look-closely checklist rather than a placeholder drawing.
export function drawLookAndFind(args: GameArgs) {
  drawChecklist(args);
}
