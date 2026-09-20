import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
  type RGB,
} from "pdf-lib";
import type { Activity, GameItem } from "./booklet.ts";
import {
  coloringSceneFor,
  coloringSceneLabels,
  type ColoringScene,
} from "./coloring.ts";
import { getAgeBand } from "./booklet.ts";
import {
  type GeneratedBookletData,
  validateBookletDraft,
} from "./booklet-ai.ts";
import {
  createCrossword,
  createMaze,
  createRoutePuzzle,
  createWordSearch,
  mazeSizeForAge,
  normalizePuzzleWord,
} from "./puzzles.ts";
import {
  familyChildDisplayName,
  mechanicLabel,
  type FamilyChild,
  type ItineraryEvent,
  type QuestMechanic,
} from "./family.ts";

const A4: [number, number] = [595.28, 841.89];
const PAGE_WIDTH = A4[0];
const PAGE_HEIGHT = A4[1];
const MARGIN = 44;

const colors = {
  paper: rgb(0.985, 0.975, 0.945),
  white: rgb(1, 1, 1),
  ink: rgb(0.075, 0.205, 0.195),
  muted: rgb(0.34, 0.42, 0.4),
  line: rgb(0.79, 0.77, 0.69),
  softLine: rgb(0.9, 0.88, 0.81),
  coral: rgb(0.91, 0.34, 0.25),
  coralSoft: rgb(0.985, 0.89, 0.85),
  green: rgb(0.47, 0.67, 0.25),
  greenSoft: rgb(0.91, 0.95, 0.86),
  yellow: rgb(0.97, 0.76, 0.29),
  yellowSoft: rgb(1, 0.96, 0.78),
  blue: rgb(0.16, 0.55, 0.59),
  blueSoft: rgb(0.88, 0.95, 0.95),
  charcoal: rgb(0.12, 0.16, 0.16),
};

type Fonts = {
  regular: PDFFont;
  bold: PDFFont;
  mono: PDFFont;
  monoBold: PDFFont;
};

type Box = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type DrawTextOptions = {
  color?: RGB;
  font?: PDFFont;
  lineHeight?: number;
  maxLines?: number;
  maxWidth: number;
  size: number;
  x: number;
  y: number;
};

export type FamilyPackContext = {
  children: FamilyChild[];
  events: ItineraryEvent[];
  mechanicsByDay: Array<{ day: number; mechanics: QuestMechanic[] }>;
};

function pdfText(value: string) {
  const normalized = value
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u00b7/g, " / ")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return normalized || "Local destination";
}

function splitLongWord(word: string, font: PDFFont, size: number, maxWidth: number) {
  const parts: string[] = [];
  let part = "";
  for (const character of word) {
    const candidate = part + character;
    if (part && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      parts.push(part);
      part = character;
    } else {
      part = candidate;
    }
  }
  if (part) parts.push(part);
  return parts;
}

function wrapText(
  value: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
  maxLines = Number.POSITIVE_INFINITY,
) {
  const safe = pdfText(value);
  const words = safe.split(" ").flatMap((word) =>
    font.widthOfTextAtSize(word, size) > maxWidth
      ? splitLongWord(word, font, size, maxWidth)
      : [word],
  );
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);

  if (lines.length <= maxLines) return lines;
  const result = lines.slice(0, maxLines);
  let last = `${result[maxLines - 1]}...`;
  while (last.length > 3 && font.widthOfTextAtSize(last, size) > maxWidth) {
    last = `${last.slice(0, -4).trimEnd()}...`;
  }
  result[maxLines - 1] = last;
  return result;
}

function drawWrappedText(
  page: PDFPage,
  value: string,
  fonts: Fonts,
  options: DrawTextOptions,
) {
  const font = options.font ?? fonts.regular;
  const lineHeight = options.lineHeight ?? options.size * 1.3;
  const lines = wrapText(
    value,
    font,
    options.size,
    options.maxWidth,
    options.maxLines,
  );
  lines.forEach((line, index) => {
    page.drawText(line, {
      x: options.x,
      y: options.y - index * lineHeight,
      size: options.size,
      font,
      color: options.color ?? colors.ink,
    });
  });
  return options.y - lines.length * lineHeight;
}

function fitTextSize(
  value: string,
  font: PDFFont,
  maxWidth: number,
  preferred: number,
  minimum: number,
) {
  const safe = pdfText(value);
  let size = preferred;
  while (size > minimum && font.widthOfTextAtSize(safe, size) > maxWidth) size -= 1;
  return size;
}

function fitWrappedTextSize(
  value: string,
  font: PDFFont,
  maxWidth: number,
  preferred: number,
  minimum: number,
  maxLines: number,
) {
  let size = preferred;
  while (size > minimum && wrapText(value, font, size, maxWidth, maxLines).length > maxLines) size -= 1;
  return size;
}

function centeredX(value: string, font: PDFFont, size: number, box: Box) {
  return box.x + Math.max(0, (box.width - font.widthOfTextAtSize(pdfText(value), size)) / 2);
}

function drawDottedLine(
  page: PDFPage,
  startX: number,
  endX: number,
  y: number,
  color = colors.line,
  dot = 3,
  gap = 4,
) {
  for (let x = startX; x < endX; x += dot + gap) {
    page.drawLine({
      start: { x, y },
      end: { x: Math.min(x + dot, endX), y },
      thickness: 1,
      color,
    });
  }
}

function drawPageBase(
  document: PDFDocument,
  fonts: Fonts,
  section: string,
  pageNumber: number,
  totalPages: number,
  accent: RGB,
) {
  const page = document.addPage(A4);
  page.drawRectangle({
    x: 0,
    y: 0,
    width: PAGE_WIDTH,
    height: PAGE_HEIGHT,
    color: colors.paper,
  });
  page.drawRectangle({
    x: 0,
    y: PAGE_HEIGHT - 16,
    width: PAGE_WIDTH,
    height: 16,
    color: accent,
  });
  page.drawLine({
    start: { x: MARGIN, y: 38 },
    end: { x: PAGE_WIDTH - MARGIN, y: 38 },
    thickness: 0.8,
    color: colors.softLine,
  });
  page.drawText("TRIPQUEST", {
    x: MARGIN,
    y: 22,
    size: 8,
    font: fonts.bold,
    color: colors.muted,
  });
  const footer = `${pdfText(section)}  /  ${pageNumber} of ${totalPages}`;
  page.drawText(footer, {
    x: PAGE_WIDTH - MARGIN - fonts.regular.widthOfTextAtSize(footer, 8),
    y: 22,
    size: 8,
    font: fonts.regular,
    color: colors.muted,
  });
  return page;
}

function drawPill(
  page: PDFPage,
  text: string,
  fonts: Fonts,
  x: number,
  y: number,
  fill: RGB,
  ink = colors.ink,
) {
  const safe = pdfText(text).toUpperCase();
  const width = Math.min(260, fonts.bold.widthOfTextAtSize(safe, 8) + 22);
  const textSize = fitTextSize(safe, fonts.bold, width - 22, 8, 6);
  page.drawRectangle({ x, y, width, height: 22, color: fill });
  page.drawText(safe, { x: x + 11, y: y + (22 - textSize) / 2 - 1, size: textSize, font: fonts.bold, color: ink });
  return width;
}

function drawCover(
  document: PDFDocument,
  fonts: Fonts,
  booklet: GeneratedBookletData,
  totalPages: number,
  familyPack?: FamilyPackContext,
) {
  const page = drawPageBase(document, fonts, "Cover", 1, totalPages, colors.coral);
  page.drawRectangle({
    x: MARGIN,
    y: 706,
    width: 168,
    height: 30,
    color: colors.ink,
  });
  page.drawText("TRIPQUEST EXPLORER BOOK", {
    x: MARGIN + 12,
    y: 716,
    size: 9,
    font: fonts.bold,
    color: colors.white,
  });

  page.drawText("A trip made for curious hands", {
    x: MARGIN,
    y: 665,
    size: 13,
    font: fonts.regular,
    color: colors.coral,
  });
  const destination = pdfText(booklet.destination);
  const destinationSize = fitTextSize(
    destination,
    fonts.bold,
    PAGE_WIDTH - MARGIN * 2,
    38,
    27,
  );
  drawWrappedText(page, destination, fonts, {
    x: MARGIN,
    y: 615,
    size: destinationSize,
    font: fonts.bold,
    color: colors.ink,
    maxWidth: PAGE_WIDTH - MARGIN * 2,
    maxLines: 2,
    lineHeight: destinationSize * 1.04,
  });
  drawWrappedText(page, booklet.profile.style, fonts, {
    x: MARGIN,
    y: 520,
    size: 18,
    font: fonts.bold,
    color: colors.blue,
    maxWidth: 390,
    maxLines: 2,
    lineHeight: 22,
  });

  drawPill(page, `AGE ${booklet.age}`, fonts, MARGIN, 446, colors.yellowSoft);
  drawPill(
    page,
    `${booklet.days} ADVENTURE ${booklet.days === 1 ? "DAY" : "DAYS"}`,
    fonts,
    MARGIN + 86,
    446,
    colors.greenSoft,
  );
  if (familyPack?.children.length) {
    page.drawText("FAMILY EXPLORERS", {
      x: MARGIN,
      y: 414,
      size: 8,
      font: fonts.bold,
      color: colors.blue,
    });
    drawWrappedText(page, familyPack.children.map((child, index) => `${pdfText(familyChildDisplayName(child, index))} (age ${child.age})`).join(" / "), fonts, {
      x: MARGIN,
      y: 395,
      size: 9,
      font: fonts.bold,
      maxWidth: 245,
      maxLines: 2,
      lineHeight: 12,
      color: colors.ink,
    });
  }

  page.drawRectangle({
    x: 318,
    y: 270,
    width: 220,
    height: 205,
    color: colors.blueSoft,
  });
  page.drawCircle({ x: 487, y: 423, size: 31, color: colors.yellow });
  page.drawRectangle({
    x: 350,
    y: 301,
    width: 46,
    height: 91,
    borderColor: colors.ink,
    borderWidth: 2,
  });
  page.drawLine({
    start: { x: 346, y: 392 },
    end: { x: 373, y: 426 },
    color: colors.ink,
    thickness: 2,
  });
  page.drawLine({
    start: { x: 400, y: 392 },
    end: { x: 373, y: 426 },
    color: colors.ink,
    thickness: 2,
  });
  page.drawRectangle({
    x: 426,
    y: 301,
    width: 72,
    height: 57,
    borderColor: colors.ink,
    borderWidth: 2,
  });
  for (let index = 0; index < 4; index += 1) {
    page.drawCircle({
      x: 354 + index * 39,
      y: 284 + (index % 2) * 9,
      size: 4,
      color: index % 2 ? colors.coral : colors.green,
    });
  }
  drawDottedLine(page, 360, 500, 280, colors.ink, 3, 8);

  page.drawText("THIS BOOK BELONGS TO", {
    x: MARGIN,
    y: 345,
    size: 9,
    font: fonts.bold,
    color: colors.muted,
  });
  drawDottedLine(page, MARGIN, 280, 316, colors.line, 5, 4);
  page.drawText("TRIP DATES", {
    x: MARGIN,
    y: 267,
    size: 9,
    font: fonts.bold,
    color: colors.muted,
  });
  drawDottedLine(page, MARGIN, 280, 238, colors.line, 5, 4);

  page.drawRectangle({
    x: MARGIN,
    y: 84,
    width: PAGE_WIDTH - MARGIN * 2,
    height: 90,
    color: colors.coralSoft,
  });
  page.drawText("PACK A PENCIL. NOTICE EVERYTHING.", {
    x: MARGIN + 18,
    y: 140,
    size: 11,
    font: fonts.bold,
    color: colors.coral,
  });
  drawWrappedText(page, "Games, drawing spaces, local clues, and family missions made for this exact trip.", fonts, {
    x: MARGIN + 18,
    y: 116,
    size: 10,
    maxWidth: PAGE_WIDTH - MARGIN * 2 - 36,
    maxLines: 2,
    color: colors.ink,
  });
}

