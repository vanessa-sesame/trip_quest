import {
  PDFDocument,
  StandardFonts,
  concatTransformationMatrix,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
  type RGB,
} from "pdf-lib";
import type { Activity, GameItem } from "./booklet.ts";
import { pairEligibleGameTypes, wideOnlyGameTypes } from "./booklet.ts";
import {
  coloringIllustrationSpecs,
  coloringPageSpec,
  coloringSceneFor,
  coloringVariantFor,
  curatedColoringImagePath,
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
  FAMILY_BADGES,
  familyChildDisplayName,
  familyRoleDescription,
  mechanicLabel,
  mechanicMissionPrompt,
  type FamilyChild,
  type ItineraryEvent,
  type QuestMechanic,
} from "./family.ts";
import { assertBookletQa } from "./booklet-qa.ts";
import { bookletDayPageEntries, bookletPageTotal, dayGameActivities } from "./booklet-pages.ts";

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

export type ColoringImageResolver = (path: string) => Promise<Uint8Array | null>;
type ColoringArtwork = Record<string, PDFImage>;

function coloringArtworkKey(activity: Activity, context: string) {
  const scene = coloringSceneFor(activity, context);
  return activity.illustrationPath || curatedColoringImagePath(activity, context) || scene;
}

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

  const coverExplorerNames = familyPack?.children.length
    ? familyPack.children.map((child, index) => pdfText(familyChildDisplayName(child, index))).join(" / ")
    : "";
  page.drawText(coverExplorerNames ? "MADE FOR" : "DRAW YOUR EXPLORER MARK", {
    x: MARGIN,
    y: 345,
    size: 9,
    font: fonts.bold,
    color: colors.muted,
  });
  if (coverExplorerNames) {
    drawWrappedText(page, coverExplorerNames, fonts, { x: MARGIN, y: 322, size: 11, font: fonts.bold, maxWidth: 236, maxLines: 2, lineHeight: 13, color: colors.ink });
  } else {
    drawDottedLine(page, MARGIN, 280, 316, colors.line, 5, 4);
  }
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
  const page = drawPageBase(document, fonts, "Quick note for grown-ups", 2, totalPages, colors.green);
  page.drawText("A QUICK NOTE FOR GROWN-UPS", {
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

  // Sized for the 14-day worst case: the day-overview list above can reach
  // down to about y=163 (rowsPerColumn=7 at the 300pt band cap), so this box
  // stays below that with the same ~15pt cushion the original single-line
  // box used, just taller to fit what-to-bring / how-it-works / why-it's-worth-it.
  const packTop = 148;
  const packBottom = 52;
  page.drawRectangle({
    x: MARGIN,
    y: packBottom,
    width: PAGE_WIDTH - MARGIN * 2,
    height: packTop - packBottom,
    borderColor: colors.softLine,
    borderWidth: 1,
    color: colors.white,
  });
  page.drawText(familyPack?.children.length ? "FAMILY EXPLORERS" : "PACK", { x: MARGIN + 15, y: packTop - 22, size: 8, font: fonts.bold, color: colors.coral });
  drawWrappedText(
    page,
    familyPack?.children.length
      ? `${familyPack.children.map((child, index) => `${pdfText(familyChildDisplayName(child, index))} (age ${child.age})`).join(" / ")} / same place, different ways to play`
      : `What to bring: pencils or colored pencils, this booklet, and about ${getAgeBand(booklet.age).minutes} unhurried minutes at each stop.`,
    fonts,
    {
      x: MARGIN + 15,
      y: packTop - 35,
      size: 8.5,
      maxWidth: PAGE_WIDTH - MARGIN * 2 - 30,
      maxLines: 1,
      color: colors.muted,
    },
  );
  drawWrappedText(
    page,
    "How it works: a quick game while you wait in line, two hands-on games once you arrive, then a calm page to unwind after — no reading required until your child is ready.",
    fonts,
    {
      x: MARGIN + 15,
      y: packTop - 51,
      size: 8,
      lineHeight: 11,
      maxWidth: PAGE_WIDTH - MARGIN * 2 - 30,
      maxLines: 2,
      color: colors.ink,
    },
  );
  drawWrappedText(
    page,
    "Real places become real adventures — that's the whole idea.",
    fonts,
    {
      x: MARGIN + 15,
      y: packTop - 78,
      size: 8.5,
      font: fonts.bold,
      maxWidth: PAGE_WIDTH - MARGIN * 2 - 30,
      maxLines: 1,
      color: colors.green,
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

function drawColoringVariant(page: PDFPage, scene: Box, variant: ColoringScene, variation: ReturnType<typeof coloringVariantFor>) {
  if (variation === 0) return;
  const { x, y, width, height } = scene;
  const ground = y + 24;
  const outline = colors.ink;
  const detail = colors.muted;
  const accent = colors.coral;
  if (variant === "supertree") {
    if (variation === 1) {
      page.drawEllipse({ x: x + width / 2, y: ground + 18, xScale: 42, yScale: 10, borderColor: accent, borderWidth: 1.4 });
      [x + 62, x + width - 62].forEach((treeX) => page.drawLine({ start: { x: treeX - 15, y: ground }, end: { x: treeX, y: ground + 28 }, color: outline, thickness: 1.3 }));
    } else {
      [0, 1, 2, 3].forEach((index) => {
        const waveX = x + 42 + index * 74;
        page.drawLine({ start: { x: waveX, y: ground + 9 }, end: { x: waveX + 18, y: ground + 13 }, color: detail, thickness: 1 });
        page.drawLine({ start: { x: waveX + 18, y: ground + 13 }, end: { x: waveX + 36, y: ground + 9 }, color: detail, thickness: 1 });
      });
    }
    return;
  }
  if (variant === "garden") {
    if (variation === 1) {
      page.drawRectangle({ x: x + width / 2 - 42, y: ground, width: 84, height: 62, borderColor: outline, borderWidth: 1.5 });
      page.drawLine({ start: { x: x + width / 2 - 51, y: ground + 62 }, end: { x: x + width / 2, y: ground + 82 }, color: accent, thickness: 1.4 });
      page.drawLine({ start: { x: x + width / 2 + 51, y: ground + 62 }, end: { x: x + width / 2, y: ground + 82 }, color: accent, thickness: 1.4 });
      [x + width / 2 - 22, x + width / 2, x + width / 2 + 22].forEach((stemX) => page.drawLine({ start: { x: stemX, y: ground }, end: { x: stemX, y: ground + 62 }, color: detail, thickness: 1 }));
    } else {
      page.drawEllipse({ x: x + width / 2, y: ground + 16, xScale: 77, yScale: 16, borderColor: detail, borderWidth: 1.2 });
      [0, 1, 2].forEach((index) => page.drawCircle({ x: x + width / 2 - 34 + index * 34, y: ground + 16 + (index % 2) * 7, size: 4, borderColor: accent, borderWidth: 1 }));
    }
    return;
  }
  if (variant === "skyline") {
    const center = x + width - 78;
    if (variation === 1) {
      page.drawCircle({ x: center, y: ground + 62, size: 27, borderColor: outline, borderWidth: 1.5 });
      page.drawLine({ start: { x: center, y: ground + 35 }, end: { x: center, y: ground + 89 }, color: detail, thickness: 1 });
      page.drawLine({ start: { x: center - 27, y: ground + 62 }, end: { x: center + 27, y: ground + 62 }, color: detail, thickness: 1 });
      page.drawLine({ start: { x: center - 19, y: ground + 43 }, end: { x: center + 19, y: ground + 81 }, color: detail, thickness: 1 });
    } else {
      page.drawRectangle({ x: center - 25, y: ground, width: 50, height: 88, borderColor: outline, borderWidth: 1.5 });
      page.drawCircle({ x: center, y: ground + 47, size: 15, borderColor: accent, borderWidth: 1.3 });
      page.drawLine({ start: { x: center, y: ground + 47 }, end: { x: center, y: ground + 58 }, color: detail, thickness: 1 });
      page.drawLine({ start: { x: center, y: ground + 47 }, end: { x: center + 9, y: ground + 43 }, color: detail, thickness: 1 });
    }
    return;
  }
  if (variant === "market") {
    if (variation === 1) {
      [0, 1, 2, 3].forEach((index) => {
        const basketX = x + 94 + index * 54;
        page.drawCircle({ x: basketX, y: ground + 29, size: 8, borderColor: index % 2 ? accent : colors.green, borderWidth: 1.1 });
        page.drawCircle({ x: basketX + 14, y: ground + 29, size: 7, borderColor: colors.yellow, borderWidth: 1.1 });
      });
    } else {
      [0, 1, 2].forEach((index) => {
        const stallX = x + 72 + index * 90;
        page.drawLine({ start: { x: stallX, y: ground + 94 }, end: { x: stallX + 30, y: ground + 112 }, color: accent, thickness: 1.4 });
        page.drawLine({ start: { x: stallX + 30, y: ground + 112 }, end: { x: stallX + 60, y: ground + 94 }, color: accent, thickness: 1.4 });
      });
    }
    return;
  }
  if (variant === "dinosaur") {
    if (variation === 1) {
      page.drawLine({ start: { x: x + width - 106, y: ground }, end: { x: x + width - 90, y: ground + 31 }, color: outline, thickness: 1.4 });
      page.drawLine({ start: { x: x + width - 72, y: ground }, end: { x: x + width - 57, y: ground + 30 }, color: outline, thickness: 1.4 });
      page.drawLine({ start: { x: x + width - 90, y: ground + 31 }, end: { x: x + width - 72, y: ground }, color: detail, thickness: 1.1 });
    } else {
      [0, 1, 2, 3].forEach((index) => page.drawCircle({ x: x + 42 + index * 24, y: ground + 10 + (index % 2) * 4, size: 3.5, borderColor: detail, borderWidth: 1 }));
      [0, 1, 2, 3].forEach((index) => page.drawCircle({ x: x + width - 120 + index * 22, y: ground + 10 + (index % 2) * 4, size: 3.5, borderColor: detail, borderWidth: 1 }));
    }
    return;
  }
  if (variant === "shophouse") {
    if (variation === 1) {
      [x + 70, x + width / 2, x + width - 70].forEach((balconyX) => {
        page.drawLine({ start: { x: balconyX - 22, y: ground + 69 }, end: { x: balconyX + 22, y: ground + 69 }, color: accent, thickness: 1.5 });
        [-14, 0, 14].forEach((offset) => page.drawLine({ start: { x: balconyX + offset, y: ground + 69 }, end: { x: balconyX + offset, y: ground + 51 }, color: detail, thickness: 1 }));
      });
    } else {
      page.drawLine({ start: { x: x + 32, y: ground + 8 }, end: { x: x + width - 32, y: ground + 8 }, color: outline, thickness: 1.5 });
      [x + 82, x + width / 2, x + width - 82].forEach((signX) => page.drawRectangle({ x: signX - 13, y: ground + 12, width: 26, height: 16, borderColor: accent, borderWidth: 1 }));
    }
    return;
  }
  if (variant === "coast") {
    if (variation === 1) {
      page.drawLine({ start: { x: x + width / 2 - 30, y: ground + 45 }, end: { x: x + width / 2, y: ground + 65 }, color: outline, thickness: 1.5 });
      page.drawLine({ start: { x: x + width / 2, y: ground + 65 }, end: { x: x + width / 2 + 30, y: ground + 45 }, color: outline, thickness: 1.5 });
      page.drawLine({ start: { x: x + width / 2, y: ground + 65 }, end: { x: x + width / 2, y: ground + 15 }, color: accent, thickness: 1.2 });
    } else {
      [x + 150, x + 185, x + 220].forEach((shellX, index) => page.drawCircle({ x: shellX, y: ground + 12, size: 5 + index, borderColor: accent, borderWidth: 1 }));
    }
    return;
  }
  if (variation === 1) {
    page.drawLine({ start: { x: x + 34, y: ground + 28 }, end: { x: x + 82, y: ground + 44 }, color: detail, thickness: 1.1 });
    page.drawLine({ start: { x: x + 82, y: ground + 44 }, end: { x: x + 130, y: ground + 28 }, color: detail, thickness: 1.1 });
  } else {
    page.drawCircle({ x: x + width / 2, y: y + height - 30, size: 7, borderColor: accent, borderWidth: 1.2 });
    page.drawLine({ start: { x: x + width / 2, y: y + height - 23 }, end: { x: x + width / 2, y: y + height - 11 }, color: detail, thickness: 1 });
  }
}

function drawColoringScene(page: PDFPage, scene: Box, variant: ColoringScene, variation: ReturnType<typeof coloringVariantFor>) {
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
  const drawPolyline = (
    points: Array<[number, number]>,
    color = colors.ink,
    thickness = 1.4,
    closed = false,
  ) => {
    const linePoints = closed && points.length > 1 ? [...points, points[0]] : points;
    for (let index = 1; index < linePoints.length; index += 1) {
      page.drawLine({
        start: { x: x + linePoints[index - 1][0], y: ground + linePoints[index - 1][1] },
        end: { x: x + linePoints[index][0], y: ground + linePoints[index][1] },
        color,
        thickness,
      });
    }
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
    case "tile": {
      const tileLeft = x + 32;
      const tileBottom = ground + 12;
      const tileWidth = width - 64;
      const tileHeight = 126;
      page.drawRectangle({ x: tileLeft, y: tileBottom, width: tileWidth, height: tileHeight, borderColor: colors.ink, borderWidth: 1.7 });
      page.drawLine({ start: { x: tileLeft, y: tileBottom + 42 }, end: { x: tileLeft + tileWidth, y: tileBottom + 42 }, color: colors.muted, thickness: 1 });
      page.drawLine({ start: { x: tileLeft, y: tileBottom + 84 }, end: { x: tileLeft + tileWidth, y: tileBottom + 84 }, color: colors.muted, thickness: 1 });
      page.drawLine({ start: { x: tileLeft + tileWidth / 4, y: tileBottom }, end: { x: tileLeft + tileWidth / 4, y: tileBottom + tileHeight }, color: colors.muted, thickness: 1 });
      page.drawLine({ start: { x: tileLeft + tileWidth / 2, y: tileBottom }, end: { x: tileLeft + tileWidth / 2, y: tileBottom + tileHeight }, color: colors.muted, thickness: 1 });
      page.drawLine({ start: { x: tileLeft + tileWidth * 0.75, y: tileBottom }, end: { x: tileLeft + tileWidth * 0.75, y: tileBottom + tileHeight }, color: colors.muted, thickness: 1 });
      for (let row = 0; row < 3; row += 1) {
        for (let column = 0; column < 4; column += 1) {
          const centerX = tileLeft + tileWidth * (column + 0.5) / 4;
          const centerY = tileBottom + tileHeight * (row + 0.5) / 3;
          page.drawLine({ start: { x: centerX, y: centerY + 15 }, end: { x: centerX + 15, y: centerY }, color: colors.ink, thickness: 1.3 });
          page.drawLine({ start: { x: centerX + 15, y: centerY }, end: { x: centerX, y: centerY - 15 }, color: colors.ink, thickness: 1.3 });
          page.drawLine({ start: { x: centerX, y: centerY - 15 }, end: { x: centerX - 15, y: centerY }, color: colors.ink, thickness: 1.3 });
          page.drawLine({ start: { x: centerX - 15, y: centerY }, end: { x: centerX, y: centerY + 15 }, color: colors.ink, thickness: 1.3 });
          page.drawLine({ start: { x: centerX, y: centerY + 12 }, end: { x: centerX + 7, y: centerY + 4 }, color: colors.coral, thickness: 1 });
          page.drawLine({ start: { x: centerX + 12, y: centerY }, end: { x: centerX + 4, y: centerY - 7 }, color: colors.coral, thickness: 1 });
          page.drawLine({ start: { x: centerX, y: centerY - 12 }, end: { x: centerX - 7, y: centerY - 4 }, color: colors.coral, thickness: 1 });
          page.drawLine({ start: { x: centerX - 12, y: centerY }, end: { x: centerX - 4, y: centerY + 7 }, color: colors.coral, thickness: 1 });
          page.drawCircle({ x: centerX, y: centerY, size: 2.5, color: colors.yellow });
        }
      }
      page.drawLine({ start: { x: x + 38, y: tileBottom + tileHeight + 8 }, end: { x: x + width - 38, y: tileBottom + tileHeight + 8 }, color: colors.coral, thickness: 1.4 });
      page.drawLine({ start: { x: x + 38, y: tileBottom - 8 }, end: { x: x + width - 38, y: tileBottom - 8 }, color: colors.coral, thickness: 1.4 });
      break;
    }
    case "merlion": {
      page.drawRectangle({ x: x + 78, y: ground, width: 116, height: 11, borderColor: colors.ink, borderWidth: 1.6 });
      page.drawEllipse({ x: x + 136, y: ground + 12, xScale: 52, yScale: 8, borderColor: colors.coral, borderWidth: 1.3 });
      page.drawEllipse({ x: x + 136, y: ground + 64, xScale: 34, yScale: 50, borderColor: colors.ink, borderWidth: 1.8 });
      drawPolyline([[108, 50], [86, 42], [65, 49], [49, 66], [61, 79], [82, 76], [101, 65]], colors.ink, 1.8, true);
      drawPolyline([[62, 66], [82, 62], [101, 65]], colors.coral, 1.2);
      page.drawEllipse({ x: x + 136, y: ground + 126, xScale: 43, yScale: 34, borderColor: colors.ink, borderWidth: 1.8 });
      drawPolyline([[101, 118], [89, 128], [100, 135], [92, 148], [109, 147], [115, 162], [128, 151], [139, 166], [150, 151], [167, 158], [164, 143], [180, 143], [171, 130]], colors.coral, 1.7);
      drawPolyline([[108, 135], [101, 148], [117, 145]], colors.ink, 1.4);
      drawPolyline([[157, 145], [173, 148], [166, 135]], colors.ink, 1.4);
      page.drawEllipse({ x: x + 158, y: ground + 117, xScale: 22, yScale: 14, borderColor: colors.ink, borderWidth: 1.4 });
      page.drawCircle({ x: x + 125, y: ground + 134, size: 2.8, color: colors.ink });
      page.drawCircle({ x: x + 148, y: ground + 134, size: 2.8, color: colors.ink });
      drawPolyline([[137, 129], [133, 122], [141, 122]], colors.ink, 1.1);
      drawPolyline([[145, 113], [158, 109], [171, 115]], colors.coral, 1.3);
      [[121, 84], [141, 84], [131, 67], [151, 67]].forEach(([scaleX, scaleY]) => {
        drawPolyline([[scaleX, scaleY + 7], [scaleX + 7, scaleY], [scaleX, scaleY - 7], [scaleX - 7, scaleY]], colors.green, 1, true);
      });
      drawPolyline([[104, 93], [89, 100], [100, 107]], colors.blue, 1.3);
      drawPolyline([[168, 116], [190, 112], [214, 101], [240, 86], [273, 82]], colors.blue, 1.5);
      drawPolyline([[169, 112], [195, 104], [220, 90], [246, 75], [274, 72]], colors.blue, 1.3);
      drawPolyline([[169, 108], [194, 96], [215, 80], [238, 65], [265, 61]], colors.blue, 1.1);
      drawWaves(ground + 35, 3);
      page.drawCircle({ x: x + width - 32, y: y + height - 27, size: 14, borderColor: colors.yellow, borderWidth: 1.5 });
      break;
    }
    case "guardian": {
      page.drawRectangle({ x: x + 92, y: ground, width: 116, height: 11, borderColor: colors.ink, borderWidth: 1.6 });
      page.drawRectangle({ x: x + 104, y: ground + 11, width: 92, height: 8, borderColor: colors.coral, borderWidth: 1.2 });
      drawPolyline([[119, 19], [113, 46], [123, 84], [137, 95], [163, 95], [177, 84], [187, 46], [181, 19]], colors.ink, 1.8, true);
      drawPolyline([[125, 20], [129, 48], [140, 78], [150, 88], [160, 78], [171, 48], [175, 20]], colors.coral, 1.2);
      drawPolyline([[120, 82], [108, 94], [116, 105], [130, 96]], colors.ink, 1.4, true);
      drawPolyline([[180, 82], [192, 94], [184, 105], [170, 96]], colors.ink, 1.4, true);
      page.drawEllipse({ x: x + 150, y: ground + 125, xScale: 31, yScale: 28, borderColor: colors.ink, borderWidth: 1.8 });
      drawPolyline([[119, 132], [108, 143], [122, 145], [117, 159], [135, 153], [143, 171], [151, 155], [160, 171], [167, 153], [185, 159], [180, 145], [193, 143], [181, 132]], colors.coral, 1.7);
      drawPolyline([[124, 139], [136, 145], [150, 141], [164, 145], [176, 139]], colors.ink, 1.2);
      page.drawCircle({ x: x + 138, y: ground + 130, size: 2.8, color: colors.ink });
      page.drawCircle({ x: x + 163, y: ground + 130, size: 2.8, color: colors.ink });
      drawPolyline([[151, 126], [146, 118], [154, 118]], colors.ink, 1.1);
      drawPolyline([[137, 109], [150, 103], [163, 109]], colors.coral, 1.3);
      drawPolyline([[130, 98], [150, 88], [170, 98]], colors.blue, 1.2);
      drawPolyline([[121, 87], [96, 82], [77, 65], [69, 42]], colors.ink, 1.8);
      drawPolyline([[179, 87], [198, 80], [211, 62], [216, 41]], colors.ink, 1.8);
      drawPolyline([[71, 39], [43, 46], [37, 69], [52, 86], [77, 79], [82, 58]], colors.ink, 1.7, true);
      drawPolyline([[45, 55], [73, 50], [42, 66], [76, 62], [48, 76], [76, 72]], colors.coral, 1);
      page.drawLine({ start: { x: x + 218, y: ground + 18 }, end: { x: x + 218, y: ground + 144 }, color: colors.ink, thickness: 1.8 });
      page.drawLine({ start: { x: x + 210, y: ground + 18 }, end: { x: x + 226, y: ground + 18 }, color: colors.ink, thickness: 1.2 });
      drawPolyline([[218, 144], [207, 158], [229, 158]], colors.coral, 1.5, true);
      break;
    }
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
        const buildingHeight = 116 - (index % 2) * 16;
        const roofBase = ground + buildingHeight;
        page.drawRectangle({ x: shopX, y: ground, width: 74, height: buildingHeight, borderColor: colors.ink, borderWidth: 1.7 });
        page.drawLine({ start: { x: shopX - 4, y: roofBase }, end: { x: shopX + 37, y: roofBase + 22 }, color: colors.ink, thickness: 1.6 });
        page.drawLine({ start: { x: shopX + 37, y: roofBase + 22 }, end: { x: shopX + 78, y: roofBase }, color: colors.ink, thickness: 1.6 });
        page.drawLine({ start: { x: shopX + 3, y: roofBase - 6 }, end: { x: shopX + 71, y: roofBase - 6 }, color: colors.muted, thickness: 1 });
        page.drawLine({ start: { x: shopX, y: ground + 74 }, end: { x: shopX + 74, y: ground + 74 }, color: colors.coral, thickness: 2.2 });
        page.drawLine({ start: { x: shopX, y: ground + 80 }, end: { x: shopX + 74, y: ground + 80 }, color: colors.coral, thickness: 1 });
        drawWindows(shopX + 12, ground + buildingHeight - 30, 2, 1, 26);
        page.drawLine({ start: { x: shopX + 17, y: ground + buildingHeight - 30 }, end: { x: shopX + 17, y: ground + buildingHeight - 17 }, color: colors.muted, thickness: 1 });
        page.drawLine({ start: { x: shopX + 43, y: ground + buildingHeight - 30 }, end: { x: shopX + 43, y: ground + buildingHeight - 17 }, color: colors.muted, thickness: 1 });
        page.drawRectangle({ x: shopX + 25, y: ground, width: 24, height: 42, borderColor: colors.blue, borderWidth: 1.2 });
        page.drawLine({ start: { x: shopX + 37, y: ground }, end: { x: shopX + 37, y: ground + 42 }, color: colors.blue, thickness: 1 });
        page.drawCircle({ x: shopX + 33, y: ground + 20, size: 1.5, color: colors.blue });
        page.drawRectangle({ x: shopX + 26, y: ground + 84, width: 22, height: 11, borderColor: colors.coral, borderWidth: 1 });
      });
      page.drawLine({ start: { x: x + 22, y: ground }, end: { x: x + width - 22, y: ground }, color: colors.ink, thickness: 1.8 });
      page.drawLine({ start: { x: x + 24, y: ground + 136 }, end: { x: x + width - 24, y: ground + 136 }, color: colors.muted, thickness: 1 });
      [0, 1, 2].forEach((index) => {
        const signX = x + 70 + index * 88;
        page.drawLine({ start: { x: signX, y: ground + 136 }, end: { x: signX, y: ground + 124 }, color: colors.ink, thickness: 1 });
        page.drawCircle({ x: signX, y: ground + 116, size: 8, borderColor: colors.yellow, borderWidth: 1.3 });
      });
      drawLantern(x + 70, ground + 142);
      drawLantern(x + width - 70, ground + 142);
      break;
  }
  drawColoringVariant(page, scene, variant, variation);
}

function drawEmbeddedColoringImage(page: PDFPage, image: PDFImage, box: Box) {
  const dimensions = image.scale(1);
  const scale = Math.min(box.width / dimensions.width, box.height / dimensions.height);
  const width = dimensions.width * scale;
  const height = dimensions.height * scale;
  page.drawImage(image, {
    x: box.x + (box.width - width) / 2,
    y: box.y + (box.height - height) / 2,
    width,
    height,
  });
}

function drawTraceBoard(
  page: PDFPage,
  fonts: Fonts,
  activity: Activity,
  box: Box,
  coloring: boolean,
  context: string,
  artwork: ColoringArtwork,
) {
  if (coloring) {
    drawColoringActivityBoard(page, fonts, activity, box, context, artwork);
    return;
  }
  const label = pdfText(activity.items[0]?.label || "LOCAL DETAIL").toUpperCase();
  const variant = coloringSceneFor(activity, context);
  const variation = coloringVariantFor(activity, context);
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
  const sceneLabel = pdfText(coloringIllustrationSpecs[variant].label).toUpperCase();
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
  const image = artwork[coloringArtworkKey(activity, context)];
  if (image) drawEmbeddedColoringImage(page, image, scene);
  else drawColoringScene(page, scene, variant, variation);

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

function drawColoringActivityBoard(
  page: PDFPage,
  fonts: Fonts,
  activity: Activity,
  box: Box,
  context: string,
  artwork: ColoringArtwork,
) {
  const spec = coloringPageSpec(activity, context);
  const variation = coloringVariantFor(activity, context);
  const gap = 6;
  const howHeight = 23;
  const sceneHeight = 200;
  const traceHeight = 30;
  const notesHeight = 60;
  const top = box.y + box.height;

  const howY = top - howHeight;
  page.drawRectangle({ x: box.x, y: howY, width: box.width, height: howHeight, color: colors.blueSoft });
  page.drawText("SPOT / COLOR / TRACE", {
    x: box.x + 10,
    y: howY + 13,
    size: 7,
    font: fonts.bold,
    color: colors.coral,
  });
  page.drawText("HOW TO PLAY", {
    x: box.x + box.width - 158,
    y: howY + 14,
    size: 6,
    font: fonts.bold,
    color: colors.blue,
  });
  drawWrappedText(page, spec.howToPlay, fonts, {
    x: box.x + box.width - 158,
    y: howY + 5,
    size: 6,
    maxWidth: 148,
    maxLines: 1,
    color: colors.ink,
  });

  const sceneY = howY - gap - sceneHeight;
  const sceneWidth = box.width * 0.52;
  const sceneBox = { x: box.x, y: sceneY, width: sceneWidth, height: sceneHeight };
  page.drawRectangle({ ...sceneBox, color: colors.paper, borderColor: colors.line, borderWidth: 1 });
  page.drawText(`COLOR THE ${pdfText(spec.illustration.label).toUpperCase()}`, {
    x: sceneBox.x + 9,
    y: sceneBox.y + sceneBox.height - 15,
    size: 7,
    font: fonts.bold,
    color: colors.ink,
  });
  const image = artwork[coloringArtworkKey(activity, context)];
  if (image) {
    drawEmbeddedColoringImage(page, image, {
      x: sceneBox.x + 7,
      y: sceneBox.y + 7,
      width: sceneBox.width - 14,
      height: sceneBox.height - 30,
    });
  } else {
    const artWidth = 320;
    const artHeight = 200;
    const artScale = Math.min(sceneBox.width / artWidth, (sceneBox.height - 22) / artHeight);
    page.pushOperators(
      pushGraphicsState(),
      concatTransformationMatrix(artScale, 0, 0, artScale, sceneBox.x, sceneBox.y),
    );
    drawColoringScene(page, { x: 0, y: 0, width: artWidth, height: artHeight }, spec.scene, variation);
    page.pushOperators(popGraphicsState());
  }

  const gridX = box.x + sceneWidth + gap;
  const gridWidth = box.width - sceneWidth - gap;
  page.drawText("CAN YOU SPOT...", {
    x: gridX,
    y: sceneY + sceneHeight - 11,
    size: 8,
    font: fonts.bold,
    color: colors.ink,
  });
  page.drawText("B · I · N · G · O", {
    x: gridX + gridWidth - fonts.bold.widthOfTextAtSize("B · I · N · G · O", 5.5),
    y: sceneY + sceneHeight - 10,
    size: 5.5,
    font: fonts.bold,
    color: colors.blue,
  });
  const gridTop = sceneY + sceneHeight - 18;
  const cellGap = 4;
  const cellWidth = (gridWidth - cellGap * 2) / 3;
  const cellHeight = (sceneHeight - 18 - cellGap * 2) / 3;
  spec.cells.forEach((cell, index) => {
    const column = index % 3;
    const row = Math.floor(index / 3);
    const cellX = gridX + column * (cellWidth + cellGap);
    const cellY = gridTop - (row + 1) * cellHeight - row * cellGap;
    const isFree = cell.kind === "free";
    const isChallenge = cell.kind === "challenge";
    page.drawRectangle({
      x: cellX,
      y: cellY,
      width: cellWidth,
      height: cellHeight,
      color: isFree ? colors.coral : isChallenge ? colors.yellowSoft : colors.white,
      borderColor: isFree ? colors.coral : colors.line,
      borderWidth: 0.8,
    });
    const cellColor = isFree ? colors.white : isChallenge ? colors.coral : colors.blue;
    page.drawText(isFree ? "FREE" : isChallenge ? "TRY" : "SPOT", {
      x: cellX + 5,
      y: cellY + cellHeight - 9,
      size: 4.5,
      font: fonts.bold,
      color: cellColor,
    });
    drawWrappedText(page, pdfText(cell.label), fonts, {
      x: cellX + 5,
      y: cellY + cellHeight - 19,
      size: 6.3,
      font: fonts.bold,
      maxWidth: cellWidth - 10,
      maxLines: 1,
      color: isFree ? colors.white : colors.ink,
    });
    drawWrappedText(page, pdfText(cell.clue), fonts, {
      x: cellX + 5,
      y: cellY + 10,
      size: 4.8,
      maxWidth: cellWidth - 10,
      maxLines: 2,
      lineHeight: 5.5,
      color: isFree ? colors.white : colors.muted,
    });
  });

  const traceY = sceneY - gap - traceHeight;
  page.drawRectangle({ x: box.x, y: traceY, width: box.width, height: traceHeight, color: colors.blueSoft });
  page.drawText("TRACE THE NAME", {
    x: box.x + 10,
    y: traceY + 17,
    size: 6,
    font: fonts.bold,
    color: colors.blue,
  });
  const traceWord = pdfText(spec.traceWord);
  const traceSize = fitTextSize(traceWord, fonts.bold, box.width - 180, 18, 11);
  page.drawText(traceWord, {
    x: box.x + 88,
    y: traceY + 9,
    size: traceSize,
    font: fonts.bold,
    color: colors.line,
    opacity: 0.75,
  });
  drawDottedLine(page, box.x + 88, box.x + box.width - 125, traceY + 7, colors.line, 2, 3);
  drawWrappedText(page, pdfText(spec.illustration.subject), fonts, {
    x: box.x + box.width - 115,
    y: traceY + 14,
    size: 5.5,
    maxWidth: 105,
    maxLines: 2,
    color: colors.muted,
  });

  const notesY = traceY - gap - notesHeight;
  const noteGap = 8;
  const noteWidth = (box.width - noteGap) / 2;
  page.drawRectangle({ x: box.x, y: notesY, width: noteWidth, height: notesHeight, color: colors.yellowSoft });
  page.drawRectangle({ x: box.x + noteWidth + noteGap, y: notesY, width: noteWidth, height: notesHeight, color: colors.coralSoft });
  page.drawText("LOCAL CLUES", { x: box.x + 10, y: notesY + notesHeight - 15, size: 6, font: fonts.bold, color: colors.blue });
  spec.facts.slice(0, 3).forEach((fact, index) => {
    const factY = notesY + notesHeight - 28 - index * 13;
    page.drawCircle({ x: box.x + 12, y: factY + 2, size: 2, color: colors.coral });
    drawWrappedText(page, pdfText(fact), fonts, {
      x: box.x + 18,
      y: factY + 4,
      size: 5.2,
      maxWidth: noteWidth - 28,
      maxLines: 1,
      color: colors.ink,
    });
  });
  const fieldX = box.x + noteWidth + noteGap;
  page.drawText("MY FIELD NOTE", { x: fieldX + 10, y: notesY + notesHeight - 15, size: 6, font: fonts.bold, color: colors.coral });
  drawWrappedText(page, pdfText(spec.fieldNote), fonts, {
    x: fieldX + 10,
    y: notesY + notesHeight - 29,
    size: 7,
    maxWidth: noteWidth - 20,
    maxLines: 2,
    lineHeight: 9,
    color: colors.ink,
  });
  drawDottedLine(page, fieldX + 10, fieldX + noteWidth - 10, notesY + 17, colors.line, 2, 3);
  drawDottedLine(page, fieldX + 10, fieldX + noteWidth - 10, notesY + 8, colors.line, 2, 3);
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
  const bankWidth = box.x + box.width - bankX;
  // Words are normalized/deduped by createWordSearch (may drop or reorder
  // labels), so puzzle.words[i] is not guaranteed to match activity.items[i]
  // positionally — look clues up by the same normalized form instead.
  const clueByWord = new Map(activity.items.map((item) => [normalizePuzzleWord(item.label, size), item.clue]));
  page.drawText("FIND", { x: bankX, y: gridY + gridSize - 8, size: 8, font: fonts.bold, color: colors.coral });
  const rowPitch = 52;
  const rowHeight = 44;
  puzzle.words.forEach((word, index) => {
    const rowTop = gridY + gridSize - 13 - index * rowPitch;
    page.drawRectangle({
      x: bankX,
      y: rowTop - rowHeight,
      width: bankWidth,
      height: rowHeight,
      color: index % 2 ? colors.greenSoft : colors.yellowSoft,
    });
    page.drawText(word, {
      x: bankX + 9,
      y: rowTop - 12,
      size: 10,
      font: fonts.monoBold,
      color: colors.ink,
    });
    const clue = clueByWord.get(word);
    if (clue) {
      drawWrappedText(page, clue, fonts, {
        x: bankX + 9,
        y: rowTop - 24,
        size: 6.5,
        lineHeight: 8,
        maxWidth: bankWidth - 18,
        maxLines: 2,
        color: colors.muted,
      });
    }
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

function gameInstruction(activity: Activity) {
  switch (activity.gameType) {
    case "word_search":
      return "Find each local word in the grid. Circle it when you spot it.";
    case "crossword":
      return "Solve the local clues, then write each answer into the numbered squares.";
    case "maze":
      return "Trace one route from START to FINISH. Look for the best way through.";
    case "matching":
      return "Draw one line from each local word to its matching clue.";
    case "bingo":
      return "Spot these details in the real place. Mark a square when you find one.";
    case "spot_the_difference":
      return "Compare both pictures carefully. Circle three changes you can prove.";
    case "codebreaker":
      return "Use the starter key to crack the local word, one symbol at a time.";
    case "map_puzzle":
      return "Plan a route from S to F and visit the numbered stops along the way.";
    case "scavenger_hunt":
      return "Tick each detail when you find it. Leave every object where it belongs.";
    case "quiz":
      return "Choose an answer, then explain what you noticed that helped you decide.";
    case "drawing":
      return "Look closely at the local subject, then sketch one detail you noticed.";
    default:
      return "Use the local clues to make a tiny travel story of your own.";
  }
}

function drawEditorialBoardChrome(
  page: PDFPage,
  fonts: Fonts,
  activity: Activity,
  box: Box,
  boardLabel: string,
) {
  const stripHeight = 39;
  const gap = 8;
  const stripY = box.y + box.height - stripHeight;
  page.drawRectangle({
    x: box.x,
    y: stripY,
    width: box.width,
    height: stripHeight,
    color: colors.blueSoft,
  });
  page.drawText("HOW TO PLAY", {
    x: box.x + 12,
    y: stripY + 25,
    size: 7,
    font: fonts.bold,
    color: colors.blue,
  });
  drawWrappedText(page, gameInstruction(activity), fonts, {
    x: box.x + 12,
    y: stripY + 14,
    size: 7.5,
    lineHeight: 9,
    maxWidth: box.width - 150,
    maxLines: 2,
    color: colors.ink,
  });
  const tag = pdfText(`${boardLabel} board`).toUpperCase();
  const tagWidth = fonts.bold.widthOfTextAtSize(tag, 6.5);
  page.drawText(tag, {
    x: box.x + box.width - tagWidth - 12,
    y: stripY + 25,
    size: 6.5,
    font: fonts.bold,
    color: colors.coral,
  });
  const itemCount = activity.items?.length ?? 0;
  page.drawText(itemCount ? `${itemCount} LOCAL CLUES` : "LOOK CLOSELY", {
    x: box.x + box.width - 98,
    y: stripY + 13,
    size: 5.5,
    font: fonts.bold,
    color: colors.muted,
  });

  const boardHeight = box.height - stripHeight - gap;
  const board = { x: box.x, y: box.y, width: box.width, height: boardHeight };
  page.drawRectangle({
    ...board,
    color: colors.white,
    borderColor: colors.line,
    borderWidth: 1,
  });
  page.drawRectangle({
    x: board.x,
    y: board.y + board.height - 22,
    width: board.width,
    height: 22,
    color: colors.paper,
  });
  page.drawText("GAME BOARD", {
    x: board.x + 12,
    y: board.y + board.height - 14,
    size: 6.5,
    font: fonts.bold,
    color: colors.muted,
  });
  const boardTitle = pdfText(activity.title).toUpperCase();
  const boardTitleSize = fitTextSize(boardTitle, fonts.bold, board.width - 150, 6.5, 5);
  page.drawText(boardTitle, {
    x: board.x + board.width - fonts.bold.widthOfTextAtSize(boardTitle, boardTitleSize) - 12,
    y: board.y + board.height - 14,
    size: boardTitleSize,
    font: fonts.bold,
    color: colors.blue,
  });
  return {
    x: board.x + 12,
    y: board.y + 10,
    width: board.width - 24,
    height: board.height - 38,
  };
}

const gameTypeLabels: Record<string, string> = {
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

// Label prefix and accent color for the queue page's secret-target badge,
// keyed by QueueTargetKind. Purely presentational — never AI-authored — so a
// new/unexpected kind value just falls back to a neutral default rather than
// breaking the page.
const queueTargetKindCopy: Record<string, { prefix: string; accent: RGB; soft: RGB }> = {
  shape: { prefix: "Your secret shape:", accent: colors.blue, soft: colors.blueSoft },
  colour: { prefix: "Your secret colour:", accent: colors.coral, soft: colors.coralSoft },
  object: { prefix: "Your secret object:", accent: colors.green, soft: colors.greenSoft },
  sound: { prefix: "Your secret sound:", accent: colors.coral, soft: colors.coralSoft },
  person: { prefix: "Who to spot:", accent: colors.green, soft: colors.greenSoft },
};
const defaultQueueTargetKindCopy = { prefix: "Your secret target:", accent: colors.blue, soft: colors.blueSoft };

// A much lighter combined header than drawGameFrame + drawEditorialBoardChrome
// (which together cost ~152pt of fixed chrome regardless of box size). At the
// column widths a paired or queue-page game gets, that overhead would eat a
// disproportionate share of a much smaller budget, so this keeps only a
// single label strip and hands almost the whole box to the actual board.
function drawCompactGameFrame(page: PDFPage, fonts: Fonts, label: string, box: Box) {
  page.drawRectangle({
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    color: colors.white,
    borderColor: colors.softLine,
    borderWidth: 1,
  });
  const stripHeight = 20;
  page.drawRectangle({
    x: box.x,
    y: box.y + box.height - stripHeight,
    width: box.width,
    height: stripHeight,
    color: colors.blueSoft,
  });
  page.drawText(pdfText(label).toUpperCase(), {
    x: box.x + 8,
    y: box.y + box.height - 14,
    size: 6.5,
    font: fonts.bold,
    color: colors.blue,
  });
  return {
    x: box.x + 8,
    y: box.y + 8,
    width: box.width - 16,
    height: box.height - stripHeight - 16,
  };
}

// Renders one game into a caller-sized frame with lighter chrome than the
// full-page drawGame below. Handles every game type except map_puzzle
// (excluded from both the pair and queue slots — see pairEligibleGameTypes/
// queueEligibleGameTypes in booklet.ts). coloring bypasses the compact frame
// entirely and draws straight onto the raw box, the same way drawGame's own
// coloring case bypasses drawEditorialBoardChrome — drawColoringActivityBoard
// already has its own "SPOT/COLOR/TRACE"/"HOW TO PLAY" header, and it also
// needs a taller box than a stacked-pair half provides, so only the
// queue-page caller (which has a full ~450-510pt-tall box) ever passes
// gameType "coloring" here in practice.
function drawCompactGame(
  page: PDFPage,
  fonts: Fonts,
  activity: Activity,
  frame: Box,
  age: number,
  context: string,
  artwork: ColoringArtwork,
) {
  if (activity.gameType === "coloring") {
    drawColoringActivityBoard(page, fonts, activity, frame, context, artwork);
    return;
  }
  const box = drawCompactGameFrame(page, fonts, gameTypeLabels[activity.gameType] || "Travel game", frame);
  switch (activity.gameType) {
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
    case "quiz":
      drawQuiz(page, fonts, activity.items, box);
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
    case "scavenger_hunt":
      drawChecklist(page, fonts, activity.items, box);
      break;
    case "drawing":
      drawTraceBoard(page, fonts, activity, box, false, context, artwork);
      break;
    default:
      drawStory(page, fonts, activity.items, box);
  }
}

// word_search/crossword/scavenger_hunt need the full page width to stay
// legible (their PDF layouts use fixed offsets that go near-zero at a
// half-width column) — when either game in the pair needs that, the whole
// page stacks top/bottom instead of side-by-side.
function drawPairedInPlaceGames(
  page: PDFPage,
  fonts: Fonts,
  first: Activity,
  second: Activity,
  age: number,
  contextPrefix: string,
  artwork: ColoringArtwork,
) {
  const useStack = wideOnlyGameTypes.includes(first.gameType) || wideOnlyGameTypes.includes(second.gameType);
  if (useStack) {
    drawStackedInPlaceGames(page, fonts, first, second, age, contextPrefix, artwork);
    return;
  }
  const columnGap = 16;
  const columnWidth = (PAGE_WIDTH - MARGIN * 2 - columnGap) / 2;
  const columns = [
    { activity: first, x: MARGIN, index: 0 },
    { activity: second, x: MARGIN + columnWidth + columnGap, index: 1 },
  ];
  columns.forEach(({ activity, x, index }) => {
    const titleSize = fitWrappedTextSize(activity.title, fonts.bold, columnWidth, 13, 10, 2);
    drawWrappedText(page, activity.title, fonts, {
      x,
      y: 700,
      size: titleSize,
      font: fonts.bold,
      color: colors.ink,
      lineHeight: titleSize * 1.15,
      maxWidth: columnWidth,
      maxLines: 2,
    });
    drawWrappedText(page, activity.body, fonts, {
      x,
      y: 655,
      size: 7.5,
      lineHeight: 9.5,
      maxWidth: columnWidth,
      maxLines: 3,
      color: colors.muted,
    });
    drawCompactGame(
      page,
      fonts,
      activity,
      { x, y: 50, width: columnWidth, height: 560 },
      age,
      `${contextPrefix} - game ${index + 1}`,
      artwork,
    );
  });
}

function drawStackedInPlaceGames(
  page: PDFPage,
  fonts: Fonts,
  first: Activity,
  second: Activity,
  age: number,
  contextPrefix: string,
  artwork: ColoringArtwork,
) {
  const rowGap = 20;
  const rowHeight = (700 - 50 - rowGap) / 2;
  const rows = [
    { activity: first, top: 700, index: 0 },
    { activity: second, top: 700 - rowHeight - rowGap, index: 1 },
  ];
  const width = PAGE_WIDTH - MARGIN * 2;
  rows.forEach(({ activity, top, index }) => {
    const titleSize = fitWrappedTextSize(activity.title, fonts.bold, width, 15, 11, 1);
    drawWrappedText(page, activity.title, fonts, {
      x: MARGIN,
      y: top,
      size: titleSize,
      font: fonts.bold,
      color: colors.ink,
      lineHeight: titleSize * 1.15,
      maxWidth: width,
      maxLines: 1,
    });
    drawWrappedText(page, activity.body, fonts, {
      x: MARGIN,
      y: top - 22,
      size: 8,
      lineHeight: 10,
      maxWidth: width,
      maxLines: 2,
      color: colors.muted,
    });
    drawCompactGame(
      page,
      fonts,
      activity,
      { x: MARGIN, y: top - rowHeight + 8, width, height: rowHeight - 50 },
      age,
      `${contextPrefix} - game ${index + 1}`,
      artwork,
    );
  });
}

function drawGame(
  page: PDFPage,
  fonts: Fonts,
  activity: Activity,
  age: number,
  frame: Box,
  context: string,
  artwork: ColoringArtwork,
) {
  const frameBox = drawGameFrame(page, fonts, gameTypeLabels[activity.gameType] || "Travel game", frame);
  const box = activity.gameType === "coloring"
    ? frameBox
    : drawEditorialBoardChrome(
      page,
      fonts,
      activity,
      frameBox,
      gameTypeLabels[activity.gameType] || "Travel game",
    );
  switch (activity.gameType) {
    case "coloring":
      drawTraceBoard(page, fonts, activity, box, true, context, artwork);
      break;
    case "drawing":
      drawTraceBoard(page, fonts, activity, box, false, context, artwork);
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
  artwork: ColoringArtwork,
) {
  const day = booklet.dayPlans[dayIndex];
  // Coloring needs the full page for its illustration and does not compact
  // (drawColoringActivityBoard uses fixed-width text offsets that overlap
  // well before a half-page column). inThePlace is free to be any
  // age-appropriate type, including coloring, so pairing only happens when
  // it is not — inThePlaceSecond's own content is simply not shown that day
  // rather than forcing a broken layout.
  const secondActivity = activityIndex === 0
    && pairEligibleGameTypes.includes(activity.gameType)
    ? day.slots.inThePlaceSecond
    : undefined;
  const accent = activityIndex === 0 ? colors.coral : colors.blue;
  const page = drawPageBase(document, fonts, `Day ${day.day}`, pageNumber, totalPages, accent);
  drawPill(page, `DAY ${day.day} / ${activityIndex === 0 ? "IN THE PLACE" : "SIT-DOWN PAGE"}`, fonts, MARGIN, 765, activityIndex === 0 ? colors.coralSoft : colors.blueSoft, accent);
  drawWrappedText(page, day.theme, fonts, {
    x: MARGIN,
    y: 735,
    size: 10,
    font: fonts.bold,
    color: colors.muted,
    maxWidth: PAGE_WIDTH - MARGIN * 2,
    maxLines: 1,
  });

  if (secondActivity) {
    drawPairedInPlaceGames(
      page,
      fonts,
      activity,
      secondActivity,
      booklet.age,
      `${day.theme} - day ${day.day} - game`,
      artwork,
    );
    return;
  }

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
  drawPill(
    page,
    activity.gameType === "coloring" ? "SPOT · COLOR · TRACE" : activity.kind,
    fonts,
    MARGIN,
    623,
    colors.yellowSoft,
    colors.ink,
  );
  drawWrappedText(page, activity.body, fonts, {
    x: MARGIN,
    y: 599,
    size: 9,
    lineHeight: 12,
    maxWidth: PAGE_WIDTH - MARGIN * 2,
    maxLines: 4,
    color: colors.muted,
  });

  const gameFrame = activity.gameType === "coloring"
    ? { x: MARGIN, y: 120, width: PAGE_WIDTH - MARGIN * 2, height: 440 }
    : { x: MARGIN, y: 133, width: PAGE_WIDTH - MARGIN * 2, height: 409 };
  drawGame(
    page,
    fonts,
    activity,
    booklet.age,
    gameFrame,
    `${day.theme} - day ${day.day} - game ${activityIndex + 1}`,
    artwork,
  );

  if (activity.gameType !== "coloring") {
    const noteGap = 10;
    const noteWidth = PAGE_WIDTH - MARGIN * 2;
    const clueWidth = noteWidth * 0.56;
    const responseX = MARGIN + clueWidth + noteGap;
    const responseWidth = noteWidth - clueWidth - noteGap;
    page.drawRectangle({
      x: MARGIN,
      y: 61,
      width: clueWidth,
      height: 64,
      color: activityIndex === 0 ? colors.coralSoft : colors.greenSoft,
    });
    page.drawRectangle({
      x: responseX,
      y: 61,
      width: responseWidth,
      height: 64,
      color: colors.yellowSoft,
    });
    page.drawText("LOCAL CLUES", {
      x: MARGIN + 14,
      y: 109,
      size: 7,
      font: fonts.bold,
      color: accent,
    });
    const clues = (activity.items ?? []).slice(0, 2);
    if (clues.length) {
      clues.forEach((item, index) => {
        const clueY = 94 - index * 15;
        page.drawCircle({ x: MARGIN + 15, y: clueY + 2, size: 2.2, color: accent });
        drawWrappedText(page, `${item.label}: ${item.clue}`, fonts, {
          x: MARGIN + 23,
          y: clueY + 5,
          size: 6.8,
          lineHeight: 8,
          maxWidth: clueWidth - 34,
          maxLines: 1,
          color: colors.ink,
        });
      });
    } else {
      drawWrappedText(page, activity.body, fonts, {
        x: MARGIN + 14,
        y: 91,
        size: 7.5,
        maxWidth: clueWidth - 28,
        maxLines: 2,
        lineHeight: 9,
        color: colors.ink,
      });
    }
    page.drawText("MY FIELD NOTE", {
      x: responseX + 12,
      y: 109,
      size: 7,
      font: fonts.bold,
      color: accent,
    });
    drawWrappedText(page, activity.prompt, fonts, {
      x: responseX + 12,
      y: 96,
      size: 7.5,
      maxWidth: responseWidth - 24,
      maxLines: 1,
      color: colors.ink,
    });
    drawDottedLine(page, responseX + 12, responseX + responseWidth - 12, 78, colors.line, 2, 3);
    drawDottedLine(page, responseX + 12, responseX + responseWidth - 12, 69, colors.line, 2, 3);
  }
}

function drawQueuePage(
  document: PDFDocument,
  fonts: Fonts,
  booklet: GeneratedBookletData,
  dayIndex: number,
  pageNumber: number,
  totalPages: number,
  artwork: ColoringArtwork,
) {
  const day = booklet.dayPlans[dayIndex];
  const queue = day.slots.whileYouWait;
  const page = drawPageBase(document, fonts, `Day ${day.day} queue`, pageNumber, totalPages, colors.yellow);
  drawPill(page, `DAY ${day.day} / BEFORE YOU GO`, fonts, MARGIN, 765, colors.yellowSoft, colors.ink);

  page.drawRectangle({ x: MARGIN, y: 706, width: PAGE_WIDTH - MARGIN * 2, height: 28, color: colors.blueSoft });
  page.drawText("GROWN-UP", { x: MARGIN + 12, y: 723, size: 6.5, font: fonts.bold, color: colors.blue });
  drawWrappedText(page, day.slots.beforeYouGo, fonts, {
    x: MARGIN + 78,
    y: 720,
    size: 8,
    maxWidth: PAGE_WIDTH - MARGIN * 2 - 90,
    maxLines: 1,
    color: colors.muted,
  });

  // Surfaced here (the day's first activity page) because the only other
  // place this content used to appear was one summary page near the back of
  // the booklet, never on a page the child actually plays.
  const cueText = day.interestHook || day.siblingMission;
  if (cueText) {
    page.drawRectangle({ x: MARGIN, y: 646, width: PAGE_WIDTH - MARGIN * 2, height: 52, color: colors.greenSoft, borderColor: colors.softLine, borderWidth: 0.8 });
    page.drawText("FAMILY LENS", { x: MARGIN + 12, y: 684, size: 6.5, font: fonts.bold, color: colors.green });
    drawWrappedText(page, cueText, fonts, {
      x: MARGIN + 12,
      y: 672,
      size: 8,
      maxWidth: PAGE_WIDTH - MARGIN * 2 - 24,
      maxLines: 3,
      lineHeight: 10,
      color: colors.ink,
    });
  }

  // The cue banner (when present) shifts everything below it down by the
  // same amount; the rest of the page is positioned relative to this rather
  // than fixed coordinates so it works with or without the banner.
  const titleTop = cueText ? 616 : 660;
  // The secret-target badge and bonus-quest strip (when present) each add
  // their own fixed band below the instruction text, on top of the cue
  // banner's shift, so everything below (counter, game/grid, facts) still
  // lines up correctly whichever combination is present.
  const badgeHeight = queue.targetLabel ? 34 : 0;
  const bonusHeight = queue.bonusQuest ? 26 : 0;
  const shift = (660 - titleTop) + badgeHeight + bonusHeight;
  drawWrappedText(page, day.landmark.display, fonts, { x: MARGIN, y: titleTop, size: 9, font: fonts.bold, maxWidth: PAGE_WIDTH - MARGIN * 2, maxLines: 1, color: colors.muted });
  drawWrappedText(page, queue.title, fonts, { x: MARGIN, y: titleTop - 22, size: 15, font: fonts.bold, maxWidth: PAGE_WIDTH - MARGIN * 2, maxLines: 1, lineHeight: 17 });
  drawWrappedText(page, queue.instruction, fonts, { x: MARGIN, y: titleTop - 42, size: 8.5, maxWidth: PAGE_WIDTH - MARGIN * 2, maxLines: 2, lineHeight: 10, color: colors.muted });

  let bandTop = titleTop - 64;
  if (queue.targetLabel) {
    const kindCopy = queueTargetKindCopy[queue.targetKind || ""] || defaultQueueTargetKindCopy;
    const badgeY = bandTop;
    page.drawRectangle({ x: MARGIN, y: badgeY - 26, width: PAGE_WIDTH - MARGIN * 2, height: 28, color: kindCopy.soft, borderColor: kindCopy.accent, borderWidth: 1 });
    page.drawText(pdfText(kindCopy.prefix).toUpperCase(), { x: MARGIN + 12, y: badgeY - 10, size: 6.5, font: fonts.bold, color: kindCopy.accent });
    const labelSize = fitWrappedTextSize(queue.targetLabel, fonts.bold, PAGE_WIDTH - MARGIN * 2 - 24, 13, 10, 1);
    drawWrappedText(page, queue.targetLabel.toUpperCase(), fonts, {
      x: MARGIN + 12,
      y: badgeY - 22,
      size: labelSize,
      font: fonts.bold,
      maxWidth: PAGE_WIDTH - MARGIN * 2 - 24,
      maxLines: 1,
      color: colors.ink,
    });
    bandTop -= badgeHeight;
  }
  if (queue.bonusQuest) {
    const bonusY = bandTop;
    page.drawRectangle({ x: MARGIN, y: bonusY - 20, width: PAGE_WIDTH - MARGIN * 2, height: 22, color: colors.yellowSoft });
    page.drawText("BONUS QUEST", { x: MARGIN + 12, y: bonusY - 12, size: 6.5, font: fonts.bold, color: colors.coral });
    drawWrappedText(page, queue.bonusQuest, fonts, {
      x: MARGIN + 96,
      y: bonusY - 12,
      size: 7.5,
      maxWidth: PAGE_WIDTH - MARGIN * 2 - 108,
      maxLines: 1,
      color: colors.muted,
    });
    bandTop -= bonusHeight;
  }

  const hasFacts = day.slots.factCard.length === 3;

  if (queue.gameType && queue.items) {
    // whileYouWait carries a real compact game — requested in the prompt,
    // but Kimi does not reliably include it, so this path is a bonus when
    // present rather than the common case. bandTop already accounts for the
    // secret-target badge and bonus-quest strip above, when present.
    const counterY = bandTop - 12;
    const count = Math.min(8, queue.countTo);
    const diameter = 20;
    const counterGap = 8;
    for (let index = 0; index < count; index += 1) {
      page.drawCircle({
        x: MARGIN + diameter / 2 + index * (diameter + counterGap),
        y: counterY,
        size: diameter / 2,
        borderColor: colors.blue,
        borderWidth: 1.2,
        color: colors.white,
      });
    }
    page.drawText(pdfText(queue.countLabel), {
      x: MARGIN + count * (diameter + counterGap) + 6,
      y: counterY - 3,
      size: 7.5,
      font: fonts.bold,
      color: colors.blue,
    });

    const gameBottom = hasFacts ? 108 : 50;
    drawCompactGame(
      page,
      fonts,
      { title: queue.title, kind: "Quick queue game", body: queue.instruction, prompt: "", gameType: queue.gameType, items: queue.items },
      { x: MARGIN, y: gameBottom, width: PAGE_WIDTH - MARGIN * 2, height: counterY - diameter / 2 - 14 - gameBottom },
      booklet.age,
      `${day.theme} - day ${day.day} - queue game`,
      artwork,
    );

    if (hasFacts) {
      page.drawRectangle({ x: MARGIN, y: 46, width: PAGE_WIDTH - MARGIN * 2, height: 56, color: colors.yellowSoft, borderColor: colors.softLine, borderWidth: 0.8 });
      page.drawText("DID YOU KNOW?", { x: MARGIN + 12, y: 88, size: 7, font: fonts.bold, color: colors.coral });
      day.slots.factCard.forEach((fact, index) => {
        const y = 74 - index * 13;
        drawWrappedText(page, fact, fonts, { x: MARGIN + 12, y, size: 6.8, maxWidth: PAGE_WIDTH - MARGIN * 2 - 24, maxLines: 1, color: colors.ink });
      });
    }
    return;
  }

  const count = Math.min(20, queue.countTo);
  const columns = 5;
  const gap = 18;
  const diameter = 40;
  const gridWidth = columns * diameter + (columns - 1) * gap;
  const startX = (PAGE_WIDTH - gridWidth) / 2 + diameter / 2;
  const rows = Math.ceil(count / columns);
  const startY = 500 - shift;
  for (let index = 0; index < count; index += 1) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = startX + column * (diameter + gap);
    const y = startY - row * (diameter + 18);
    page.drawCircle({ x, y, size: diameter / 2, borderColor: colors.blue, borderWidth: 1.5, color: colors.white });
  }
  drawWrappedText(page, queue.countLabel, fonts, { x: MARGIN, y: startY - rows * (diameter + 18) + 8, size: 9, font: fonts.bold, maxWidth: PAGE_WIDTH - MARGIN * 2, maxLines: 1, color: colors.blue });

  if (hasFacts) {
    const boxY = 92 - shift;
    page.drawRectangle({ x: MARGIN, y: boxY, width: PAGE_WIDTH - MARGIN * 2, height: 190, color: colors.yellowSoft, borderColor: colors.softLine, borderWidth: 0.8 });
    page.drawText("DID YOU KNOW?", { x: MARGIN + 16, y: boxY + 164, size: 8, font: fonts.bold, color: colors.coral });
    day.slots.factCard.forEach((fact, index) => {
      const y = boxY + 132 - index * 43;
      page.drawCircle({ x: MARGIN + 18, y: y + 3, size: 3, color: colors.coral });
      drawWrappedText(page, fact, fonts, { x: MARGIN + 31, y: y + 7, size: 9, maxWidth: PAGE_WIDTH - MARGIN * 2 - 48, maxLines: 2, lineHeight: 12, color: colors.ink });
    });
  }
}

// The payoff page for whileYouWait's mystery target (see queueTargetKindCopy
// above), shown once the family has arrived. Only reached when
// bookletDayPageEntries emitted a "reveal" entry for this day, which itself
// only happens when both questReveal and whileYouWait.targetLabel are
// present — so this function can assume both exist.
function drawRevealPage(
  document: PDFDocument,
  fonts: Fonts,
  booklet: GeneratedBookletData,
  dayIndex: number,
  pageNumber: number,
  totalPages: number,
  photo?: PDFImage,
) {
  const day = booklet.dayPlans[dayIndex];
  const reveal = day.slots.questReveal;
  if (!reveal) return;
  const page = drawPageBase(document, fonts, `Day ${day.day} reveal`, pageNumber, totalPages, colors.blue);
  drawPill(page, `DAY ${day.day} / AT THE DESTINATION`, fonts, MARGIN, 765, colors.blueSoft, colors.blue);
  drawWrappedText(page, "Found It!", fonts, {
    x: MARGIN,
    y: 725,
    size: 27,
    font: fonts.bold,
    color: colors.ink,
  });

  let contentTop = 685;
  if (photo) {
    const photoHeight = 220;
    const dims = photo.scale(1);
    const photoWidth = PAGE_WIDTH - MARGIN * 2;
    const scale = Math.min(photoWidth / dims.width, photoHeight / dims.height);
    const drawWidth = dims.width * scale;
    const drawHeight = dims.height * scale;
    const photoX = MARGIN + (photoWidth - drawWidth) / 2;
    const photoY = contentTop - photoHeight;
    page.drawRectangle({ x: MARGIN, y: photoY, width: photoWidth, height: photoHeight, color: colors.paper, borderColor: colors.softLine, borderWidth: 1 });
    page.drawImage(photo, { x: photoX, y: photoY + (photoHeight - drawHeight) / 2, width: drawWidth, height: drawHeight });
    contentTop = photoY - 18;
  }

  drawWrappedText(page, reveal.revealText, fonts, {
    x: MARGIN,
    y: contentTop,
    size: 10,
    lineHeight: 14,
    maxWidth: PAGE_WIDTH - MARGIN * 2,
    maxLines: 3,
    color: colors.ink,
  });

  const chatTop = contentTop - 56;
  page.drawRectangle({ x: MARGIN, y: chatTop - 76, width: PAGE_WIDTH - MARGIN * 2, height: 78, color: colors.blueSoft, borderColor: colors.softLine, borderWidth: 0.8 });
  page.drawText("CHAT ABOUT IT", { x: MARGIN + 15, y: chatTop - 18, size: 8, font: fonts.bold, color: colors.blue });
  reveal.chatPrompts.forEach((prompt, index) => {
    const y = chatTop - 36 - index * 26;
    page.drawCircle({ x: MARGIN + 20, y: y + 3, size: 3, color: colors.blue });
    drawWrappedText(page, prompt, fonts, { x: MARGIN + 32, y: y + 7, size: 8.5, maxWidth: PAGE_WIDTH - MARGIN * 2 - 47, maxLines: 2, lineHeight: 11, color: colors.ink });
  });

  const badgeTop = chatTop - 90;
  page.drawRectangle({ x: MARGIN, y: badgeTop - 26, width: 150, height: 28, color: colors.yellowSoft, borderColor: colors.coral, borderWidth: 1 });
  page.drawCircle({ x: MARGIN + 20, y: badgeTop - 13, size: 6, color: colors.coral });
  page.drawText("QUEST COMPLETE", { x: MARGIN + 34, y: badgeTop - 16, size: 7.5, font: fonts.bold, color: colors.coral });

  const photoBoxTop = badgeTop - 40;
  const photoBoxHeight = Math.max(120, photoBoxTop - 50);
  page.drawRectangle({
    x: MARGIN,
    y: photoBoxTop - photoBoxHeight,
    width: PAGE_WIDTH - MARGIN * 2,
    height: photoBoxHeight,
    borderColor: colors.line,
    borderWidth: 1,
    borderDashArray: [4, 4],
  });
  page.drawText("Draw or stick a photo of your discovery here", {
    x: MARGIN + 12,
    y: photoBoxTop - 16,
    size: 8,
    font: fonts.bold,
    color: colors.muted,
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
    dayGameActivities(day)
      .map((activity, index) => ({ day: day.day, index, activity }))
      .filter((entry) => entry.activity.answerMode === "closed"),
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
    drawWrappedText(page, pdfText(familyRoleDescription(child, index)), fonts, { x: MARGIN + 188, y: y + 5, size: 7.5, maxWidth: PAGE_WIDTH - MARGIN * 2 - 200, maxLines: 3, lineHeight: 8.5, color: colors.muted });
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
  const seenCards = new Set<string>();
  const cards = booklet.dayPlans.flatMap((day, dayIndex) => {
    const plan = pack.mechanicsByDay[dayIndex]?.mechanics || ["spot"];
    return plan.flatMap((mechanic) => {
      const key = `${day.day}|${mechanic}`;
      if (seenCards.has(key)) return [];
      seenCards.add(key);
      return [{ day, mechanic }];
    });
  }).slice(0, 4);
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
    drawWrappedText(page, pdfText(mechanicMissionPrompt(mechanic, day.theme)), fonts, { x: x + 12, y: y + height - 105, size: 9, maxWidth: width - 24, maxLines: 5, lineHeight: 12, color: colors.muted });
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
  const gap = 14;
  const width = (PAGE_WIDTH - MARGIN * 2 - gap) / 2;
  FAMILY_BADGES.forEach((badge, index) => {
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
  return bookletPageTotal(booklet.dayPlans, includeFamilyPack);
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

export async function createBookletPdf(
  inputBooklet: GeneratedBookletData,
  familyPack?: FamilyPackContext,
  resolveColoringImage?: ColoringImageResolver,
) {
  const booklet: GeneratedBookletData = {
    ...inputBooklet,
    ...validateBookletDraft(inputBooklet, inputBooklet.days, inputBooklet.age),
  };
  assertBookletQa(booklet);
  const document = await PDFDocument.create();
  const fonts: Fonts = {
    regular: await document.embedFont(StandardFonts.Helvetica),
    bold: await document.embedFont(StandardFonts.HelveticaBold),
    mono: await document.embedFont(StandardFonts.Courier),
    monoBold: await document.embedFont(StandardFonts.CourierBold),
  };
  const coloringArtwork: ColoringArtwork = {};
  const revealArtwork: Record<number, PDFImage> = {};
  if (resolveColoringImage) {
    const imageRequests = new Map<string, string>();
    booklet.dayPlans.forEach((day) => {
      day.activities.forEach((activity, activityIndex) => {
        if (activity.gameType !== "coloring" && activity.gameType !== "drawing") return;
        const context = `${day.theme} - day ${day.day} - game ${activityIndex + 1}`;
        const path = activity.illustrationPath || curatedColoringImagePath(activity, context);
        if (path) imageRequests.set(coloringArtworkKey(activity, context), path);
      });
    });
    const revealPhotoRequests = new Map<number, string>();
    booklet.dayPlans.forEach((day, dayIndex) => {
      if (day.slots.questReveal?.photoPath) {
        revealPhotoRequests.set(dayIndex, day.slots.questReveal.photoPath);
      }
    });
    const resolvedImages = await Promise.all(Array.from(imageRequests, async ([key, path]) => {
      try {
        const bytes = await resolveColoringImage(path);
        return { key, bytes };
      } catch (error) {
        console.error(`[TripQuest illustration] ${key}`, error);
        return { key, bytes: null };
      }
    }));
    const resolvedRevealPhotos = await Promise.all(Array.from(revealPhotoRequests, async ([dayIndex, path]) => {
      try {
        const bytes = await resolveColoringImage(path);
        return { dayIndex, bytes };
      } catch (error) {
        console.error(`[TripQuest illustration] reveal photo day ${dayIndex + 1}`, error);
        return { dayIndex, bytes: null };
      }
    }));
    // Network/object-storage reads run together; PDF mutation stays sequential.
    for (const { key, bytes } of resolvedImages) {
      if (bytes) coloringArtwork[key] = await document.embedPng(bytes);
    }
    for (const { dayIndex, bytes } of resolvedRevealPhotos) {
      if (bytes) revealArtwork[dayIndex] = await document.embedPng(bytes);
    }
  }
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
  bookletDayPageEntries(booklet.dayPlans).forEach((entry) => {
    const dayIndex = booklet.dayPlans.indexOf(entry.day);
    if (entry.kind === "queue") {
      drawQueuePage(document, fonts, booklet, dayIndex, pageNumber, totalPages, coloringArtwork);
    } else if (entry.kind === "reveal") {
      drawRevealPage(document, fonts, booklet, dayIndex, pageNumber, totalPages, revealArtwork[dayIndex]);
    } else {
      drawActivityPage(
        document,
        fonts,
        booklet,
        entry.activity,
        dayIndex,
        entry.activityIndex,
        pageNumber,
        totalPages,
        coloringArtwork,
      );
    }
    pageNumber += 1;
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
