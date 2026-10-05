import { LineCapStyle } from "pdf-lib";
import {
  createCrossword,
  createMaze,
  createWordSearch,
  mazeSizeForAge,
  normalizePuzzleWord,
} from "../../booklet/puzzles.ts";
import { drawRoundedRect } from "../illustrations.ts";
import { drawBulletList, drawPill, drawText, measureText, type BulletItem } from "../layout.ts";
import { drawRuledLine, drawRuledRows } from "../writing.ts";
import { colors } from "../theme.ts";
import type { GameArgs } from "./types.ts";

const bankFills = [colors.coralSoft, colors.tealSoft, colors.yellowSoft, colors.greenSoft];
const bankInks = [colors.coral, colors.teal, colors.yellow, colors.green];
// Crossword squares: big enough to write a capital letter in comfortably
// (~13mm) when the page allows, never below ~8mm.
const MAX_CROSSWORD_CELL = 37;
const MIN_CROSSWORD_CELL = 23;

export function wordSearchSizeForAge(age: number) {
  return age <= 8 ? 10 : age <= 11 ? 11 : 12;
}

export function drawWordSearch({ ctx, page, activity, box }: GameArgs) {
  const { fonts, type } = ctx;
  const age = ctx.booklet.age;
  const size = wordSearchSizeForAge(age);
  const items = activity.items ?? [];
  const puzzle = createWordSearch(items.map((item) => item.label), activity.title, size, age >= 9);
  // Words are normalized/deduped by createWordSearch, so look clues up by
  // the same normalized form rather than by position.
  const clueByWord = new Map(items.map((item) => [normalizePuzzleWord(item.label, size), item.clue]));

  // The word bank sits under the grid: words with their clues in two
  // columns when there is room, otherwise just the words as pills.
  const columnGap = 12;
  const columnWidth = (box.width - columnGap) / 2;
  const bankItems: BulletItem[] = puzzle.words.map((word) => ({ title: word, text: clueByWord.get(word) }));
  const columns = [bankItems.filter((_, index) => index % 2 === 0), bankItems.filter((_, index) => index % 2 === 1)];
  const listOptions = { size: type.small, marker: "check" as const, maxLines: 2, gap: 6 };
  const listHeight = Math.max(...columns.map((column) =>
    column.length ? box.height - drawBulletList(null, fonts, column, { ...listOptions, x: 0, top: box.height, width: columnWidth }).bottom : 0,
  ));
  const gridWithList = Math.min(box.width, box.height - listHeight - 14);
  const useList = age >= 7 && gridWithList >= Math.min(box.width, box.height) * 0.68;
  const pillHeight = type.small * 2;
  const pillRows = Math.ceil(puzzle.words.length / 3);
  const bankHeight = useList ? listHeight : pillRows * (pillHeight + 6);
  const gridSize = Math.min(box.width, box.height - bankHeight - 14);

  const cell = gridSize / puzzle.grid.length;
  const gridX = box.x + (box.width - gridSize) / 2;
  const gridTop = box.y + box.height;
  drawRoundedRect(page, { x: gridX - 4, y: gridTop - gridSize - 4, width: gridSize + 8, height: gridSize + 8 }, 12, {
    color: colors.white,
    borderColor: colors.line,
    borderWidth: 1.2,
  });
  const letterSize = Math.max(8, Math.min(14, cell * 0.56));
  puzzle.grid.forEach((row, rowIndex) => {
    row.forEach((letter, columnIndex) => {
      const x = gridX + columnIndex * cell;
      const y = gridTop - (rowIndex + 1) * cell;
      page.drawText(letter, {
        x: x + (cell - fonts.bold.widthOfTextAtSize(letter, letterSize)) / 2,
        y: y + (cell - letterSize * 0.7) / 2,
        size: letterSize,
        font: fonts.bold,
        color: colors.ink,
      });
    });
  });

  const bankTop = gridTop - gridSize - 14;
  if (useList) {
    columns.forEach((column, index) => {
      drawBulletList(page, fonts, column, {
        ...listOptions,
        x: box.x + index * (columnWidth + columnGap),
        top: bankTop,
        width: columnWidth,
        markerColor: bankInks[index],
      });
    });
    return bankTop - listHeight;
  }
  const pillWidth = (box.width - 12) / 3;
  puzzle.words.forEach((word, index) => {
    const column = index % 3;
    const row = Math.floor(index / 3);
    const x = box.x + column * (pillWidth + 6);
    const top = bankTop - row * (pillHeight + 6);
    drawRoundedRect(page, { x, y: top - pillHeight, width: pillWidth, height: pillHeight }, pillHeight / 2, { color: bankFills[index % 4] });
    drawText(page, word, fonts, { x, top: top - (pillHeight - type.small * 1.35) / 2, width: pillWidth }, {
      size: type.small, font: fonts.bold, color: colors.ink, align: "center", maxLines: 1,
    });
  });
  return bankTop - pillRows * (pillHeight + 6) + 6;
}