function drawGuide(
  document: PDFDocument,
  fonts: Fonts,
  booklet: GeneratedBookletData,
  totalPages: number,
  familyPack?: FamilyPackContext,
) {
  const page = drawPageBase(document, fonts, "Grown-up guide", 2, totalPages, colors.green);
  page.drawText("GROWN-UP GUIDE", {
    x: MARGIN,
    y: 775,
    size: 10,
    font: fonts.bold,
    color: colors.green,
  });
  page.drawText(`A thoughtful pace for age ${booklet.age}`, {
    x: MARGIN,
    y: 735,
    size: 27,
    font: fonts.bold,
    color: colors.ink,
  });
  drawWrappedText(page, booklet.profile.intro, fonts, {
    x: MARGIN,
    y: 696,
    size: 11,
    lineHeight: 15,
    maxWidth: PAGE_WIDTH - MARGIN * 2,
    maxLines: 4,
    color: colors.muted,
  });

  const cardWidth = (PAGE_WIDTH - MARGIN * 2 - 14) / 2;
  const cards = [
    {
      title: "LOCAL WORD",
      body: booklet.profile.word,
      fill: colors.yellowSoft,
      accent: colors.coral,
    },
    {
      title: "LOCAL CARE CLUE",
      body: booklet.profile.etiquette,
      fill: colors.greenSoft,
      accent: colors.green,
    },
  ];
  cards.forEach((card, index) => {
    const x = MARGIN + index * (cardWidth + 14);
    page.drawRectangle({ x, y: 535, width: cardWidth, height: 118, color: card.fill });
    page.drawText(card.title, {
      x: x + 15,
      y: 625,
      size: 8,
      font: fonts.bold,
      color: card.accent,
    });
    drawWrappedText(page, card.body, fonts, {
      x: x + 15,
      y: 602,
      size: 10,
      lineHeight: 13,
      maxWidth: cardWidth - 30,
      maxLines: 5,
    });
  });

  page.drawText("YOUR ADVENTURE AT A GLANCE", {
    x: MARGIN,
    y: 497,
    size: 9,
    font: fonts.bold,
    color: colors.blue,
  });
  const rowsPerColumn = Math.ceil(booklet.dayPlans.length / 2);
  const overviewTop = 463;
  const rowHeight = Math.min(43, 300 / Math.max(1, rowsPerColumn));
  booklet.dayPlans.forEach((day, index) => {
    const column = Math.floor(index / rowsPerColumn);
    const row = index % rowsPerColumn;
    const x = MARGIN + column * (cardWidth + 14);
    const y = overviewTop - row * rowHeight;
    page.drawCircle({ x: x + 13, y: y + 3, size: 11, color: index % 2 ? colors.blue : colors.coral });
    const number = String(day.day);
    page.drawText(number, {
      x: x + 13 - fonts.bold.widthOfTextAtSize(number, 8) / 2,
      y,
      size: 8,
      font: fonts.bold,
      color: colors.white,
    });
    drawWrappedText(page, day.theme, fonts, {
      x: x + 32,
      y: y + 7,
      size: 9,
      font: fonts.bold,
      lineHeight: 11,
      maxWidth: cardWidth - 35,
      maxLines: 2,
    });
  });

  page.drawRectangle({
    x: MARGIN,
    y: 74,
    width: PAGE_WIDTH - MARGIN * 2,
    height: 73,
    borderColor: colors.softLine,
    borderWidth: 1,
    color: colors.white,
  });
  page.drawText(familyPack?.children.length ? "FAMILY EXPLORERS" : "PACK", { x: MARGIN + 15, y: 122, size: 8, font: fonts.bold, color: colors.coral });
  drawWrappedText(
    page,
    familyPack?.children.length
      ? `${familyPack.children.map((child, index) => `${pdfText(familyChildDisplayName(child, index))} (age ${child.age})`).join(" / ")} / same place, different ways to play`
      : `Pencil / colored pencils / a grown-up / ${getAgeBand(booklet.age).minutes}-minute pockets of curious time`,
    fonts,
    {
      x: MARGIN + 15,
      y: 101,
      size: 9,
      maxWidth: PAGE_WIDTH - MARGIN * 2 - 30,
      maxLines: 2,
      color: colors.muted,
    },
  );
}

function drawGameFrame(page: PDFPage, fonts: Fonts, label: string, box: Box) {
  page.drawRectangle({
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    color: colors.white,
    borderColor: colors.softLine,
    borderWidth: 1,
  });
  page.drawRectangle({
    x: box.x,
    y: box.y + box.height - 34,
    width: box.width,
    height: 34,
    color: colors.blueSoft,
  });
  page.drawText(pdfText(label).toUpperCase(), {
    x: box.x + 15,
    y: box.y + box.height - 22,
    size: 8,
    font: fonts.bold,
    color: colors.blue,
  });
  return {
    x: box.x + 17,
    y: box.y + 17,
    width: box.width - 34,
    height: box.height - 67,
  };
}

