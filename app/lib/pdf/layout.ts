import type { PDFFont, PDFPage, RGB } from "pdf-lib";
import { colors, minReadableSize, radius as radii } from "./theme.ts";
import { drawIllustratedCheckbox, drawRoundedRect } from "./illustrations.ts";

// Text and layout primitives shared by every page and game renderer.
//
// Text is positioned by the TOP of its block, never by a hand-picked
// baseline: each line occupies a line box of `size * lineHeight`, and the
// baseline sits at a fixed offset inside that box. That one rule is what
// lets the Flow cursor stack blocks without overlaps, and what lets
// drawBulletList put every marker on the same optical line as its text.

export type Fonts = {
  regular: PDFFont;
  bold: PDFFont;
  mono: PDFFont;
  monoBold: PDFFont;
  // Hand-lettered face for titles only; everything else is Nunito Sans.
  display: PDFFont;
};

export type Box = { x: number; y: number; width: number; height: number };

export const DEFAULT_LINE_HEIGHT = 1.35;
// Where the baseline sits below the top of a line box, as a share of the
// font size, before the half-leading is added (roughly the ascender).
const BASELINE_RATIO = 0.8;

export function pdfText(value: string) {
  const normalized = value
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/·/g, " / ")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
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

export function wrapText(
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

export function lineHeightFor(size: number, ratio = DEFAULT_LINE_HEIGHT) {
  return size * ratio;
}

// Distance from the top of a line box to that line's baseline.
export function baselineOffset(size: number, lineHeight = lineHeightFor(size)) {
  return (lineHeight - size) / 2 + size * BASELINE_RATIO;
}

// The font's x-height as a share of its size, read from the embedded font
// program when pdf-lib exposes it; 0.5 is a safe default for sans faces.
export function xHeightRatio(font: PDFFont) {
  const embedded = (font as unknown as { embedder?: { font?: { xHeight?: number; unitsPerEm?: number; XHeight?: number } } })
    .embedder?.font;
  const ratio = embedded?.xHeight && embedded.unitsPerEm
    ? embedded.xHeight / embedded.unitsPerEm
    : embedded?.XHeight
      ? embedded.XHeight / 1000
      : 0.5;
  // Some display faces ship implausible OS/2 metrics; never trust those.
  return ratio >= 0.42 && ratio <= 0.6 ? ratio : 0.5;
}

export type TextStyle = {
  size: number;
  font?: PDFFont;
  color?: RGB;
  lineHeight?: number;
  maxLines?: number;
  align?: "left" | "center" | "right";
  opacity?: number;
};

export type TextBlock = {
  lines: string[];
  height: number;
  bottom: number;
  baselines: number[];
};

export function measureText(value: string, fonts: Fonts, width: number, style: TextStyle) {
  const font = style.font ?? fonts.regular;
  const lineHeight = style.lineHeight ?? lineHeightFor(style.size);
  const lines = wrapText(value, font, style.size, width, style.maxLines);
  return { lines, height: lines.length * lineHeight, lineHeight };
}

// Draws wrapped text whose first line box starts at `top`, and returns
// where the block ends so the next element can start below it. With a null
// page it only measures.
export function drawText(
  page: PDFPage | null,
  value: string,
  fonts: Fonts,
  box: { x: number; top: number; width: number },
  style: TextStyle,
): TextBlock {
  const font = style.font ?? fonts.regular;
  const size = Math.max(minReadableSize, style.size);
  const lineHeight = style.lineHeight ?? lineHeightFor(size);
  const lines = wrapText(value, font, size, box.width, style.maxLines);
  const firstBaseline = box.top - baselineOffset(size, lineHeight);
  const baselines = lines.map((line, index) => {
    const baseline = firstBaseline - index * lineHeight;
    const width = font.widthOfTextAtSize(line, size);
    const x = style.align === "center"
      ? box.x + (box.width - width) / 2
      : style.align === "right"
        ? box.x + box.width - width
        : box.x;
    page?.drawText(line, { x, y: baseline, size, font, color: style.color ?? colors.ink, opacity: style.opacity });
    return baseline;
  });
  const height = lines.length * lineHeight;
  return { lines, height, bottom: box.top - height, baselines };
}

// Largest size in [minimum, preferred] at which `value` fits in maxLines.
export function fitTextSize(
  value: string,
  font: PDFFont,
  maxWidth: number,
  preferred: number,
  minimum: number,
  maxLines = 1,
) {
  let size = preferred;
  while (size > minimum && wrapText(value, font, size, maxWidth, maxLines + 1).length > maxLines) size -= 0.5;
  return Math.max(minimum, size);
}

export function centeredX(value: string, font: PDFFont, size: number, box: Pick<Box, "x" | "width">) {
  return box.x + Math.max(0, (box.width - font.widthOfTextAtSize(pdfText(value), size)) / 2);
}

export function drawDottedLine(
  page: PDFPage,
  startX: number,
  endX: number,
  y: number,
  color: RGB = colors.line,
  dot = 3,
  gap = 4,
) {
  for (let x = startX; x < endX; x += dot + gap) {
    page.drawLine({ start: { x, y }, end: { x: Math.min(x + dot, endX), y }, thickness: 1, color });
  }
}

// Ruled writing lines, evenly spaced, filling `box` from the top down.
export function drawWriteLines(page: PDFPage, box: Box, pitch = 22, color: RGB = colors.line) {
  for (let y = box.y + box.height - pitch; y >= box.y + 2; y -= pitch) {
    drawDottedLine(page, box.x, box.x + box.width, y, color, 2.5, 3);
  }
}

// ---------------------------------------------------------------------------
// Bullet lists
// ---------------------------------------------------------------------------

export type BulletMarker = "dot" | "number" | "letter" | "check";
// `marker` overrides the automatic number/letter (e.g. "2A" for a crossword).
export type BulletItem = string | { title?: string; text?: string; marker?: string };

export type BulletListOptions = {
  x: number;
  top: number;
  width: number;
  size: number;
  marker?: BulletMarker;
  color?: RGB;
  markerColor?: RGB;
  markerFill?: RGB;
  gap?: number;
  maxLines?: number;
  lineHeight?: number;
  // Minimum height per row (for write-in space under each item).
  minRowHeight?: number;
};

export type BulletRow = {
  top: number;
  bottom: number;
  firstBaseline: number;
  markerCenter: { x: number; y: number };
  textX: number;
};

export function bulletMarkerRadius(marker: BulletMarker, size: number) {
  if (marker === "dot") return Math.max(1.8, size * 0.18);
  if (marker === "check") return size * 0.62;
  return size * 0.78;
}

// The one list primitive every page uses. Each marker is centred on the
// optical middle of its item's first line (baseline + half the x-height),
// so dots, numbered badges and checkboxes line up with the words next to
// them at any size. With a null page it only measures.
export function drawBulletList(
  page: PDFPage | null,
  fonts: Fonts,
  items: BulletItem[],
  options: BulletListOptions,
) {
  const marker = options.marker ?? "dot";
  const size = Math.max(minReadableSize, options.size);
  const lineHeight = options.lineHeight ?? lineHeightFor(size);
  const markerColor = options.markerColor ?? colors.coral;
  const markerRadius = bulletMarkerRadius(marker, size);
  const indent = markerRadius * 2 + (marker === "dot" ? 7 : 8);
  const textX = options.x + indent;
  const textWidth = options.width - indent;
  const gap = options.gap ?? size * 0.55;
  const rows: BulletRow[] = [];
  let top = options.top;

  items.forEach((item, index) => {
    const title = typeof item === "string" ? "" : item.title ?? "";
    const body = typeof item === "string" ? item : item.text ?? "";
    let cursor = top;
    let firstBaseline: number | undefined;
    let firstFont = fonts.regular;
    if (title) {
      const block = drawText(page, title, fonts, { x: textX, top: cursor, width: textWidth }, {
        size, font: fonts.bold, color: options.color ?? colors.ink, lineHeight, maxLines: 2,
      });
      firstBaseline = block.baselines[0];
      firstFont = fonts.bold;
      cursor = block.bottom;
    }
    if (body) {
      const block = drawText(page, body, fonts, { x: textX, top: cursor, width: textWidth }, {
        size: title ? Math.max(minReadableSize, size - 1.5) : size,
        color: title ? colors.muted : options.color ?? colors.ink,
        lineHeight: title ? lineHeightFor(Math.max(minReadableSize, size - 1.5)) : lineHeight,
        maxLines: options.maxLines,
      });
      firstBaseline ??= block.baselines[0];
      cursor = block.bottom;
    }
    const baseline = firstBaseline ?? top - baselineOffset(size, lineHeight);
    const center = { x: options.x + markerRadius, y: baseline + (size * xHeightRatio(firstFont)) / 2 };
    const label = typeof item === "string" ? undefined : item.marker;
    if (page) drawBulletMarker(page, fonts, marker, index, center, markerRadius, markerColor, options.markerFill, label);
    const bottom = Math.min(cursor, center.y - markerRadius, top - (options.minRowHeight ?? 0));
    rows.push({ top, bottom, firstBaseline: baseline, markerCenter: center, textX });
    top = bottom - gap;
  });

  return { rows, bottom: rows.length ? rows[rows.length - 1].bottom : options.top };
}

function drawBulletMarker(
  page: PDFPage,
  fonts: Fonts,
  marker: BulletMarker,
  index: number,
  center: { x: number; y: number },
  radius: number,
  color: RGB,
  fill?: RGB,
  customLabel?: string,
) {
  if (marker === "dot") {
    page.drawCircle({ x: center.x, y: center.y, size: radius, color });
    return;
  }
  if (marker === "check") {
    const side = radius * 2;
    drawIllustratedCheckbox(page, center.x - radius, center.y - radius, side, color);
    return;
  }
  const label = customLabel ?? (marker === "number" ? String(index + 1) : String.fromCharCode(65 + index));
  drawNumberBadge(page, fonts, label, center, radius, color, fill);
}

// A filled circle with a centred number or letter, the booklet's standard
// counter. The glyph is centred on its cap height, not its baseline.
export function drawNumberBadge(
  page: PDFPage,
  fonts: Fonts,
  label: string,
  center: { x: number; y: number },
  radius: number,
  color: RGB,
  fill?: RGB,
) {
  page.drawCircle({ x: center.x, y: center.y, size: radius, color: fill ?? color, borderColor: fill ? color : undefined, borderWidth: fill ? 1.2 : 0 });
  let size = Math.max(minReadableSize, radius * 1.15);
  while (size > minReadableSize && fonts.bold.widthOfTextAtSize(label, size) > radius * 1.7) size -= 0.5;
  const width = fonts.bold.widthOfTextAtSize(label, size);
  page.drawText(label, {
    x: center.x - width / 2,
    y: center.y - size * 0.36,
    size,
    font: fonts.bold,
    color: fill ? color : colors.white,
  });
}

// ---------------------------------------------------------------------------
// Stickers, pills and cards — the rounded vocabulary
// ---------------------------------------------------------------------------

export function drawCard(page: PDFPage, box: Box, options: { fill?: RGB; border?: RGB; borderWidth?: number; radius?: number } = {}) {
  drawRoundedRect(page, box, options.radius ?? radii.card, {
    color: options.fill,
    borderColor: options.border,
    borderWidth: options.border ? options.borderWidth ?? 1.2 : undefined,
  });
}

// A rounded label pill; `top` is the pill's top edge. Returns its box.
export function drawPill(
  page: PDFPage,
  fonts: Fonts,
  label: string,
  options: { x: number; top: number; color: RGB; fill: RGB; size?: number; align?: "left" | "right"; maxWidth?: number },
) {
  const size = options.size ?? 8.5;
  const text = pdfText(label).toUpperCase();
  const padX = size * 0.9;
  const height = size * 2;
  let textSize = size;
  if (options.maxWidth) {
    while (textSize > minReadableSize && fonts.bold.widthOfTextAtSize(text, textSize) + padX * 2 > options.maxWidth) textSize -= 0.5;
  }
  const width = fonts.bold.widthOfTextAtSize(text, textSize) + padX * 2;
  const x = options.align === "right" ? options.x - width : options.x;
  const box = { x, y: options.top - height, width, height };
  drawRoundedRect(page, box, height / 2, { color: options.fill });
  page.drawText(text, {
    x: x + padX,
    y: box.y + height / 2 - textSize * 0.34,
    size: textSize,
    font: fonts.bold,
    color: options.color,
  });
  return box;
}

// ---------------------------------------------------------------------------
// Flow cursor
// ---------------------------------------------------------------------------

// A top-down layout cursor for one column. Every block measures itself and
// moves the cursor below it, so larger type pushes the content that follows
// down instead of overlapping it.
export class Flow {
  page: PDFPage;
  fonts: Fonts;
  x: number;
  width: number;
  y: number;
  bottom: number;

  constructor(page: PDFPage, fonts: Fonts, area: { x: number; top: number; width: number; bottom: number }) {
    this.page = page;
    this.fonts = fonts;
    this.x = area.x;
    this.width = area.width;
    this.y = area.top;
    this.bottom = area.bottom;
  }

  text(value: string, style: TextStyle, indent = 0) {
    const block = drawText(this.page, value, this.fonts, { x: this.x + indent, top: this.y, width: this.width - indent }, style);
    this.y = block.bottom;
    return block;
  }

  space(amount: number) {
    this.y -= amount;
    return this;
  }

  remaining() {
    return this.y - this.bottom;
  }

  // Reserves `height` below the cursor and returns it as a box.
  take(height: number): Box {
    const box = { x: this.x, y: this.y - height, width: this.width, height };
    this.y -= height;
    return box;
  }

  // Everything left between the cursor and the bottom of the column.
  rest(): Box {
    return { x: this.x, y: this.bottom, width: this.width, height: Math.max(0, this.y - this.bottom) };
  }

  bullets(items: BulletItem[], options: Omit<BulletListOptions, "x" | "top" | "width">, indent = 0) {
    const result = drawBulletList(this.page, this.fonts, items, { ...options, x: this.x + indent, top: this.y, width: this.width - indent });
    this.y = result.bottom;
    return result;
  }
}