// The crossword is its own writing space: the grid is drawn as large as
// the page allows (squares up to ~13mm) and children write the letters
// straight into it. The clues sit underneath in Across and Down groups,
// side by side when that leaves bigger squares, each with its letter count.
export function drawCrossword(args: GameArgs) {
  const { ctx, page, activity, box } = args;
  const { fonts, type } = ctx;
  const items = activity.items ?? [];
  const puzzle = createCrossword(items.map((item) => item.label));
  // Lay out only the rows and columns that hold squares, so empty edges of
  // the generated grid don't shrink the squares or leave gaps.
  const used = puzzle.grid.flatMap((row, rowIndex) => row.flatMap((cellValue, columnIndex) => (cellValue ? [{ rowIndex, columnIndex }] : [])));
  const firstRow = used.length ? Math.min(...used.map((cell) => cell.rowIndex)) : 0;
  const firstColumn = used.length ? Math.min(...used.map((cell) => cell.columnIndex)) : 0;
  const rows = used.length ? Math.max(...used.map((cell) => cell.rowIndex)) - firstRow + 1 : 1;
  const columns = used.length ? Math.max(...used.map((cell) => cell.columnIndex)) - firstColumn + 1 : 1;

  const groups = (["across", "down"] as const)
    .map((direction) => ({
      title: direction === "across" ? "Across" : "Down",
      clues: puzzle.entries
        .filter((entry) => entry.direction === direction)
        .map((entry): BulletItem => {
          const clue = items[entry.answerIndex]?.clue.trim() || "Solve this local answer.";
          return { marker: String(entry.number), text: `${clue.charAt(0).toLocaleUpperCase()}${clue.slice(1)} (${entry.answer.length})` };
        }),
    }))
    .filter((group) => group.clues.length);
  const clueOptions = { size: type.small, marker: "number" as const, maxLines: 3, gap: 5, markerColor: colors.coral };
  const headingHeight = type.label * 2 + 6;
  const groupHeight = (clues: BulletItem[], width: number) =>
    headingHeight - drawBulletList(null, fonts, clues, { ...clueOptions, x: 0, top: 0, width }).bottom;
  const columnGap = 14;
  const columnWidth = (box.width - columnGap) / 2;
  const sideBySide = Math.max(...groups.map((group) => groupHeight(group.clues, columnWidth)));
  const stacked = groups.reduce((total, group) => total + groupHeight(group.clues, box.width), 0) + (groups.length - 1) * 8;
  const gridGap = 16;
  const cellFor = (cluesHeight: number) => Math.min(MAX_CROSSWORD_CELL, box.width / columns, (box.height - cluesHeight - gridGap) / rows);
  const useColumns = groups.length > 1 && cellFor(sideBySide) >= cellFor(stacked);
  const cell = Math.max(MIN_CROSSWORD_CELL, cellFor(useColumns ? sideBySide : stacked));

  const width = columns * cell;
  const height = rows * cell;
  const x0 = box.x + (box.width - width) / 2;
  const top = box.y + box.height;
  const numberSize = Math.max(8, Math.min(11, cell * 0.3));
  for (const { rowIndex, columnIndex } of used) {
    const cellValue = puzzle.grid[rowIndex][columnIndex]!;
    const x = x0 + (columnIndex - firstColumn) * cell;
    const y = top - (rowIndex - firstRow + 1) * cell;
    drawRoundedRect(page, { x: x + 1, y: y + 1, width: cell - 2, height: cell - 2 }, Math.min(5, cell * 0.14), {
      color: colors.white,
      borderColor: colors.teal,
      borderWidth: 1.2,
    });
    if (cellValue.number) {
      page.drawText(String(cellValue.number), { x: x + 3.5, y: y + cell - numberSize - 2, size: numberSize, font: fonts.bold, color: colors.coral });
    }
  }

  let bottom = top - height;
  const cluesTop = top - height - gridGap;
  groups.forEach((group, index) => {
    const x = useColumns ? box.x + index * (columnWidth + columnGap) : box.x;
    const width = useColumns ? columnWidth : box.width;
    const groupTop = useColumns || index === 0 ? cluesTop : bottom - 8;
    const pill = drawPill(page, fonts, group.title, { x, top: groupTop, color: colors.coral, fill: colors.coralSoft, size: type.label });
    const listBottom = drawBulletList(page, fonts, group.clues, { ...clueOptions, x, top: pill.y - 6, width }).bottom;
    bottom = useColumns ? Math.min(bottom, listBottom) : listBottom;
  });
  return bottom;
}