function drawColoringScene(page: PDFPage, scene: Box, variant: ColoringScene) {
  const { x, y, width, height } = scene;
  const ground = y + 24;
  const drawCloud = (cloudX: number, cloudY: number) => {
    page.drawCircle({ x: cloudX, y: cloudY, size: 13, borderColor: colors.line, borderWidth: 1.2 });
    page.drawCircle({ x: cloudX + 18, y: cloudY + 5, size: 17, borderColor: colors.line, borderWidth: 1.2 });
    page.drawCircle({ x: cloudX + 38, y: cloudY, size: 12, borderColor: colors.line, borderWidth: 1.2 });
    page.drawLine({ start: { x: cloudX - 8, y: cloudY - 9 }, end: { x: cloudX + 46, y: cloudY - 9 }, color: colors.line, thickness: 1.2 });
  };
  const drawTree = (treeX: number, treeY: number, scale = 1) => {
    page.drawLine({ start: { x: treeX, y: treeY }, end: { x: treeX, y: treeY + 50 * scale }, color: colors.ink, thickness: 2 });
    page.drawCircle({ x: treeX - 16 * scale, y: treeY + 56 * scale, size: 21 * scale, borderColor: colors.green, borderWidth: 1.5 });
    page.drawCircle({ x: treeX + 13 * scale, y: treeY + 64 * scale, size: 24 * scale, borderColor: colors.green, borderWidth: 1.5 });
    page.drawCircle({ x: treeX + 32 * scale, y: treeY + 52 * scale, size: 18 * scale, borderColor: colors.green, borderWidth: 1.5 });
  };
  const drawWindows = (buildingX: number, buildingY: number, columns: number, rows: number, gap = 22) => {
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        page.drawRectangle({ x: buildingX + column * gap, y: buildingY + row * gap, width: 11, height: 13, borderColor: colors.blue, borderWidth: 1 });
      }
    }
  };
  const drawBird = (birdX: number, birdY: number, scale = 1) => {
    page.drawLine({ start: { x: birdX, y: birdY }, end: { x: birdX + 8 * scale, y: birdY + 5 * scale }, color: colors.ink, thickness: 1.2 });
    page.drawLine({ start: { x: birdX + 8 * scale, y: birdY + 5 * scale }, end: { x: birdX + 16 * scale, y: birdY }, color: colors.ink, thickness: 1.2 });
  };
  const drawWaves = (waveY: number, count = 4) => {
    for (let index = 0; index < count; index += 1) {
      const waveX = x + 26 + index * ((width - 52) / count);
      page.drawLine({ start: { x: waveX, y: waveY }, end: { x: waveX + 24, y: waveY + 4 }, color: colors.blue, thickness: 1 });
      page.drawLine({ start: { x: waveX + 24, y: waveY + 4 }, end: { x: waveX + 48, y: waveY }, color: colors.blue, thickness: 1 });
    }
  };
  const drawLantern = (lanternX: number, lanternY: number) => {
    page.drawLine({ start: { x: lanternX, y: lanternY + 18 }, end: { x: lanternX, y: lanternY + 28 }, color: colors.ink, thickness: 1 });
    page.drawRectangle({ x: lanternX - 8, y: lanternY, width: 16, height: 18, borderColor: colors.coral, borderWidth: 1.2 });
    page.drawLine({ start: { x: lanternX - 5, y: lanternY + 5 }, end: { x: lanternX + 5, y: lanternY + 5 }, color: colors.coral, thickness: 1 });
  };
  const drawSupertree = (treeX: number, baseY: number, scale = 1) => {
    const crownY = baseY + 92 * scale;
    page.drawLine({ start: { x: treeX - 7 * scale, y: baseY }, end: { x: treeX - 2 * scale, y: crownY - 23 * scale }, color: colors.ink, thickness: 1.8 });
    page.drawLine({ start: { x: treeX + 7 * scale, y: baseY }, end: { x: treeX + 2 * scale, y: crownY - 23 * scale }, color: colors.ink, thickness: 1.8 });
    page.drawEllipse({ x: treeX, y: crownY, xScale: 38 * scale, yScale: 25 * scale, borderColor: colors.ink, borderWidth: 1.6 });
    page.drawEllipse({ x: treeX, y: crownY, xScale: 26 * scale, yScale: 16 * scale, borderColor: colors.green, borderWidth: 1.2 });
    [-26, -15, 0, 15, 26].forEach((offset) => {
      page.drawLine({
        start: { x: treeX, y: crownY - 18 * scale },
        end: { x: treeX + offset * scale, y: crownY + (18 - Math.abs(offset) * 0.16) * scale },
        color: offset % 2 ? colors.coral : colors.green,
        thickness: 1,
      });
    });
    [0.25, 0.48, 0.7].forEach((portion, index) => {
      page.drawLine({
        start: { x: treeX - (5 - portion * 3) * scale, y: baseY + 68 * portion * scale },
        end: { x: treeX + (5 - portion * 3) * scale, y: baseY + 68 * portion * scale + 5 },
        color: index % 2 ? colors.coral : colors.green,
        thickness: 1.1,
      });
    });
  };
  switch (variant) {
    case "skyline":
      page.drawCircle({ x: x + width - 42, y: y + height - 36, size: 20, borderColor: colors.yellow, borderWidth: 2 });
      drawCloud(x + 34, y + height - 46);
      [0, 1, 2].forEach((index) => {
        const buildingX = x + 32 + index * 82;
        const buildingHeight = 56 + index * 18;
        page.drawRectangle({ x: buildingX, y: ground, width: 56, height: buildingHeight, borderColor: colors.ink, borderWidth: 1.8 });
        page.drawLine({ start: { x: buildingX + 14, y: ground + buildingHeight }, end: { x: buildingX + 28, y: ground + buildingHeight + 20 }, color: colors.ink, thickness: 1.6 });
        page.drawLine({ start: { x: buildingX + 42, y: ground + buildingHeight }, end: { x: buildingX + 28, y: ground + buildingHeight + 20 }, color: colors.ink, thickness: 1.6 });
        drawWindows(buildingX + 12, ground + 14, 3, Math.max(1, Math.floor(buildingHeight / 34)));
      });
      page.drawLine({ start: { x: x + 24, y: ground }, end: { x: x + width - 24, y: ground }, color: colors.ink, thickness: 1.8 });
      drawTree(x + width - 78, ground, 0.8);
      drawBird(x + 55, y + height - 62);
      drawBird(x + 92, y + height - 76, 0.8);
      break;
    case "supertree":
      page.drawLine({ start: { x: x + 22, y: ground }, end: { x: x + width - 22, y: ground }, color: colors.ink, thickness: 1.5 });
      drawSupertree(x + width * 0.5, ground, 1.15);
      drawSupertree(x + width * 0.23, ground, 0.78);
      drawSupertree(x + width * 0.78, ground, 0.84);
      page.drawLine({ start: { x: x + width * 0.29, y: ground + 77 }, end: { x: x + width * 0.43, y: ground + 91 }, color: colors.blue, thickness: 2 });
      page.drawLine({ start: { x: x + width * 0.57, y: ground + 93 }, end: { x: x + width * 0.72, y: ground + 83 }, color: colors.blue, thickness: 2 });
      page.drawLine({ start: { x: x + width * 0.29, y: ground + 72 }, end: { x: x + width * 0.43, y: ground + 86 }, color: colors.blue, thickness: 0.8 });
      page.drawLine({ start: { x: x + width * 0.57, y: ground + 88 }, end: { x: x + width * 0.72, y: ground + 78 }, color: colors.blue, thickness: 0.8 });
      [0.14, 0.34, 0.66, 0.88].forEach((portion) => page.drawCircle({ x: x + width * portion, y: ground + 5, size: 5, borderColor: colors.green, borderWidth: 1 }));
      page.drawCircle({ x: x + width - 38, y: y + height - 28, size: 13, borderColor: colors.yellow, borderWidth: 1.6 });
      drawBird(x + 35, y + height - 34, 0.8);
      break;
    case "garden":
      page.drawLine({ start: { x: x + 34, y: ground }, end: { x: x + width - 34, y: ground }, color: colors.ink, thickness: 1.5 });
      drawTree(x + 45, ground, 0.8);
      drawCloud(x + width - 150, y + height - 40);
      [0, 1, 2].forEach((index) => {
        const flowerX = x + 72 + index * 92;
        const flowerY = ground + 52 + (index % 2) * 20;
        page.drawLine({ start: { x: flowerX, y: ground }, end: { x: flowerX, y: flowerY }, color: colors.ink, thickness: 1.5 });
        page.drawCircle({ x: flowerX - 7, y: flowerY, size: 8, borderColor: colors.coral, borderWidth: 1.5 });
        page.drawCircle({ x: flowerX + 7, y: flowerY, size: 8, borderColor: colors.coral, borderWidth: 1.5 });
        page.drawCircle({ x: flowerX, y: flowerY + 7, size: 8, borderColor: colors.yellow, borderWidth: 1.5 });
        page.drawCircle({ x: flowerX, y: flowerY, size: 3, borderColor: colors.ink, borderWidth: 1 });
      });
      page.drawLine({ start: { x: x + 58, y: ground }, end: { x: x + width / 2, y: y + height - 28 }, color: colors.ink, thickness: 1.2 });
      page.drawLine({ start: { x: x + width - 58, y: ground }, end: { x: x + width / 2, y: y + height - 28 }, color: colors.ink, thickness: 1.2 });
      page.drawCircle({ x: x + width - 56, y: ground + 74, size: 5, borderColor: colors.coral, borderWidth: 1.2 });
      page.drawCircle({ x: x + width - 43, y: ground + 80, size: 5, borderColor: colors.coral, borderWidth: 1.2 });
      drawBird(x + 210, y + height - 52, 0.8);
      break;
    case "bridge":
      page.drawLine({ start: { x: x + 26, y: ground + 42 }, end: { x: x + width - 26, y: ground + 42 }, color: colors.ink, thickness: 2 });
      page.drawLine({ start: { x: x + 26, y: ground + 30 }, end: { x: x + width - 26, y: ground + 30 }, color: colors.ink, thickness: 1.5 });
      [0, 1, 2, 3].forEach((index) => {
        const bridgeX = x + 60 + index * 88;
        page.drawLine({ start: { x: bridgeX, y: ground + 30 }, end: { x: bridgeX + 20, y: ground }, color: colors.ink, thickness: 1.4 });
        page.drawLine({ start: { x: bridgeX + 20, y: ground }, end: { x: bridgeX + 40, y: ground + 30 }, color: colors.ink, thickness: 1.4 });
      });
      [0, 1, 2].forEach((index) => page.drawLine({ start: { x: x + 35, y: y + 22 + index * 10 }, end: { x: x + width - 35, y: y + 22 + index * 10 }, color: colors.blue, thickness: 1 }));
      page.drawLine({ start: { x: x + 30, y: ground + 104 }, end: { x: x + 115, y: ground + 140 }, color: colors.green, thickness: 1.6 });
      page.drawLine({ start: { x: x + width - 30, y: ground + 104 }, end: { x: x + width - 115, y: ground + 140 }, color: colors.green, thickness: 1.6 });
      drawCloud(x + 54, y + height - 46);
      drawWaves(ground + 8, 4);
      drawBird(x + 222, y + height - 63);
      break;
    case "train": {
      const trainX = x + 58;
      const trainY = ground + 22;
      page.drawRectangle({ x: trainX, y: trainY, width: width - 116, height: 82, borderColor: colors.ink, borderWidth: 1.8 });
      page.drawLine({ start: { x: trainX, y: trainY + 82 }, end: { x: trainX + 28, y: trainY + 105 }, color: colors.ink, thickness: 1.8 });
      page.drawLine({ start: { x: trainX + width - 116, y: trainY + 82 }, end: { x: trainX + width - 144, y: trainY + 105 }, color: colors.ink, thickness: 1.8 });
      page.drawLine({ start: { x: trainX + 28, y: trainY + 105 }, end: { x: trainX + width - 144, y: trainY + 105 }, color: colors.coral, thickness: 2 });
      [0, 1, 2, 3].forEach((index) => page.drawRectangle({ x: trainX + 24 + index * ((width - 190) / 3), y: trainY + 43, width: 42, height: 24, borderColor: colors.blue, borderWidth: 1.2 }));
      page.drawCircle({ x: trainX + 70, y: trainY, size: 14, color: colors.white, borderColor: colors.ink, borderWidth: 1.5 });
      page.drawCircle({ x: trainX + width - 184, y: trainY, size: 14, color: colors.white, borderColor: colors.ink, borderWidth: 1.5 });
      page.drawLine({ start: { x: x + 28, y: ground + 3 }, end: { x: x + width - 28, y: ground + 3 }, color: colors.ink, thickness: 1.4 });
      page.drawLine({ start: { x: x + 28, y: ground - 6 }, end: { x: x + width - 28, y: ground - 6 }, color: colors.ink, thickness: 1.4 });
      break;
    }
    case "market":
      page.drawRectangle({ x: x + 72, y: ground, width: 210, height: 94, borderColor: colors.ink, borderWidth: 1.8 });
      page.drawLine({ start: { x: x + 58, y: ground + 94 }, end: { x: x + 296, y: ground + 94 }, color: colors.coral, thickness: 3 });
      [0, 1, 2, 3].forEach((index) => page.drawLine({ start: { x: x + 70 + index * 57, y: ground + 94 }, end: { x: x + 84 + index * 57, y: ground + 72 }, color: colors.coral, thickness: 1.6 }));
      page.drawCircle({ x: x + 130, y: ground + 38, size: 18, borderColor: colors.green, borderWidth: 1.7 });
      page.drawCircle({ x: x + 220, y: ground + 44, size: 23, borderColor: colors.yellow, borderWidth: 1.7 });
      page.drawLine({ start: { x: x + 95, y: ground + 18 }, end: { x: x + 260, y: ground + 18 }, color: colors.ink, thickness: 1.2 });
      drawWindows(x + 92, ground + 60, 6, 1, 25);
      [0, 1, 2, 3].forEach((index) => page.drawCircle({ x: x + 112 + index * 33, y: ground + 27, size: 7, borderColor: index % 2 ? colors.coral : colors.green, borderWidth: 1.2 }));
      page.drawLine({ start: { x: x + 48, y: ground }, end: { x: x + 62, y: ground + 56 }, color: colors.ink, thickness: 1.4 });
      page.drawLine({ start: { x: x + width - 48, y: ground }, end: { x: x + width - 62, y: ground + 56 }, color: colors.ink, thickness: 1.4 });
      drawLantern(x + 96, ground + 122);
      drawLantern(x + 252, ground + 122);
      break;
    case "mountain":
      page.drawLine({ start: { x: x + 24, y: ground }, end: { x: x + 120, y: y + height - 24 }, color: colors.ink, thickness: 1.8 });
      page.drawLine({ start: { x: x + 120, y: y + height - 24 }, end: { x: x + 214, y: ground }, color: colors.ink, thickness: 1.8 });
      page.drawLine({ start: { x: x + 164, y: ground }, end: { x: x + 266, y: y + height - 56 }, color: colors.ink, thickness: 1.8 });
      page.drawLine({ start: { x: x + 266, y: y + height - 56 }, end: { x: x + width - 20, y: ground }, color: colors.ink, thickness: 1.8 });
      page.drawCircle({ x: x + width - 45, y: y + height - 32, size: 18, borderColor: colors.yellow, borderWidth: 2 });
      page.drawLine({ start: { x: x + width / 2, y: ground }, end: { x: x + width / 2 + 24, y: ground + 44 }, color: colors.green, thickness: 1.4 });
      page.drawLine({ start: { x: x + 120, y: y + height - 24 }, end: { x: x + 137, y: y + height - 45 }, color: colors.blue, thickness: 1.1 });
      drawTree(x + 54, ground, 0.65);
      drawTree(x + width - 80, ground, 0.55);
      drawCloud(x + 30, y + height - 78);
      page.drawLine({ start: { x: x + 135, y: ground }, end: { x: x + 165, y: ground + 64 }, color: colors.coral, thickness: 1.3 });
      page.drawLine({ start: { x: x + 165, y: ground + 64 }, end: { x: x + 198, y: ground + 106 }, color: colors.coral, thickness: 1.3 });
      break;
    case "temple":
      page.drawRectangle({ x: x + 92, y: ground, width: 168, height: 92, borderColor: colors.ink, borderWidth: 1.8 });
      page.drawLine({ start: { x: x + 68, y: ground + 92 }, end: { x: x + 176, y: ground + 136 }, color: colors.coral, thickness: 2 });
      page.drawLine({ start: { x: x + 284, y: ground + 92 }, end: { x: x + 176, y: ground + 136 }, color: colors.coral, thickness: 2 });
      page.drawLine({ start: { x: x + 52, y: ground + 78 }, end: { x: x + 300, y: ground + 78 }, color: colors.ink, thickness: 1.6 });
      [0, 1, 2].forEach((index) => page.drawRectangle({ x: x + 116 + index * 46, y: ground, width: 15, height: 54, borderColor: colors.blue, borderWidth: 1.4 }));
      page.drawCircle({ x: x + width - 38, y: y + height - 28, size: 17, borderColor: colors.yellow, borderWidth: 2 });
      page.drawLine({ start: { x: x + 76, y: ground }, end: { x: x + 62, y: ground + 52 }, color: colors.ink, thickness: 1.4 });
      page.drawLine({ start: { x: x + width - 76, y: ground }, end: { x: x + width - 62, y: ground + 52 }, color: colors.ink, thickness: 1.4 });
      [0, 1, 2].forEach((index) => page.drawCircle({ x: x + 116 + index * 46, y: ground + 72, size: 6, borderColor: colors.coral, borderWidth: 1.2 }));
      page.drawLine({ start: { x: x + 78, y: ground - 3 }, end: { x: x + 282, y: ground - 3 }, color: colors.ink, thickness: 1.3 });
      drawLantern(x + 86, ground + 103);
      drawLantern(x + 266, ground + 103);
      break;
    case "mosque": {
      const center = x + width / 2;
      page.drawLine({ start: { x: x + 36, y: ground }, end: { x: x + width - 36, y: ground }, color: colors.ink, thickness: 1.6 });
      page.drawRectangle({ x: center - 95, y: ground, width: 190, height: 78, borderColor: colors.ink, borderWidth: 1.8 });
      page.drawCircle({ x: center, y: ground + 78, size: 53, borderColor: colors.coral, borderWidth: 2 });
      page.drawRectangle({ x: center - 56, y: ground + 24, width: 112, height: 54, color: colors.white });
      page.drawLine({ start: { x: center - 53, y: ground + 78 }, end: { x: center + 53, y: ground + 78 }, color: colors.coral, thickness: 2 });
      [center - 58, center, center + 58].forEach((archX, index) => {
        page.drawRectangle({ x: archX - 12, y: ground, width: 24, height: 39 + (index % 2) * 8, borderColor: colors.blue, borderWidth: 1.2 });
        page.drawCircle({ x: archX, y: ground + 39 + (index % 2) * 8, size: 12, borderColor: colors.blue, borderWidth: 1.2 });
        page.drawRectangle({ x: archX - 14, y: ground + 25 + (index % 2) * 8, width: 28, height: 16, color: colors.white });
      });
      [center - 132, center + 132].forEach((minaretX) => {
        page.drawRectangle({ x: minaretX - 9, y: ground, width: 18, height: 114, borderColor: colors.ink, borderWidth: 1.5 });
        page.drawLine({ start: { x: minaretX - 16, y: ground + 114 }, end: { x: minaretX, y: ground + 137 }, color: colors.ink, thickness: 1.5 });
        page.drawLine({ start: { x: minaretX + 16, y: ground + 114 }, end: { x: minaretX, y: ground + 137 }, color: colors.ink, thickness: 1.5 });
        page.drawLine({ start: { x: minaretX, y: ground + 137 }, end: { x: minaretX, y: ground + 149 }, color: colors.coral, thickness: 1.2 });
      });
      page.drawLine({ start: { x: center, y: ground + 131 }, end: { x: center, y: ground + 148 }, color: colors.coral, thickness: 1.2 });
      page.drawCircle({ x: center + 5, y: ground + 151, size: 7, borderColor: colors.coral, borderWidth: 1.2 });
      page.drawCircle({ x: center + 8, y: ground + 153, size: 6, color: colors.white });
      break;
    }
    case "tower": {
      const center = x + width / 2;
      page.drawLine({ start: { x: center - 66, y: ground }, end: { x: center - 13, y: ground + 142 }, color: colors.ink, thickness: 2 });
      page.drawLine({ start: { x: center + 66, y: ground }, end: { x: center + 13, y: ground + 142 }, color: colors.ink, thickness: 2 });
      page.drawLine({ start: { x: center - 45, y: ground + 44 }, end: { x: center + 45, y: ground + 44 }, color: colors.coral, thickness: 1.8 });
      page.drawLine({ start: { x: center - 31, y: ground + 82 }, end: { x: center + 31, y: ground + 82 }, color: colors.coral, thickness: 1.8 });
      page.drawRectangle({ x: center - 40, y: ground + 99, width: 80, height: 14, borderColor: colors.blue, borderWidth: 1.5 });
      page.drawLine({ start: { x: center, y: ground + 142 }, end: { x: center, y: ground + 166 }, color: colors.ink, thickness: 1.5 });
      [[-52, 44, 31, 82], [52, 44, -31, 82], [-31, 82, 13, 142], [31, 82, -13, 142]].forEach(([x1, y1, x2, y2]) => {
        page.drawLine({ start: { x: center + x1, y: ground + y1 }, end: { x: center + x2, y: ground + y2 }, color: colors.muted, thickness: 1 });
      });
      drawTree(x + 54, ground, 0.55);
      drawTree(x + width - 74, ground, 0.55);
      break;
    }
    case "castle": {
      const left = x + 70;
      const right = x + width - 70;
      page.drawRectangle({ x: left + 40, y: ground, width: right - left - 80, height: 86, borderColor: colors.ink, borderWidth: 1.8 });
      [left, right - 45].forEach((towerX) => {
        page.drawRectangle({ x: towerX, y: ground, width: 45, height: 116, borderColor: colors.ink, borderWidth: 1.8 });
        [0, 1, 2].forEach((index) => page.drawRectangle({ x: towerX + index * 18, y: ground + 116, width: 9, height: 13, borderColor: colors.coral, borderWidth: 1.2 }));
      });
      [0, 1, 2, 3, 4].forEach((index) => page.drawRectangle({ x: left + 45 + index * ((right - left - 55) / 4), y: ground + 86, width: 10, height: 13, borderColor: colors.coral, borderWidth: 1.2 }));
      const center = x + width / 2;
      page.drawRectangle({ x: center - 18, y: ground, width: 36, height: 48, borderColor: colors.blue, borderWidth: 1.4 });
      page.drawCircle({ x: center, y: ground + 48, size: 18, borderColor: colors.blue, borderWidth: 1.4 });
      page.drawRectangle({ x: center - 20, y: ground + 31, width: 40, height: 20, color: colors.white });
      page.drawLine({ start: { x: x + 28, y: ground }, end: { x: x + width - 28, y: ground }, color: colors.ink, thickness: 1.5 });
      break;
    }
    case "cave":
      page.drawCircle({ x: x + width / 2, y: ground + 82, size: 110, borderColor: colors.ink, borderWidth: 2 });
      page.drawCircle({ x: x + width / 2, y: ground + 74, size: 72, borderColor: colors.blue, borderWidth: 1.5 });
      page.drawLine({ start: { x: x + 34, y: ground }, end: { x: x + width - 34, y: ground }, color: colors.ink, thickness: 1.8 });
      [0, 1, 2, 3].forEach((index) => {
        const stalactiteX = x + 72 + index * 62;
        page.drawLine({ start: { x: stalactiteX, y: ground + 158 - (index % 2) * 14 }, end: { x: stalactiteX + 9, y: ground + 128 - (index % 2) * 14 }, color: colors.ink, thickness: 1.5 });
      });
      drawTree(x + 50, ground, 0.55);
      drawTree(x + width - 70, ground, 0.55);
      drawBird(x + 92, y + height - 42, 0.8);
      [0, 1, 2].forEach((index) => page.drawCircle({ x: x + 142 + index * 28, y: ground + 48, size: 4, borderColor: colors.blue, borderWidth: 1.2 }));
      break;
    case "coast":
      page.drawCircle({ x: x + width - 42, y: y + height - 35, size: 18, borderColor: colors.yellow, borderWidth: 1.8 });
      [0, 1, 2].forEach((index) => drawWaves(ground + index * 11, 4));
      page.drawRectangle({ x: x + 64, y: ground + 24, width: 34, height: 92, borderColor: colors.ink, borderWidth: 1.7 });
      page.drawLine({ start: { x: x + 58, y: ground + 116 }, end: { x: x + 81, y: ground + 140 }, color: colors.ink, thickness: 1.6 });
      page.drawLine({ start: { x: x + 104, y: ground + 116 }, end: { x: x + 81, y: ground + 140 }, color: colors.ink, thickness: 1.6 });
      page.drawRectangle({ x: x + 69, y: ground + 70, width: 24, height: 20, borderColor: colors.blue, borderWidth: 1.2 });
      page.drawLine({ start: { x: x + 81, y: ground + 140 }, end: { x: x + 81, y: ground + 154 }, color: colors.coral, thickness: 1.2 });
      page.drawLine({ start: { x: x + 81, y: ground + 154 }, end: { x: x + 111, y: ground + 147 }, color: colors.coral, thickness: 1.2 });
      page.drawLine({ start: { x: x + 216, y: ground + 51 }, end: { x: x + 258, y: ground + 94 }, color: colors.ink, thickness: 1.5 });
      page.drawLine({ start: { x: x + 258, y: ground + 94 }, end: { x: x + 300, y: ground + 51 }, color: colors.ink, thickness: 1.5 });
      page.drawLine({ start: { x: x + 258, y: ground + 94 }, end: { x: x + 258, y: ground + 122 }, color: colors.ink, thickness: 1.4 });
      page.drawLine({ start: { x: x + 258, y: ground + 122 }, end: { x: x + 292, y: ground + 101 }, color: colors.coral, thickness: 1.2 });
      page.drawLine({ start: { x: x + 204, y: ground + 50 }, end: { x: x + 310, y: ground + 50 }, color: colors.ink, thickness: 2 });
      break;
    case "penguin": {
      const drawPenguin = (penguinX: number, penguinY: number, scale: number) => {
        page.drawCircle({ x: penguinX, y: penguinY + 44 * scale, size: 30 * scale, borderColor: colors.ink, borderWidth: 1.7 });
        page.drawCircle({ x: penguinX, y: penguinY + 86 * scale, size: 22 * scale, borderColor: colors.ink, borderWidth: 1.7 });
        page.drawCircle({ x: penguinX, y: penguinY + 42 * scale, size: 18 * scale, borderColor: colors.blue, borderWidth: 1.1 });
        page.drawLine({ start: { x: penguinX - 27 * scale, y: penguinY + 55 * scale }, end: { x: penguinX - 45 * scale, y: penguinY + 33 * scale }, color: colors.coral, thickness: 1.3 });
        page.drawLine({ start: { x: penguinX + 27 * scale, y: penguinY + 55 * scale }, end: { x: penguinX + 45 * scale, y: penguinY + 33 * scale }, color: colors.coral, thickness: 1.3 });
        page.drawLine({ start: { x: penguinX - 8 * scale, y: penguinY + 13 * scale }, end: { x: penguinX - 21 * scale, y: penguinY }, color: colors.ink, thickness: 1.3 });
        page.drawLine({ start: { x: penguinX + 8 * scale, y: penguinY + 13 * scale }, end: { x: penguinX + 21 * scale, y: penguinY }, color: colors.ink, thickness: 1.3 });
        page.drawLine({ start: { x: penguinX, y: penguinY + 83 * scale }, end: { x: penguinX + 18 * scale, y: penguinY + 78 * scale }, color: colors.coral, thickness: 1.2 });
      };
      page.drawLine({ start: { x: x + 28, y: ground }, end: { x: x + width - 28, y: ground }, color: colors.blue, thickness: 1.4 });
      drawPenguin(x + width * 0.4, ground + 4, 1);
      drawPenguin(x + width * 0.68, ground + 2, 0.72);
      drawBird(x + 45, y + height - 42, 0.8);
      break;
    }
    case "wildlife": {
      const animalX = x + width * 0.45;
      page.drawCircle({ x: animalX, y: ground + 76, size: 54, borderColor: colors.ink, borderWidth: 1.7 });
      page.drawCircle({ x: animalX + 65, y: ground + 100, size: 34, borderColor: colors.ink, borderWidth: 1.7 });
      page.drawCircle({ x: animalX + 48, y: ground + 104, size: 28, borderColor: colors.green, borderWidth: 1.2 });
      page.drawLine({ start: { x: animalX + 92, y: ground + 94 }, end: { x: animalX + 108, y: ground + 54 }, color: colors.ink, thickness: 2 });
      page.drawLine({ start: { x: animalX + 108, y: ground + 54 }, end: { x: animalX + 118, y: ground + 65 }, color: colors.ink, thickness: 1.5 });
      [-31, 8].forEach((offset) => {
        page.drawRectangle({ x: animalX + offset, y: ground, width: 17, height: 48, borderColor: colors.ink, borderWidth: 1.5 });
      });
      page.drawCircle({ x: animalX + 75, y: ground + 110, size: 3, color: colors.ink });
      drawTree(x + 55, ground, 0.75);
      drawTree(x + width - 55, ground, 0.5);
      drawBird(x + 40, y + height - 35, 0.8);
      break;
    }
    case "dinosaur": {
      const bodyX = x + width * 0.48;
      page.drawCircle({ x: bodyX, y: ground + 74, size: 58, borderColor: colors.ink, borderWidth: 1.8 });
      page.drawCircle({ x: bodyX - 79, y: ground + 126, size: 25, borderColor: colors.ink, borderWidth: 1.8 });
      page.drawLine({ start: { x: bodyX - 55, y: ground + 91 }, end: { x: bodyX - 72, y: ground + 119 }, color: colors.ink, thickness: 2 });
      page.drawLine({ start: { x: bodyX + 55, y: ground + 86 }, end: { x: bodyX + 126, y: ground + 106 }, color: colors.ink, thickness: 2 });
      page.drawLine({ start: { x: bodyX + 126, y: ground + 106 }, end: { x: bodyX + 92, y: ground + 72 }, color: colors.ink, thickness: 1.5 });
      [-30, 24].forEach((offset) => {
        page.drawLine({ start: { x: bodyX + offset, y: ground + 32 }, end: { x: bodyX + offset - 9, y: ground }, color: colors.ink, thickness: 2 });
        page.drawLine({ start: { x: bodyX + offset - 9, y: ground }, end: { x: bodyX + offset + 8, y: ground }, color: colors.ink, thickness: 1.5 });
      });
      [-42, -22, 0, 24, 45].forEach((offset) => {
        page.drawLine({ start: { x: bodyX + offset, y: ground + 124 - Math.abs(offset) * 0.3 }, end: { x: bodyX + offset + 8, y: ground + 141 - Math.abs(offset) * 0.2 }, color: colors.coral, thickness: 1.3 });
      });
      page.drawCircle({ x: bodyX - 87, y: ground + 132, size: 3, color: colors.ink });
      page.drawLine({ start: { x: x + 24, y: ground }, end: { x: x + width - 24, y: ground }, color: colors.green, thickness: 1.3 });
      break;
    }
    case "shophouse":
      [0, 1, 2].forEach((index) => {
        const shopX = x + 34 + index * 88;
        page.drawRectangle({ x: shopX, y: ground, width: 74, height: 116 - (index % 2) * 16, borderColor: colors.ink, borderWidth: 1.7 });
        page.drawLine({ start: { x: shopX, y: ground + 74 }, end: { x: shopX + 74, y: ground + 74 }, color: colors.coral, thickness: 2.2 });
        drawWindows(shopX + 12, ground + 86, 2, 1, 26);
        page.drawRectangle({ x: shopX + 25, y: ground, width: 24, height: 42, borderColor: colors.blue, borderWidth: 1.2 });
      });
      page.drawLine({ start: { x: x + 22, y: ground }, end: { x: x + width - 22, y: ground }, color: colors.ink, thickness: 1.8 });
      [0, 1, 2].forEach((index) => page.drawCircle({ x: x + 70 + index * 88, y: ground + 140, size: 8, borderColor: colors.yellow, borderWidth: 1.3 }));
      drawLantern(x + 70, ground + 142);
      drawLantern(x + width - 70, ground + 142);
      break;
  }
}

