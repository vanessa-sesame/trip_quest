import type { PDFDocument, PDFImage, PDFPage, RGB } from "pdf-lib";
import type { Activity } from "../booklet/booklet.ts";
import { coloringSceneFor, curatedColoringImagePath } from "../booklet/coloring.ts";
import type { FamilyChild, ItineraryEvent, QuestMechanic } from "../family.ts";
import type { GeneratedBookletData } from "../generation/booklet-ai.ts";
import { drawRoundedRect } from "./illustrations.ts";
import { drawPill, drawText, fitTextSize, pdfText, type Fonts } from "./layout.ts";
import {
  CONTENT_TOP,
  CONTENT_WIDTH,
  MARGIN,
  PAGE_HEIGHT,
  PAGE_SIZE,
  PAGE_WIDTH,
  colors,
  type DestinationTheme,
  type TypeScale,
} from "./theme.ts";

export type FamilyPackContext = {
  children: FamilyChild[];
  events: ItineraryEvent[];
  mechanicsByDay: Array<{ day: number; mechanics: QuestMechanic[] }>;
};

export type ColoringImageResolver = (path: string) => Promise<Uint8Array | null>;
export type FontResolver = (path: string) => Promise<Uint8Array | null>;
export type ColoringArtwork = Record<string, PDFImage>;

// Everything a page renderer needs, created once per PDF by document.ts.
export type PdfContext = {
  document: PDFDocument;
  fonts: Fonts;
  booklet: GeneratedBookletData;
  theme: DestinationTheme;
  type: TypeScale;
  totalPages: number;
  pageNumber: number;
  artwork: ColoringArtwork;
  revealArtwork: Record<number, PDFImage>;
  coverArtwork?: PDFImage;
  familyPack?: FamilyPackContext;
};

export function coloringArtworkKey(activity: Activity, context: string) {
  const scene = coloringSceneFor(activity, context);
  return activity.illustrationPath || curatedColoringImagePath(activity, context) || scene;
}

// Adds a page with the shared chrome: paper, a scalloped accent band across
// the top, and a quiet footer with the page number in a round badge.
export function addPage(ctx: PdfContext, section: string, accent: RGB) {
  ctx.pageNumber += 1;
  const page = ctx.document.addPage(PAGE_SIZE);
  page.drawRectangle({ x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT, color: colors.paper });
  const bandHeight = 9;
  page.drawRectangle({ x: 0, y: PAGE_HEIGHT - bandHeight, width: PAGE_WIDTH, height: bandHeight, color: accent });
  for (let x = 6; x < PAGE_WIDTH; x += 12) {
    page.drawCircle({ x, y: PAGE_HEIGHT - bandHeight, size: 4, color: accent });
  }

  const footerSize = ctx.type.footer;
  const footer = `TRIPQUEST  /  ${pdfText(section).toUpperCase()}`;
  page.drawText(footer, { x: MARGIN, y: 17, size: footerSize, font: ctx.fonts.bold, color: colors.muted });
  const number = String(ctx.pageNumber);
  const badgeRadius = 9;
  const badgeX = PAGE_WIDTH - MARGIN - badgeRadius;
  page.drawCircle({ x: badgeX, y: 20, size: badgeRadius, color: colors.white, borderColor: accent, borderWidth: 1.2 });
  page.drawText(number, {
    x: badgeX - ctx.fonts.bold.widthOfTextAtSize(number, footerSize) / 2,
    y: 20 - footerSize * 0.36,
    size: footerSize,
    font: ctx.fonts.bold,
    color: colors.ink,
  });
  return page;
}

// The standard page opening: a kicker pill, then the page title. Returns
// the y the page's content should start at.
export function drawPageHeader(
  ctx: PdfContext,
  page: PDFPage,
  options: { kicker: string; title: string; accent: RGB; soft: RGB; subtitle?: string; titleLines?: number },
) {
  const { fonts, type } = ctx;
  const pill = drawPill(page, fonts, options.kicker, {
    x: MARGIN,
    top: CONTENT_TOP,
    color: options.accent,
    fill: options.soft,
    size: type.label,
    maxWidth: CONTENT_WIDTH,
  });
  const titleLines = options.titleLines ?? 2;
  const titleSize = fitTextSize(options.title, fonts.display, CONTENT_WIDTH, type.title, 15, titleLines);
  const title = drawText(page, options.title, fonts, { x: MARGIN, top: pill.y - 6, width: CONTENT_WIDTH }, {
    size: titleSize,
    font: fonts.display,
    color: colors.ink,
    lineHeight: titleSize * 1.18,
    maxLines: titleLines,
  });
  let y = title.bottom;
  if (options.subtitle) {
    y = drawText(page, options.subtitle, fonts, { x: MARGIN, top: y - 2, width: CONTENT_WIDTH }, {
      size: type.small,
      font: fonts.bold,
      color: colors.muted,
      maxLines: 1,
    }).bottom;
  }
  return y - 10;
}

// A soft rounded "sticker" behind a block of content.
export function drawSticker(page: PDFPage, box: { x: number; y: number; width: number; height: number }, fill: RGB, border?: RGB) {
  drawRoundedRect(page, box, 12, { color: fill, borderColor: border, borderWidth: border ? 1.2 : undefined });
}