export function drawMaze({ ctx, page, activity, box }: GameArgs) {
  const { fonts, type } = ctx;
  const age = ctx.booklet.age;
  const maze = createMaze(`${activity.title}|${activity.items?.[0]?.label}|${age}`, mazeSizeForAge(age));
  const pillHeight = type.label * 2;
  const gridSize = Math.min(box.width, box.height - pillHeight * 2 - 12);
  const cell = gridSize / maze.length;
  const x0 = box.x + (box.width - gridSize) / 2;
  // Top-anchored: Start pill, the grid, then the Finish pill.
  const y0 = box.y + box.height - pillHeight - 6 - gridSize;
  const thickness = maze.length >= 16 ? 1.1 : 1.6;
  const wall = (x1: number, y1: number, x2: number, y2: number) =>
    page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness, color: colors.ink, lineCap: LineCapStyle.Round });
  maze.forEach((row, rowIndex) => {
    row.forEach((cellValue, columnIndex) => {
      const x = x0 + columnIndex * cell;
      const y = y0 + gridSize - (rowIndex + 1) * cell;
      const [topWall, right, bottom, left] = cellValue.walls;
      if (topWall) wall(x, y + cell, x + cell, y + cell);
      if (right) wall(x + cell, y, x + cell, y + cell);
      if (bottom) wall(x, y, x + cell, y);
      if (left) wall(x, y, x, y + cell);
    });
  });
  const dot = Math.max(3, cell * 0.24);
  page.drawCircle({ x: x0 + cell / 2, y: y0 + gridSize - cell / 2, size: dot, color: colors.green });
  page.drawCircle({ x: x0 + gridSize - cell / 2, y: y0 + cell / 2, size: dot, color: colors.coral });
  drawPill(page, fonts, "Start", { x: x0, top: y0 + gridSize + pillHeight + 6, color: colors.green, fill: colors.greenSoft, size: type.label });
  return drawPill(page, fonts, "Finish", { x: x0 + gridSize, top: y0 - 6, color: colors.coral, fill: colors.coralSoft, size: type.label, align: "right" }).y;
}

const codeSymbols = ["@", "#", "$", "%", "&", "+", "=", "?"];

export function codebreakerPhrase(label: string | undefined) {
  return normalizePuzzleWord(label || "TRIP", 12) || "TRIP";
}

// The coded word as symbol tiles, each with a one-letter writing space
// under it, a starter key, the clue, and a full writing row for the
// decoded word: the game is its own writing space.
export function drawCodebreaker({ ctx, page, activity, box }: GameArgs) {
  const { fonts, type } = ctx;
  const pitch = type.writeLine;
  const items = activity.items ?? [];
  const phrase = codebreakerPhrase(items[0]?.label);
  const letters = Array.from(new Set(phrase));
  const code = phrase.split("").map((letter) => codeSymbols[letters.indexOf(letter) % codeSymbols.length]);
  const tile = Math.min(34, (box.width - (code.length - 1) * 5) / code.length);
  const rowWidth = code.length * tile + (code.length - 1) * 5;
  const startX = box.x + (box.width - rowWidth) / 2;
  const clue = `Clue: ${items[0]?.clue || "Crack the local word."}`;
  const clueHeight = measureText(clue, fonts, box.width, { size: type.body, maxLines: 3 }).height;
  const pillHeight = type.label * 2;
  const keyHeight = 30;
  const contentHeight = tile + pitch + 18 + pillHeight + 8 + keyHeight + 16 + clueHeight + 16 + pillHeight + 4 + pitch;
  let top = box.y + box.height - Math.max(0, (box.height - contentHeight) / 2.5);

  const symbolSize = Math.min(18, tile * 0.55);
  code.forEach((symbol, index) => {
    const x = startX + index * (tile + 5);
    drawRoundedRect(page, { x, y: top - tile, width: tile, height: tile }, 7, { color: colors.yellowSoft, borderColor: colors.yellow, borderWidth: 1 });
    page.drawText(symbol, {
      x: x + (tile - fonts.monoBold.widthOfTextAtSize(symbol, symbolSize)) / 2,
      y: top - tile / 2 - symbolSize * 0.32,
      size: symbolSize,
      font: fonts.monoBold,
      color: colors.ink,
    });
    // One handwritten letter per tile: a full writing pitch of room.
    drawRuledLine(page, x + 3, x + tile - 3, top - tile - pitch);
  });
  top -= tile + pitch + 18;

  const key = letters.slice(0, 4);
  drawPill(page, fonts, "Starter key", { x: box.x, top, color: colors.teal, fill: colors.tealSoft, size: type.label });
  const keyWidth = (box.width - 3 * 8) / 4;
  const keyY = top - pillHeight - 8 - keyHeight;
  key.forEach((letter, index) => {
    const x = box.x + index * (keyWidth + 8);
    drawRoundedRect(page, { x, y: keyY, width: keyWidth, height: keyHeight }, 10, { color: colors.white, borderColor: colors.teal, borderWidth: 1 });
    const text = `${codeSymbols[index]} = ${letter}`;
    page.drawText(text, {
      x: x + (keyWidth - fonts.monoBold.widthOfTextAtSize(text, 13)) / 2,
      y: keyY + 10,
      size: 13,
      font: fonts.monoBold,
      color: colors.teal,
    });
  });
  top = keyY - 16;

  top = drawText(page, clue, fonts, { x: box.x, top, width: box.width }, { size: type.body, color: colors.ink, maxLines: 3 }).bottom - 16;
  top = Math.max(box.y + pillHeight + 4 + pitch, top);
  const pill = drawPill(page, fonts, "Decoded word", { x: box.x, top, color: colors.green, fill: colors.greenSoft, size: type.label });
  return drawRuledRows(page, { x: box.x, y: pill.y - 4 - pitch, width: box.width, height: pitch }, pitch) ? pill.y - 4 - pitch : pill.y;
}