function drawTraceBoard(
  page: PDFPage,
  fonts: Fonts,
  activity: Activity,
  box: Box,
  coloring: boolean,
  context: string,
) {
  const label = pdfText(activity.items[0]?.label || "LOCAL DETAIL").toUpperCase();
  const variant = coloringSceneFor(activity, context);
  drawWrappedText(page, activity.items[0]?.clue || activity.prompt, fonts, {
    x: box.x,
    y: box.y + box.height - 17,
    size: 9,
    maxWidth: box.width,
    maxLines: 2,
    color: colors.muted,
  });

  page.drawText(coloring ? "COLORING REFERENCE" : "OBSERVATION REFERENCE", {
    x: box.x,
    y: box.y + box.height - 52,
    size: 7,
    font: fonts.bold,
    color: colors.coral,
  });
  const sceneLabel = pdfText(coloringSceneLabels[variant]).toUpperCase();
  const sceneLabelSize = fitTextSize(sceneLabel, fonts.bold, box.width - 170, 7, 5.5);
  page.drawText(sceneLabel, {
    x: box.x + box.width - fonts.bold.widthOfTextAtSize(sceneLabel, sceneLabelSize),
    y: box.y + box.height - 52,
    size: sceneLabelSize,
    font: fonts.bold,
    color: colors.blue,
  });

  const scene = { x: box.x, y: box.y + 64, width: box.width, height: box.height - 134 };
  page.drawRectangle({
    ...scene,
    borderColor: colors.line,
    borderWidth: 1.2,
  });
  drawColoringScene(page, scene, variant);

  page.drawText(coloring ? "TRACE AND COLOR" : "FIELD SKETCH", {
    x: box.x,
    y: box.y + 44,
    size: 8,
    font: fonts.bold,
    color: colors.coral,
  });
  const traceSize = fitTextSize(label, fonts.bold, box.width - 66, 20, 12);
  page.drawText(label, {
    x: box.x + 58,
    y: box.y + 22,
    size: traceSize,
    font: fonts.bold,
    color: rgb(0.77, 0.79, 0.76),
    opacity: 0.55,
  });
  drawDottedLine(page, box.x + 58, box.x + box.width, box.y + 14, colors.line, 2, 3);
}

function drawWordSearch(page: PDFPage, fonts: Fonts, activity: Activity, age: number, box: Box) {
  const size = age <= 8 ? 10 : age <= 11 ? 11 : 12;
  const puzzle = createWordSearch(
    activity.items.map((item) => item.label),
    activity.title,
    size,
    age >= 9,
  );
  const gridSize = Math.min(280, box.height - 4, box.width - 155);
  const cell = gridSize / puzzle.grid.length;
  const gridX = box.x;
  const gridY = box.y + (box.height - gridSize) / 2;
  puzzle.grid.forEach((row, rowIndex) => {
    row.forEach((letter, columnIndex) => {
      const x = gridX + columnIndex * cell;
      const y = gridY + gridSize - (rowIndex + 1) * cell;
      page.drawRectangle({
        x,
        y,
        width: cell,
        height: cell,
        borderColor: colors.line,
        borderWidth: 0.55,
      });
      const fontSize = Math.max(8, Math.min(12, cell * 0.46));
      page.drawText(letter, {
        x: x + (cell - fonts.monoBold.widthOfTextAtSize(letter, fontSize)) / 2,
        y: y + cell * 0.32,
        size: fontSize,
        font: fonts.monoBold,
        color: colors.ink,
      });
    });
  });
  const bankX = gridX + gridSize + 20;
  page.drawText("FIND", { x: bankX, y: gridY + gridSize - 8, size: 8, font: fonts.bold, color: colors.coral });
  puzzle.words.forEach((word, index) => {
    page.drawRectangle({
      x: bankX,
      y: gridY + gridSize - 47 - index * 52,
      width: box.x + box.width - bankX,
      height: 34,
      color: index % 2 ? colors.greenSoft : colors.yellowSoft,
    });
    page.drawText(word, {
      x: bankX + 9,
      y: gridY + gridSize - 35 - index * 52,
      size: 10,
      font: fonts.monoBold,
      color: colors.ink,
    });
  });
}

function drawCrossword(page: PDFPage, fonts: Fonts, activity: Activity, box: Box) {
  const puzzle = createCrossword(activity.items.map((item) => item.label));
  const rows = puzzle.grid.length;
  const columns = puzzle.grid[0]?.length || 1;
  const gridSize = Math.min(280, box.height - 5, box.width * 0.57);
  const cell = Math.min(gridSize / rows, gridSize / columns);
  const width = columns * cell;
  const height = rows * cell;
  const gridY = box.y + (box.height - height) / 2;
  puzzle.grid.forEach((row, rowIndex) => {
    row.forEach((cellValue, columnIndex) => {
      const x = box.x + columnIndex * cell;
      const y = gridY + height - (rowIndex + 1) * cell;
      page.drawRectangle({
        x,
        y,
        width: cell,
        height: cell,
        color: cellValue ? colors.white : colors.ink,
        borderColor: colors.ink,
        borderWidth: 0.7,
      });
      if (cellValue?.number) {
        page.drawText(String(cellValue.number), {
          x: x + 2,
          y: y + cell - 7,
          size: 5,
          font: fonts.bold,
          color: colors.coral,
        });
      }
    });
  });
  const clueX = box.x + width + 18;
  const clueWidth = box.x + box.width - clueX;
  page.drawText("CLUES", { x: clueX, y: box.y + box.height - 8, size: 8, font: fonts.bold, color: colors.coral });
  puzzle.entries.forEach((entry, index) => {
    const item = activity.items[entry.answerIndex];
    const y = box.y + box.height - 33 - index * 66;
    const clueNumber = `${entry.number}${entry.direction === "across" ? "A" : "D"}`;
    page.drawCircle({ x: clueX + 8, y: y + 3, size: 8, color: colors.yellow });
    page.drawText(clueNumber, {
      x: clueX + 8 - fonts.bold.widthOfTextAtSize(clueNumber, 5.5) / 2,
      y: y + 0.5,
      size: 5.5,
      font: fonts.bold,
      color: colors.ink,
    });
    drawWrappedText(page, item?.clue || "Solve this local answer.", fonts, {
      x: clueX + 22,
      y: y + 7,
      size: 8,
      lineHeight: 10,
      maxWidth: clueWidth - 22,
      maxLines: 5,
      color: colors.muted,
    });
  });
}

function drawMazeGame(page: PDFPage, fonts: Fonts, activity: Activity, age: number, box: Box) {
  const maze = createMaze(
    `${activity.title}|${activity.items[0]?.label}|${age}`,
    mazeSizeForAge(age),
  );
  const gridSize = Math.min(box.height - 18, box.width - 86, 330);
  const cell = gridSize / maze.length;
  const x0 = box.x + (box.width - gridSize) / 2;
  const y0 = box.y + (box.height - gridSize) / 2;
  const thickness = maze.length >= 16 ? 0.8 : 1.25;
  maze.forEach((row, rowIndex) => {
    row.forEach((cellValue, columnIndex) => {
      const x = x0 + columnIndex * cell;
      const y = y0 + gridSize - (rowIndex + 1) * cell;
      const [top, right, bottom, left] = cellValue.walls;
      if (top) page.drawLine({ start: { x, y: y + cell }, end: { x: x + cell, y: y + cell }, thickness, color: colors.ink });
      if (right) page.drawLine({ start: { x: x + cell, y }, end: { x: x + cell, y: y + cell }, thickness, color: colors.ink });
      if (bottom) page.drawLine({ start: { x, y }, end: { x: x + cell, y }, thickness, color: colors.ink });
      if (left) page.drawLine({ start: { x, y }, end: { x, y: y + cell }, thickness, color: colors.ink });
    });
  });
  page.drawCircle({ x: x0 + cell / 2, y: y0 + gridSize - cell / 2, size: Math.max(3, cell * 0.2), color: colors.green });
  page.drawCircle({ x: x0 + gridSize - cell / 2, y: y0 + cell / 2, size: Math.max(3, cell * 0.2), color: colors.coral });
  page.drawText("START", { x: x0 - 39, y: y0 + gridSize - 7, size: 7, font: fonts.bold, color: colors.green });
  page.drawText("FINISH", { x: x0 + gridSize + 8, y: y0 + 2, size: 7, font: fonts.bold, color: colors.coral });
}

function drawMatching(page: PDFPage, fonts: Fonts, items: GameItem[], box: Box) {
  const reversed = [...items].reverse();
  const columnWidth = (box.width - 38) / 2;
  const rowHeight = box.height / 4;
  items.forEach((item, index) => {
    const y = box.y + box.height - (index + 1) * rowHeight + 8;
    page.drawCircle({ x: box.x + 11, y: y + rowHeight / 2 - 7, size: 10, color: colors.yellow });
    page.drawText(String(index + 1), { x: box.x + 8, y: y + rowHeight / 2 - 10, size: 7, font: fonts.bold, color: colors.ink });
    drawWrappedText(page, item.label, fonts, {
      x: box.x + 28,
      y: y + rowHeight / 2,
      size: 9,
      font: fonts.bold,
      maxWidth: columnWidth - 34,
      maxLines: 2,
      lineHeight: 11,
    });
    drawDottedLine(page, box.x + columnWidth - 14, box.x + columnWidth + 25, y + rowHeight / 2 - 7, colors.line, 2, 4);
  });
  reversed.forEach((item, index) => {
    const x = box.x + columnWidth + 38;
    const y = box.y + box.height - (index + 1) * rowHeight + 8;
    page.drawCircle({ x: x + 8, y: y + rowHeight / 2 - 7, size: 10, color: colors.blueSoft, borderColor: colors.blue, borderWidth: 1 });
    page.drawText(String.fromCharCode(65 + index), { x: x + 5, y: y + rowHeight / 2 - 10, size: 7, font: fonts.bold, color: colors.blue });
    drawWrappedText(page, item.clue, fonts, {
      x: x + 26,
      y: y + rowHeight / 2 + 4,
      size: 8,
      maxWidth: columnWidth - 24,
      maxLines: 4,
      lineHeight: 9.5,
      color: colors.muted,
    });
  });
}

function drawBingo(page: PDFPage, fonts: Fonts, items: GameItem[], box: Box) {
  const gap = 10;
  const width = (box.width - gap) / 2;
  const height = (box.height - gap) / 2;
  items.forEach((item, index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = box.x + column * (width + gap);
    const y = box.y + box.height - (row + 1) * height - row * gap;
    page.drawRectangle({
      x,
      y,
      width,
      height,
      color: index % 2 ? colors.greenSoft : colors.yellowSoft,
      borderColor: colors.line,
      borderWidth: 1,
    });
    page.drawCircle({ x: x + width - 20, y: y + height - 20, size: 9, borderColor: colors.coral, borderWidth: 1.4 });
    drawWrappedText(page, item.label, fonts, {
      x: x + 14,
      y: y + height - 30,
      size: 12,
      font: fonts.bold,
      maxWidth: width - 50,
      maxLines: 2,
      lineHeight: 14,
    });
    drawWrappedText(page, item.clue, fonts, {
      x: x + 14,
      y: y + height - 72,
      size: 8,
      maxWidth: width - 28,
      maxLines: 5,
      lineHeight: 10,
      color: colors.muted,
    });
  });
}

function drawDifferenceScene(page: PDFPage, box: Box, version: number) {
  page.drawRectangle({ ...box, borderColor: colors.line, borderWidth: 1 });
  const sunX = version ? box.x + 46 : box.x + box.width - 46;
  page.drawCircle({ x: sunX, y: box.y + box.height - 43, size: version ? 17 : 22, borderColor: colors.yellow, borderWidth: 2 });
  const buildingX = box.x + 46;
  page.drawRectangle({ x: buildingX, y: box.y + 33, width: 68, height: 92, borderColor: colors.ink, borderWidth: 1.6 });
  if (version) {
    page.drawLine({ start: { x: buildingX, y: box.y + 125 }, end: { x: buildingX + 34, y: box.y + 158 }, thickness: 1.6, color: colors.ink });
    page.drawLine({ start: { x: buildingX + 68, y: box.y + 125 }, end: { x: buildingX + 34, y: box.y + 158 }, thickness: 1.6, color: colors.ink });
  } else {
    page.drawLine({ start: { x: buildingX - 5, y: box.y + 125 }, end: { x: buildingX + 73, y: box.y + 125 }, thickness: 3, color: colors.coral });
  }
  const treeCount = version ? 1 : 2;
  for (let index = 0; index < treeCount; index += 1) {
    const x = box.x + box.width - 54 - index * 42;
    page.drawLine({ start: { x, y: box.y + 30 }, end: { x, y: box.y + 73 }, thickness: 2, color: colors.ink });
    page.drawCircle({ x, y: box.y + 91, size: 20, borderColor: colors.green, borderWidth: 2 });
  }
  drawDottedLine(page, box.x + 18, box.x + box.width - 18, box.y + 23, colors.line, 3, 4);
}

function drawDifferences(page: PDFPage, fonts: Fonts, box: Box) {
  const gap = 14;
  const width = (box.width - gap) / 2;
  drawDifferenceScene(page, { x: box.x, y: box.y + 22, width, height: box.height - 22 }, 0);
  drawDifferenceScene(page, { x: box.x + width + gap, y: box.y + 22, width, height: box.height - 22 }, 1);
  page.drawText("PICTURE A", { x: box.x, y: box.y + 7, size: 7, font: fonts.bold, color: colors.muted });
  page.drawText("PICTURE B", { x: box.x + width + gap, y: box.y + 7, size: 7, font: fonts.bold, color: colors.muted });
}

function drawCodebreaker(page: PDFPage, fonts: Fonts, items: GameItem[], box: Box) {
  const phrase = normalizePuzzleWord(items[0]?.label || "TRIP", 12) || "TRIP";
  const symbols = ["@", "#", "$", "%", "&", "+", "=", "?"];
  const letters = Array.from(new Set(phrase));
  const code = phrase.split("").map((letter) => symbols[letters.indexOf(letter) % symbols.length]);
  const cell = Math.min(37, (box.width - 10) / code.length);
  const startX = box.x + (box.width - cell * code.length) / 2;
  code.forEach((symbol, index) => {
    const x = startX + index * cell;
    page.drawRectangle({ x, y: box.y + box.height - 78, width: cell - 3, height: 45, color: colors.yellowSoft, borderColor: colors.line, borderWidth: 1 });
    page.drawText(symbol, { x: x + 9, y: box.y + box.height - 62, size: 17, font: fonts.monoBold, color: colors.ink });
    drawDottedLine(page, x + 4, x + cell - 7, box.y + box.height - 96, colors.line, 3, 3);
  });
  page.drawText("STARTER KEY", { x: box.x, y: box.y + box.height - 132, size: 8, font: fonts.bold, color: colors.coral });
  letters.slice(0, 4).forEach((letter, index) => {
    const x = box.x + index * (box.width / 4);
    page.drawRectangle({ x, y: box.y + box.height - 188, width: box.width / 4 - 8, height: 38, color: colors.blueSoft });
    page.drawText(`${symbols[index]} = ${letter}`, { x: x + 13, y: box.y + box.height - 174, size: 12, font: fonts.monoBold, color: colors.blue });
  });
  drawWrappedText(page, items[0]?.clue || "Crack the local word.", fonts, {
    x: box.x,
    y: box.y + 76,
    size: 9,
    maxWidth: box.width,
    maxLines: 3,
    lineHeight: 12,
    color: colors.muted,
  });
  page.drawText("DECODED WORD", { x: box.x, y: box.y + 28, size: 8, font: fonts.bold, color: colors.green });
  drawDottedLine(page, box.x + 98, box.x + box.width, box.y + 28, colors.line, 5, 4);
}

function drawMap(page: PDFPage, fonts: Fonts, activity: Activity, age: number, box: Box) {
  const items = activity.items;
  const puzzle = createRoutePuzzle(`${activity.title}|${items.map((item) => item.label).join("|")}`, age);
  const mapSize = Math.min(220, box.height - 94, box.width - 80);
  const mapX = box.x + (box.width - mapSize) / 2;
  const mapY = box.y + 91;
  const point = ({ row, column }: { row: number; column: number }) => ({
    x: mapX + column * (mapSize / (puzzle.size - 1)),
    y: mapY + mapSize - row * (mapSize / (puzzle.size - 1)),
  });

  puzzle.allStreets.forEach((street) => {
    page.drawLine({ start: point(street.from), end: point(street.to), thickness: 1.1, color: colors.softLine });
  });
  puzzle.streets.forEach((street) => {
    page.drawLine({ start: point(street.from), end: point(street.to), thickness: 2.4, color: colors.muted });
  });
  puzzle.closedStreets.forEach((street) => {
    const from = point(street.from);
    const to = point(street.to);
    const middle = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
    const length = Math.hypot(to.x - from.x, to.y - from.y) || 1;
    const unit = { x: (to.x - from.x) / length, y: (to.y - from.y) / length };
    const perpendicular = { x: -unit.y * 5, y: unit.x * 5 };
    [-2.2, 2.2].forEach((offset) => {
      const center = { x: middle.x + unit.x * offset, y: middle.y + unit.y * offset };
      page.drawLine({
        start: { x: center.x - perpendicular.x, y: center.y - perpendicular.y },
        end: { x: center.x + perpendicular.x, y: center.y + perpendicular.y },
        thickness: 2,
        color: colors.coral,
      });
    });
  });
  for (let row = 0; row < puzzle.size; row += 1) {
    for (let column = 0; column < puzzle.size; column += 1) {
      const location = point({ row, column });
      page.drawCircle({ ...location, size: 2.2, color: colors.white, borderColor: colors.muted, borderWidth: 0.8 });
    }
  }
  [
    { ...puzzle.start, label: "S", color: colors.green },
    { ...puzzle.finish, label: "F", color: colors.coral },
  ].forEach((terminal) => {
    const location = point(terminal);
    page.drawRectangle({ x: location.x - 8, y: location.y - 8, width: 16, height: 16, color: colors.white, borderColor: terminal.color, borderWidth: 1.8 });
    page.drawText(terminal.label, { x: location.x - fonts.bold.widthOfTextAtSize(terminal.label, 7) / 2, y: location.y - 2.5, size: 7, font: fonts.bold, color: terminal.color });
  });
  puzzle.stops.forEach((stop) => {
    const location = point(stop);
    const number = String(stop.itemIndex + 1);
    page.drawCircle({ ...location, size: 12, color: colors.yellow, borderColor: colors.ink, borderWidth: 1 });
    page.drawText(number, { x: location.x - fonts.bold.widthOfTextAtSize(number, 8) / 2, y: location.y - 3, size: 8, font: fonts.bold, color: colors.ink });
  });
  page.drawText("S = START", { x: mapX, y: mapY + mapSize + 12, size: 7, font: fonts.bold, color: colors.green });
  const finishLabel = "F = FINISH";
  page.drawText(finishLabel, { x: mapX + mapSize - fonts.bold.widthOfTextAtSize(finishLabel, 7), y: mapY - 17, size: 7, font: fonts.bold, color: colors.coral });

  const legendGap = 10;
  const legendWidth = (box.width - legendGap) / 2;
  items.forEach((item, index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = box.x + column * (legendWidth + legendGap);
    const y = box.y + 42 - row * 42;
    page.drawCircle({ x: x + 7, y: y + 12, size: 7, color: colors.yellow, borderColor: colors.ink, borderWidth: 0.7 });
    page.drawText(String(index + 1), { x: x + 5, y: y + 9.5, size: 6, font: fonts.bold, color: colors.ink });
    drawWrappedText(page, item.label, fonts, { x: x + 20, y: y + 19, size: 8, font: fonts.bold, maxWidth: legendWidth - 22, maxLines: 1 });
    drawWrappedText(page, item.clue, fonts, { x: x + 20, y: y + 7, size: 6.5, lineHeight: 8, maxWidth: legendWidth - 22, maxLines: 2, color: colors.muted });
  });
}

function drawChecklist(page: PDFPage, fonts: Fonts, items: GameItem[], box: Box) {
  const gap = 8;
  const rowHeight = (box.height - gap * 3) / 4;
  items.forEach((item, index) => {
    const y = box.y + box.height - (index + 1) * rowHeight - index * gap;
    page.drawRectangle({ x: box.x, y, width: box.width, height: rowHeight, color: index % 2 ? colors.greenSoft : colors.white, borderColor: colors.softLine, borderWidth: 1 });
    page.drawRectangle({ x: box.x + 13, y: y + rowHeight / 2 - 10, width: 20, height: 20, borderColor: colors.coral, borderWidth: 1.5 });
    drawWrappedText(page, item.label, fonts, { x: box.x + 48, y: y + rowHeight - 21, size: 10, font: fonts.bold, maxWidth: 130, maxLines: 2, lineHeight: 12 });
    drawWrappedText(page, item.clue, fonts, { x: box.x + 190, y: y + rowHeight - 17, size: 8, maxWidth: box.width - 205, maxLines: 4, lineHeight: 10, color: colors.muted });
  });
}

function drawQuiz(page: PDFPage, fonts: Fonts, items: GameItem[], box: Box) {
  page.drawRectangle({ x: box.x, y: box.y + box.height - 92, width: box.width, height: 92, color: colors.yellowSoft });
  drawWrappedText(page, items[0]?.clue || "Circle the best local answer.", fonts, { x: box.x + 16, y: box.y + box.height - 28, size: 11, font: fonts.bold, maxWidth: box.width - 32, maxLines: 4, lineHeight: 14 });
  const optionTop = box.y + box.height - 112;
  const gap = 10;
  const width = (box.width - gap) / 2;
  const height = (box.height - 122 - gap) / 2;
  items.forEach((item, index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = box.x + column * (width + gap);
    const y = optionTop - (row + 1) * height - row * gap;
    page.drawRectangle({ x, y, width, height, borderColor: colors.line, borderWidth: 1, color: colors.white });
    page.drawCircle({ x: x + 19, y: y + height / 2, size: 10, borderColor: colors.blue, borderWidth: 1.2 });
    page.drawText(String.fromCharCode(65 + index), { x: x + 16, y: y + height / 2 - 3, size: 7, font: fonts.bold, color: colors.blue });
    drawWrappedText(page, item.label, fonts, { x: x + 38, y: y + height / 2 + 7, size: 10, font: fonts.bold, maxWidth: width - 50, maxLines: 3, lineHeight: 12 });
  });
}

function drawStory(page: PDFPage, fonts: Fonts, items: GameItem[], box: Box) {
  page.drawText("STORY SPARKS", { x: box.x, y: box.y + box.height - 8, size: 8, font: fonts.bold, color: colors.coral });
  items.forEach((item, index) => {
    const x = box.x + (index % 2) * (box.width / 2 + 4);
    const y = box.y + box.height - 50 - Math.floor(index / 2) * 57;
    page.drawRectangle({ x, y, width: box.width / 2 - 8, height: 43, color: index % 2 ? colors.greenSoft : colors.blueSoft });
    drawWrappedText(page, `${item.label}: ${item.clue}`, fonts, { x: x + 9, y: y + 28, size: 7.5, maxWidth: box.width / 2 - 26, maxLines: 3, lineHeight: 9, color: colors.ink });
  });
  page.drawText("WRITE OR DRAW", { x: box.x, y: box.y + 115, size: 8, font: fonts.bold, color: colors.green });
  for (let index = 0; index < 7; index += 1) {
    page.drawLine({ start: { x: box.x, y: box.y + 94 - index * 15 }, end: { x: box.x + box.width, y: box.y + 94 - index * 15 }, thickness: 0.7, color: colors.line });
  }
}

function drawGame(page: PDFPage, fonts: Fonts, activity: Activity, age: number, frame: Box, context: string) {
  const labels: Record<string, string> = {
    coloring: "Coloring and tracing",
    drawing: "Drawing studio",
    crossword: "Mini crossword",
    word_search: "Word search",
    maze: "Route maze",
    matching: "Match-up",
    bingo: "Explorer bingo",
    spot_the_difference: "Spot 3 differences",
    codebreaker: "Codebreaker",
    map_puzzle: "Route-planning challenge",
    scavenger_hunt: "Scavenger hunt",
    quiz: "Quick quiz",
    story: "Story studio",
  };
  const box = drawGameFrame(page, fonts, labels[activity.gameType] || "Travel game", frame);
  switch (activity.gameType) {
    case "coloring":
      drawTraceBoard(page, fonts, activity, box, true, context);
      break;
    case "drawing":
      drawTraceBoard(page, fonts, activity, box, false, context);
      break;
    case "word_search":
      drawWordSearch(page, fonts, activity, age, box);
      break;
    case "crossword":
      drawCrossword(page, fonts, activity, box);
      break;
    case "maze":
      drawMazeGame(page, fonts, activity, age, box);
      break;
    case "matching":
      drawMatching(page, fonts, activity.items, box);
      break;
    case "bingo":
      drawBingo(page, fonts, activity.items, box);
      break;
    case "spot_the_difference":
      drawDifferences(page, fonts, box);
      break;
    case "codebreaker":
      drawCodebreaker(page, fonts, activity.items, box);
      break;
    case "map_puzzle":
      drawMap(page, fonts, activity, age, box);
      break;
    case "scavenger_hunt":
      drawChecklist(page, fonts, activity.items, box);
      break;
    case "quiz":
      drawQuiz(page, fonts, activity.items, box);
      break;
    default:
      drawStory(page, fonts, activity.items, box);
  }
}

function drawActivityPage(
  document: PDFDocument,
  fonts: Fonts,
  booklet: GeneratedBookletData,
  activity: Activity,
  dayIndex: number,
  activityIndex: number,
  pageNumber: number,
  totalPages: number,
) {
  const day = booklet.dayPlans[dayIndex];
  const accent = activityIndex === 0 ? colors.coral : colors.blue;
  const page = drawPageBase(document, fonts, `Day ${day.day}`, pageNumber, totalPages, accent);
  drawPill(page, `DAY ${day.day} / GAME ${activityIndex + 1} OF 2`, fonts, MARGIN, 765, activityIndex === 0 ? colors.coralSoft : colors.blueSoft, accent);
  drawWrappedText(page, day.theme, fonts, {
    x: MARGIN,
    y: 735,
    size: 10,
    font: fonts.bold,
    color: colors.muted,
    maxWidth: PAGE_WIDTH - MARGIN * 2,
    maxLines: 1,
  });
  const titleSize = fitWrappedTextSize(
    activity.title,
    fonts.bold,
    PAGE_WIDTH - MARGIN * 2,
    24,
    17,
    2,
  );
  drawWrappedText(page, activity.title, fonts, {
    x: MARGIN,
    y: 697,
    size: titleSize,
    font: fonts.bold,
    color: colors.ink,
    lineHeight: titleSize * 1.12,
    maxWidth: PAGE_WIDTH - MARGIN * 2,
    maxLines: 2,
  });
  drawPill(page, activity.kind, fonts, MARGIN, 623, colors.yellowSoft, colors.ink);
  drawWrappedText(page, activity.body, fonts, {
    x: MARGIN,
    y: 599,
    size: 9,
    lineHeight: 12,
    maxWidth: PAGE_WIDTH - MARGIN * 2,
    maxLines: 4,
    color: colors.muted,
  });

  drawGame(page, fonts, activity, booklet.age, {
    x: MARGIN,
    y: 154,
    width: PAGE_WIDTH - MARGIN * 2,
    height: 388,
  }, day.theme);

  page.drawRectangle({
    x: MARGIN,
    y: 61,
    width: PAGE_WIDTH - MARGIN * 2,
    height: 72,
    color: activityIndex === 0 ? colors.coralSoft : colors.greenSoft,
  });
  page.drawText("MY FIELD NOTE", {
    x: MARGIN + 14,
    y: 111,
    size: 7,
    font: fonts.bold,
    color: accent,
  });
  drawWrappedText(page, activity.prompt, fonts, {
    x: MARGIN + 14,
    y: 90,
    size: 9,
    font: fonts.bold,
    maxWidth: PAGE_WIDTH - MARGIN * 2 - 28,
    maxLines: 2,
    lineHeight: 12,
  });
}

function answerFor(activity: Activity, age: number) {
  switch (activity.gameType) {
    case "word_search":
    case "crossword":
      return activity.items.map((item) => normalizePuzzleWord(item.label)).filter(Boolean).join(" / ");
    case "matching":
      return "1-D / 2-C / 3-B / 4-A";
    case "codebreaker":
      return normalizePuzzleWord(activity.items[0]?.label || "TRIP", 12);
    case "maze":
      return "One connected route runs from the green dot to the coral dot.";
    case "map_puzzle": {
      const puzzle = createRoutePuzzle(`${activity.title}|${activity.items.map((item) => item.label).join("|")}`, age);
      return `One shortest route visits stops ${puzzle.solutionStopOrder.join("-")} in ${puzzle.minimumStreets} streets; an equal-length order may also work.`;
    }
    case "spot_the_difference":
      return "Sun position and size / roof shape / one tree disappears.";
    case "quiz":
      return "Ask for evidence from the place; discuss more than one possible answer.";
    default:
      return "Open-ended: celebrate a specific local detail.";
  }
}

function drawAnswerKey(
  document: PDFDocument,
  fonts: Fonts,
  booklet: GeneratedBookletData,
  pageNumber: number,
  totalPages: number,
) {
  const page = drawPageBase(document, fonts, "Grown-up answer notes", pageNumber, totalPages, colors.yellow);
  page.drawText("GROWN-UP ANSWER NOTES", { x: MARGIN, y: 775, size: 10, font: fonts.bold, color: colors.coral });
  page.drawText("A quick peek for helpful humans", { x: MARGIN, y: 735, size: 26, font: fonts.bold, color: colors.ink });
  drawWrappedText(page, "Keep this page tucked away until the child has had a proper go. Observation and imagination pages do not have one perfect answer.", fonts, {
    x: MARGIN,
    y: 697,
    size: 10,
    lineHeight: 14,
    maxWidth: PAGE_WIDTH - MARGIN * 2,
    maxLines: 3,
    color: colors.muted,
  });
  const entries = booklet.dayPlans.flatMap((day) =>
    day.activities.map((activity, index) => ({ day: day.day, index, activity })),
  );
  const rowsPerColumn = Math.ceil(entries.length / 2);
  const columnWidth = (PAGE_WIDTH - MARGIN * 2 - 18) / 2;
  const rowHeight = Math.min(47, 555 / Math.max(1, rowsPerColumn));
  entries.forEach((entry, index) => {
    const column = Math.floor(index / rowsPerColumn);
    const row = index % rowsPerColumn;
    const x = MARGIN + column * (columnWidth + 18);
    const y = 630 - row * rowHeight;
    page.drawText(`DAY ${entry.day}.${entry.index + 1}`, { x, y, size: 7, font: fonts.bold, color: entry.index ? colors.blue : colors.coral });
    drawWrappedText(page, entry.activity.title, fonts, {
      x: x + 48,
      y: y + 2,
      size: 8,
      font: fonts.bold,
      maxWidth: columnWidth - 48,
      maxLines: 1,
    });
    drawWrappedText(page, answerFor(entry.activity, booklet.age), fonts, {
      x,
      y: y - 15,
      size: 7,
      maxWidth: columnWidth,
      maxLines: 2,
      lineHeight: 9,
      color: colors.muted,
    });
    page.drawLine({ start: { x, y: y - rowHeight + 8 }, end: { x: x + columnWidth, y: y - rowHeight + 8 }, thickness: 0.6, color: colors.softLine });
  });
}

function drawMemoryPage(
  document: PDFDocument,
  fonts: Fonts,
  booklet: GeneratedBookletData,
  pageNumber: number,
  totalPages: number,
) {
  const page = drawPageBase(document, fonts, "Memory museum", pageNumber, totalPages, colors.blue);
  page.drawText("MEMORY MUSEUM", { x: MARGIN, y: 775, size: 10, font: fonts.bold, color: colors.blue });
  drawWrappedText(page, `${booklet.destination} moments worth keeping`, fonts, { x: MARGIN, y: 733, size: 27, font: fonts.bold, maxWidth: PAGE_WIDTH - MARGIN * 2, maxLines: 2, lineHeight: 30 });
  drawWrappedText(page, "Draw the details that made your family stop, laugh, taste, listen, or look twice.", fonts, { x: MARGIN, y: 660, size: 10, maxWidth: PAGE_WIDTH - MARGIN * 2, maxLines: 2, lineHeight: 14, color: colors.muted });
  const prompts = ["Smallest detail", "Biggest surprise", "Kindest moment", "A sound or flavor"];
  const gap = 14;
  const width = (PAGE_WIDTH - MARGIN * 2 - gap) / 2;
  const height = 230;
  prompts.forEach((prompt, index) => {
    const x = MARGIN + (index % 2) * (width + gap);
    const y = 390 - Math.floor(index / 2) * (height + gap);
    page.drawRectangle({ x, y, width, height, color: colors.white, borderColor: colors.line, borderWidth: 1 });
    page.drawRectangle({ x, y: y + height - 35, width, height: 35, color: index % 2 ? colors.greenSoft : colors.yellowSoft });
    page.drawText(prompt.toUpperCase(), { x: x + 13, y: y + height - 22, size: 8, font: fonts.bold, color: index % 2 ? colors.green : colors.coral });
  });
}

function drawCertificate(
  document: PDFDocument,
  fonts: Fonts,
  booklet: GeneratedBookletData,
  pageNumber: number,
  totalPages: number,
) {
  const page = drawPageBase(document, fonts, "Certificate", pageNumber, totalPages, colors.coral);
  page.drawRectangle({ x: 38, y: 62, width: PAGE_WIDTH - 76, height: PAGE_HEIGHT - 116, borderColor: colors.coral, borderWidth: 2 });
  page.drawRectangle({ x: 47, y: 71, width: PAGE_WIDTH - 94, height: PAGE_HEIGHT - 134, borderColor: colors.yellow, borderWidth: 1 });
  page.drawText("OFFICIAL TRIPQUEST CERTIFICATE", {
    x: centeredX("OFFICIAL TRIPQUEST CERTIFICATE", fonts.bold, 10, { x: 0, y: 0, width: PAGE_WIDTH, height: 0 }),
    y: 724,
    size: 10,
    font: fonts.bold,
    color: colors.coral,
  });
  page.drawCircle({ x: PAGE_WIDTH / 2, y: 630, size: 52, color: colors.yellowSoft, borderColor: colors.yellow, borderWidth: 2 });
  page.drawCircle({ x: PAGE_WIDTH / 2, y: 630, size: 34, color: colors.coral });
  page.drawText("TQ", {
    x: PAGE_WIDTH / 2 - fonts.bold.widthOfTextAtSize("TQ", 22) / 2,
    y: 622,
    size: 22,
    font: fonts.bold,
    color: colors.white,
  });
  page.drawText("CERTIFIES THAT", { x: centeredX("CERTIFIES THAT", fonts.bold, 9, { x: 0, y: 0, width: PAGE_WIDTH, height: 0 }), y: 538, size: 9, font: fonts.bold, color: colors.muted });
  drawDottedLine(page, 112, PAGE_WIDTH - 112, 487, colors.line, 5, 4);
  page.drawText("EXPLORER NAME", { x: centeredX("EXPLORER NAME", fonts.regular, 8, { x: 0, y: 0, width: PAGE_WIDTH, height: 0 }), y: 467, size: 8, font: fonts.regular, color: colors.muted });
  page.drawText("IS NOW A", { x: centeredX("IS NOW A", fonts.bold, 9, { x: 0, y: 0, width: PAGE_WIDTH, height: 0 }), y: 418, size: 9, font: fonts.bold, color: colors.muted });
  const title = `${pdfText(booklet.destination)} Explorer`;
  const titleSize = fitTextSize(title, fonts.bold, PAGE_WIDTH - 130, 30, 20);
  page.drawText(title, { x: centeredX(title, fonts.bold, titleSize, { x: 0, y: 0, width: PAGE_WIDTH, height: 0 }), y: 371, size: titleSize, font: fonts.bold, color: colors.ink });
  drawWrappedText(page, "Awarded for curious noticing, kind traveling, brave questions, and excellent pencil work.", fonts, { x: 105, y: 320, size: 11, font: fonts.regular, maxWidth: PAGE_WIDTH - 210, maxLines: 3, lineHeight: 15, color: colors.muted });
  drawDottedLine(page, 82, 250, 192, colors.line, 5, 4);
  drawDottedLine(page, PAGE_WIDTH - 250, PAGE_WIDTH - 82, 192, colors.line, 5, 4);
  page.drawText("GROWN-UP SIGNATURE", { x: 102, y: 173, size: 7, font: fonts.bold, color: colors.muted });
  page.drawText("DATE", { x: PAGE_WIDTH - 190, y: 173, size: 7, font: fonts.bold, color: colors.muted });
  page.drawText(`AGE ${booklet.age} EDITION  /  ${booklet.days} ${booklet.days === 1 ? "DAY" : "DAYS"}`, { x: centeredX(`AGE ${booklet.age} EDITION  /  ${booklet.days} ${booklet.days === 1 ? "DAY" : "DAYS"}`, fonts.bold, 8, { x: 0, y: 0, width: PAGE_WIDTH, height: 0 }), y: 111, size: 8, font: fonts.bold, color: colors.green });
}

function drawFamilyRelayPage(
  document: PDFDocument,
  fonts: Fonts,
  booklet: GeneratedBookletData,
  pack: FamilyPackContext,
  pageNumber: number,
  totalPages: number,
) {
  const page = drawPageBase(document, fonts, "Family relay", pageNumber, totalPages, colors.coral);
  page.drawText("FAMILY RELAY & INTEREST LENS", { x: MARGIN, y: 775, size: 10, font: fonts.bold, color: colors.coral });
  drawWrappedText(page, "A fresh handoff for every day", fonts, {
    x: MARGIN,
    y: 733,
    size: 27,
    font: fonts.bold,
    maxWidth: PAGE_WIDTH - MARGIN * 2,
    maxLines: 2,
    lineHeight: 30,
  });
  drawWrappedText(page, "Use this page as the parent map. Interests get a real moment on the day they are scheduled, while the family relay changes jobs so nobody is stuck doing the same thing.", fonts, {
    x: MARGIN,
    y: 665,
    size: 10,
    maxWidth: PAGE_WIDTH - MARGIN * 2,
    maxLines: 3,
    lineHeight: 14,
    color: colors.muted,
  });

  const columns = 2;
  const rowsPerColumn = Math.ceil(booklet.dayPlans.length / columns);
  const columnGap = 14;
  const columnWidth = (PAGE_WIDTH - MARGIN * 2 - columnGap) / columns;
  const rowHeight = Math.min(72, 480 / Math.max(1, rowsPerColumn));
  booklet.dayPlans.forEach((day, index) => {
    const column = Math.floor(index / rowsPerColumn);
    const row = index % rowsPerColumn;
    const x = MARGIN + column * (columnWidth + columnGap);
    const y = 584 - row * rowHeight;
    page.drawRectangle({
      x,
      y: y - rowHeight + 8,
      width: columnWidth,
      height: rowHeight - 8,
      color: index % 2 ? colors.greenSoft : colors.yellowSoft,
      borderColor: colors.softLine,
      borderWidth: 0.8,
    });
    page.drawText(`DAY ${day.day}`, { x: x + 10, y: y - 14, size: 7, font: fonts.bold, color: colors.coral });
    drawWrappedText(page, day.theme, fonts, {
      x: x + 51,
      y: y - 14,
      size: 8,
      font: fonts.bold,
      maxWidth: columnWidth - 61,
      maxLines: 2,
      lineHeight: 9,
    });
    const interest = day.interestHook ? `INTEREST: ${day.interestHook}` : "INTEREST: Notice one detail that connects to a child's world.";
    drawWrappedText(page, interest, fonts, {
      x: x + 10,
      y: y - 34,
      size: 6.8,
      maxWidth: columnWidth - 20,
      maxLines: 2,
      lineHeight: 8,
      color: colors.blue,
    });
    drawWrappedText(page, day.siblingMission || "RELAY: Share one observation before the next stop.", fonts, {
      x: x + 10,
      y: y - 51,
      size: 6.8,
      maxWidth: columnWidth - 20,
      maxLines: 2,
      lineHeight: 8,
      color: colors.muted,
    });
  });

  page.drawText("CHILDREN IN THIS RELAY", { x: MARGIN, y: 72, size: 8, font: fonts.bold, color: colors.green });
  drawWrappedText(page, pack.children.map((child, index) => `${pdfText(familyChildDisplayName(child, index))} (age ${child.age})`).join(" / "), fonts, {
    x: MARGIN,
    y: 54,
    size: 8,
    maxWidth: PAGE_WIDTH - MARGIN * 2,
    maxLines: 2,
    lineHeight: 10,
    color: colors.muted,
  });
}

function familyRole(child: FamilyChild, index: number) {
  const role = child.interests.some((interest) => /draw|art|paint|craft|sketch/i.test(interest))
    ? "Sketcher: turn one local shape into an original line"
    : [
        "Scout: spot one local detail and point it out",
        "Storyteller: explain what one clue might mean",
        "Evidence keeper: record the proof for the family",
        "Route keeper: choose the next safe stop with a grown-up",
        "Question maker: ask one curious why-or-how question",
        "Presenter: share the family answer",
      ][index % 6];
  const interests = child.interests.slice(0, 2).map(pdfText).join(", ");
  return interests ? `${role}. Interest missions: ${interests}.` : role;
}

function mechanicPrompt(mechanic: QuestMechanic, theme: string) {
  const subject = pdfText(theme);
  switch (mechanic) {
    case "spot": return `Spot one tiny detail at ${subject} that most visitors might miss.`;
    case "draw": return `Draw the shape, texture, or pattern that best remembers ${subject}.`;
    case "count": return `Count four examples near ${subject}; compare which one is biggest or brightest.`;
    case "talk": return `Tell a grown-up one respectful question about what you notice at ${subject}.`;
    case "imagine": return `Imagine a local object at ${subject} could speak. Give it one helpful sentence.`;
    case "navigate": return `Choose the safest family route around ${subject}; mark one useful landmark.`;
    case "photograph": return `With permission, frame one photo of a pattern or detail connected to ${subject}.`;
    case "solve": return `Solve the clue, then point to the real evidence at ${subject}.`;
    case "move": return `Make a quiet three-step movement inspired by the shapes or rhythm at ${subject}.`;
    default: return `Combine your clues and make one family answer about ${subject}.`;
  }
}

function drawFamilyMissionPage(
  document: PDFDocument,
  fonts: Fonts,
  booklet: GeneratedBookletData,
  pack: FamilyPackContext,
  pageNumber: number,
  totalPages: number,
) {
  const page = drawPageBase(document, fonts, "Family pack", pageNumber, totalPages, colors.green);
  page.drawText("FAMILY MISSION MAP", { x: MARGIN, y: 775, size: 10, font: fonts.bold, color: colors.green });
  drawWrappedText(page, "One trip, many ways to play", fonts, {
    x: MARGIN, y: 733, size: 28, font: fonts.bold, maxWidth: PAGE_WIDTH - MARGIN * 2, maxLines: 2, lineHeight: 31,
  });
  drawWrappedText(page, `This ${pdfText(booklet.destination)} pack gives every explorer a useful role. Share the same place, then let each child notice it at the right level.`, fonts, {
    x: MARGIN, y: 660, size: 10, maxWidth: PAGE_WIDTH - MARGIN * 2, maxLines: 3, lineHeight: 14, color: colors.muted,
  });

  page.drawText("EXPLORER ROLES", { x: MARGIN, y: 600, size: 9, font: fonts.bold, color: colors.coral });
  const childRows = Math.min(pack.children.length, 6);
  const roleRowHeight = 48;
  pack.children.slice(0, childRows).forEach((child, index) => {
    const y = 560 - index * roleRowHeight;
    page.drawRectangle({ x: MARGIN, y: y - 19, width: PAGE_WIDTH - MARGIN * 2, height: 38, color: index % 2 ? colors.greenSoft : colors.white, borderColor: colors.softLine, borderWidth: 0.7 });
    page.drawCircle({ x: MARGIN + 20, y, size: 11, color: index % 2 ? colors.green : colors.blue });
    page.drawText(String(index + 1), { x: MARGIN + 17.5, y: y - 3, size: 7, font: fonts.bold, color: colors.white });
    const label = `${index === 0 ? "LEAD / " : ""}${pdfText(familyChildDisplayName(child, index))} / AGE ${child.age}`;
    const labelSize = fitTextSize(label, fonts.bold, 134, 8.5, 6.5);
    page.drawText(label, { x: MARGIN + 40, y: y + 2, size: labelSize, font: fonts.bold, color: colors.ink });
    drawWrappedText(page, familyRole(child, index), fonts, { x: MARGIN + 188, y: y + 5, size: 7.5, maxWidth: PAGE_WIDTH - MARGIN * 2 - 200, maxLines: 3, lineHeight: 8.5, color: colors.muted });
  });

  const timelineY = 560 - childRows * roleRowHeight - 22;
  page.drawText("TRIP THREAD", { x: MARGIN, y: timelineY, size: 9, font: fonts.bold, color: colors.blue });
  const eventLines = Array.from({ length: booklet.days }, (_, index) => {
    const dayEvents = pack.events.filter((event) => event.day === index + 1).map((event) => `${event.title}`).join(" / ");
    return `DAY ${index + 1}: ${dayEvents || booklet.dayPlans[index]?.theme || "Open adventure"}`;
  });
  const timelineColumns = eventLines.length > 7 ? 2 : 1;
  const timelineRows = Math.ceil(eventLines.length / timelineColumns);
  const timelineGap = 16;
  const timelineWidth = (PAGE_WIDTH - MARGIN * 2 - timelineGap * (timelineColumns - 1)) / timelineColumns;
  const timelineRowHeight = Math.min(24, Math.max(17, (timelineY - 92) / Math.max(1, timelineRows)));
  eventLines.forEach((line, index) => {
    const column = Math.floor(index / timelineRows);
    const row = index % timelineRows;
    drawWrappedText(page, line, fonts, {
      x: MARGIN + column * (timelineWidth + timelineGap),
      y: timelineY - 24 - row * timelineRowHeight,
      size: 7.5,
      font: fonts.bold,
      maxWidth: timelineWidth,
      maxLines: 1,
      color: index % 2 ? colors.muted : colors.ink,
    });
  });
}

function drawMissionCardsPage(
  document: PDFDocument,
  fonts: Fonts,
  booklet: GeneratedBookletData,
  pack: FamilyPackContext,
  pageNumber: number,
  totalPages: number,
) {
  const page = drawPageBase(document, fonts, "Mission cards", pageNumber, totalPages, colors.blue);
  page.drawText("CUT-OUT MISSION CARDS", { x: MARGIN, y: 775, size: 10, font: fonts.bold, color: colors.blue });
  drawWrappedText(page, "Pick one when the day needs a spark", fonts, { x: MARGIN, y: 733, size: 26, font: fonts.bold, maxWidth: PAGE_WIDTH - MARGIN * 2, maxLines: 2, lineHeight: 29 });
  drawWrappedText(page, "Keep the cards together or cut along the lines. The goal is to notice, connect, and enjoy the place, not to finish everything.", fonts, { x: MARGIN, y: 665, size: 10, maxWidth: PAGE_WIDTH - MARGIN * 2, maxLines: 2, lineHeight: 14, color: colors.muted });
  const cards = Array.from({ length: 4 }, (_, index) => {
    const dayIndex = index % Math.max(1, booklet.dayPlans.length);
    const day = booklet.dayPlans[dayIndex];
    const plan = pack.mechanicsByDay[dayIndex]?.mechanics || ["spot"];
    const mechanic = plan[index % plan.length] || "spot";
    return { day, mechanic };
  });
  const gap = 16;
  const width = (PAGE_WIDTH - MARGIN * 2 - gap) / 2;
  const height = 210;
  cards.forEach(({ day, mechanic }, index) => {
    const x = MARGIN + (index % 2) * (width + gap);
    const y = 430 - Math.floor(index / 2) * (height + gap);
    page.drawRectangle({ x, y, width, height, color: colors.white, borderColor: colors.ink, borderWidth: 1.2 });
    page.drawRectangle({ x, y: y + height - 34, width, height: 34, color: index % 2 ? colors.blueSoft : colors.yellowSoft });
    page.drawText(`DAY ${day.day} / ${mechanicLabel(mechanic).toUpperCase()}`, { x: x + 12, y: y + height - 22, size: 8, font: fonts.bold, color: colors.ink });
    drawWrappedText(page, day.theme, fonts, { x: x + 12, y: y + height - 58, size: 12, font: fonts.bold, maxWidth: width - 24, maxLines: 2, lineHeight: 14 });
    drawWrappedText(page, mechanicPrompt(mechanic, day.theme), fonts, { x: x + 12, y: y + height - 105, size: 9, maxWidth: width - 24, maxLines: 5, lineHeight: 12, color: colors.muted });
    drawDottedLine(page, x + 12, x + width - 12, y + 24, colors.line, 4, 4);
  });
}

function drawBadgeTrackerPage(
  document: PDFDocument,
  fonts: Fonts,
  booklet: GeneratedBookletData,
  pageNumber: number,
  totalPages: number,
) {
  const page = drawPageBase(document, fonts, "Badge tracker", pageNumber, totalPages, colors.coral);
  page.drawText("BADGE TRACKER", { x: MARGIN, y: 775, size: 10, font: fonts.bold, color: colors.coral });
  drawWrappedText(page, "Collect the way you traveled", fonts, { x: MARGIN, y: 733, size: 27, font: fonts.bold, maxWidth: PAGE_WIDTH - MARGIN * 2, maxLines: 2, lineHeight: 30 });
  drawWrappedText(page, "Give a tick, sticker, or tiny drawing to each badge when someone in the family earns it.", fonts, { x: MARGIN, y: 665, size: 10, maxWidth: PAGE_WIDTH - MARGIN * 2, maxLines: 2, lineHeight: 14, color: colors.muted });
  const badges = ["Keen Observer", "Kind Traveler", "Brave Taster", "Pattern Finder", "Route Helper", "Story Keeper", "Team Player", "Local Detail"];
  const gap = 14;
  const width = (PAGE_WIDTH - MARGIN * 2 - gap) / 2;
  badges.forEach((badge, index) => {
    const x = MARGIN + (index % 2) * (width + gap);
    const y = 425 - Math.floor(index / 2) * 75;
    page.drawRectangle({ x, y, width, height: 57, color: index % 2 ? colors.greenSoft : colors.coralSoft, borderColor: colors.softLine, borderWidth: 0.8 });
    page.drawCircle({ x: x + 25, y: y + 28, size: 14, color: index % 2 ? colors.green : colors.coral });
    page.drawText("OK", { x: x + 17, y: y + 23, size: 8, font: fonts.bold, color: colors.white });
    page.drawText(badge, { x: x + 49, y: y + 34, size: 9, font: fonts.bold, color: colors.ink });
    page.drawText("earned on", { x: x + 49, y: y + 19, size: 7, font: fonts.regular, color: colors.muted });
    drawDottedLine(page, x + 96, x + width - 12, y + 19, colors.line, 3, 4);
  });
  page.drawText("FAMILY REWARD", { x: MARGIN, y: 100, size: 9, font: fonts.bold, color: colors.blue });
  drawWrappedText(page, `When the family collects ${Math.min(8, Math.max(3, booklet.days + 1))} badges, choose a shared reward: a favorite snack, a sunset story, or one extra page in the ${pdfText(booklet.destination)} memory museum.`, fonts, { x: MARGIN, y: 76, size: 9, maxWidth: PAGE_WIDTH - MARGIN * 2, maxLines: 3, lineHeight: 12, color: colors.muted });
}

export function bookletPdfPageCount(booklet: GeneratedBookletData, includeFamilyPack = false) {
  return booklet.dayPlans.length * 2 + 5 + (includeFamilyPack ? 4 : 0);
}

export function bookletPdfFilename(booklet: Pick<GeneratedBookletData, "destination" | "age">) {
  const destination = pdfText(booklet.destination)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "destination";
  return `tripquest-${destination}-age-${booklet.age}.pdf`;
}

export function familyPackPdfFilename(booklet: Pick<GeneratedBookletData, "destination" | "age">) {
  return bookletPdfFilename(booklet).replace(/\.pdf$/i, "-family-pack.pdf");
}

export async function createBookletPdf(inputBooklet: GeneratedBookletData, familyPack?: FamilyPackContext) {
  const booklet: GeneratedBookletData = {
    ...inputBooklet,
    ...validateBookletDraft(inputBooklet, inputBooklet.days, inputBooklet.age),
  };
  const document = await PDFDocument.create();
  const fonts: Fonts = {
    regular: await document.embedFont(StandardFonts.Helvetica),
    bold: await document.embedFont(StandardFonts.HelveticaBold),
    mono: await document.embedFont(StandardFonts.Courier),
    monoBold: await document.embedFont(StandardFonts.CourierBold),
  };
  const totalPages = bookletPdfPageCount(booklet, Boolean(familyPack));
  document.setTitle(`${pdfText(booklet.destination)} Explorer - Age ${booklet.age}`);
  document.setAuthor("TripQuest");
  document.setSubject("Printable family travel activity booklet");
  document.setKeywords(["travel", "children", "activity booklet", pdfText(booklet.destination)]);
  document.setCreator("TripQuest Kids");
  document.setProducer("TripQuest Kids");
  document.setCreationDate(new Date(booklet.generatedAt));
  document.setModificationDate(new Date());

  drawCover(document, fonts, booklet, totalPages, familyPack);
  drawGuide(document, fonts, booklet, totalPages, familyPack);
  let pageNumber = 3;
  booklet.dayPlans.forEach((day, dayIndex) => {
    day.activities.forEach((activity, activityIndex) => {
      drawActivityPage(
        document,
        fonts,
        booklet,
        activity,
        dayIndex,
        activityIndex,
        pageNumber,
        totalPages,
      );
      pageNumber += 1;
    });
  });
  drawAnswerKey(document, fonts, booklet, pageNumber, totalPages);
  pageNumber += 1;
  drawMemoryPage(document, fonts, booklet, pageNumber, totalPages);
  pageNumber += 1;
  drawCertificate(document, fonts, booklet, pageNumber, totalPages);
  if (familyPack) {
    pageNumber += 1;
    drawFamilyRelayPage(document, fonts, booklet, familyPack, pageNumber, totalPages);
    pageNumber += 1;
    drawFamilyMissionPage(document, fonts, booklet, familyPack, pageNumber, totalPages);
    pageNumber += 1;
    drawMissionCardsPage(document, fonts, booklet, familyPack, pageNumber, totalPages);
    pageNumber += 1;
    drawBadgeTrackerPage(document, fonts, booklet, pageNumber, totalPages);
  }

  return document.save();
}
