import type { PDFDocument, PDFImage, PDFPage, RGB } from "pdf-lib";
import type { Activity } from "../booklet/booklet.ts";
import { coloringSceneFor, curatedColoringImagePath } from "../booklet/coloring.ts";
import type { FamilyChild, ItineraryEvent, QuestMechanic } from "../family.ts";
import { stickerForSpot, type Sticker, type StickerSpot } from "../booklet/stickers.ts";
import { drawStickerIcon } from "./art/icons.ts";
import type { ArtBounds } from "./art-bounds.ts";
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
  PRINT_BLEED,
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
  // Where the cover art's picture sits inside its canvas (art-bounds.ts).
  coverArtBounds?: ArtBounds;
  familyPack?: FamilyPackContext;
  // Every sticker in the kit and its spot (app/lib/booklet/stickers.ts).
  stickers: Sticker[];
  // Test hook: called for every sticker spot drawn, with where it sits.
  onStickerSpot?: (sticker: Sticker, placed: PlacedStickerSpot) => void;
};

export type PlacedStickerSpot = { page: number; x: number; y: number; radius: number };

// Stickers are 30mm circles (the kit's circle punch).
export const STICKER_DIAMETER = (30 / 25.4) * 72;
export const STICKER_TONES = [
  { ink: colors.coral, soft: colors.coralSoft },
  { ink: colors.teal, soft: colors.tealSoft },
  { ink: colors.yellow, soft: colors.yellowSoft },
  { ink: colors.green, soft: colors.greenSoft },
] as const;

// A dashed circle, a little larger than the sticker, marking where the
// sticker for `spot` goes, with that sticker's icon so children can match
// them. Returns the sticker drawn for, if the kit has one.
export function drawStickerSpot(ctx: PdfContext, page: PDFPage, spot: StickerSpot, cx: number, cy: number, caption = "Sticker here") {
  const sticker = stickerForSpot(ctx.stickers, spot);
  if (!sticker) return undefined;
  const tone = STICKER_TONES[sticker.tone % STICKER_TONES.length];
  const radius = STICKER_DIAMETER / 2 + 3;
  page.drawCircle({ x: cx, y: cy, size: radius, color: colors.white, borderColor: tone.ink, borderWidth: 1.4, borderDashArray: [4, 3] });
  drawStickerIcon(page, ctx.fonts, sticker.icon, cx, cy + 9, 22, tone.soft);
  const size = ctx.type.label;
  const width = ctx.fonts.bold.widthOfTextAtSize(caption, size);
  page.drawText(caption, { x: cx - width / 2, y: cy - 20, size, font: ctx.fonts.bold, color: tone.ink });
  ctx.onStickerSpot?.(sticker, { page: ctx.pageNumber, x: cx, y: cy, radius });
  return sticker;
}

export function coloringArtworkKey(activity: Activity, context: string) {
  const scene = coloringSceneFor(activity, context);
  return activity.illustrationPath || curatedColoringImagePath(activity, context) || scene;
}

// Adds a page with the shared chrome: paper, a scalloped accent band across
// the top, and a quiet footer with the page number in a round badge.
export function addPage(ctx: PdfContext, section: string, accent: RGB) {
  ctx.pageNumber += 1;
  const page = ctx.document.addPage(PAGE_SIZE);
  const bleed = PRINT_BLEED;
  page.drawRectangle({ x: -bleed, y: -bleed, width: PAGE_WIDTH + bleed * 2, height: PAGE_HEIGHT + bleed * 2, color: colors.paper });
  const bandHeight = 9;
  page.drawRectangle({ x: -bleed, y: PAGE_HEIGHT - bandHeight, width: PAGE_WIDTH + bleed * 2, height: bandHeight + bleed, color: accent });
  for (let x = -6; x < PAGE_WIDTH + bleed; x += 12) {
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
  options: { kicker: string; title: string; accent: RGB; soft: RGB; subtitle?: string; titleLines?: number; stickerSpot?: StickerSpot },
) {
  const { fonts, type } = ctx;
  // A sticker spot sits in the header's top-right corner; the title wraps
  // beside it.
  const spotSticker = options.stickerSpot ? stickerForSpot(ctx.stickers, options.stickerSpot) : undefined;
  const headerWidth = spotSticker ? CONTENT_WIDTH - STICKER_DIAMETER - 14 : CONTENT_WIDTH;
  if (options.stickerSpot && spotSticker) {
    drawStickerSpot(
      ctx,
      page,
      options.stickerSpot,
      PAGE_WIDTH - MARGIN - STICKER_DIAMETER / 2 - 2,
      CONTENT_TOP - STICKER_DIAMETER / 2 - 1,
      spotSticker.kind === "day" ? "Day badge!" : "Done? Sticker!",
    );
  }
  const pill = drawPill(page, fonts, options.kicker, {
    x: MARGIN,
    top: CONTENT_TOP,
    color: options.accent,
    fill: options.soft,
    size: type.label,
    maxWidth: headerWidth,
  });
  const titleLines = options.titleLines ?? 2;
  const titleSize = fitTextSize(options.title, fonts.display, headerWidth, type.title, 15, titleLines);
  const title = drawText(page, options.title, fonts, { x: MARGIN, top: pill.y - 6, width: headerWidth }, {
    size: titleSize,
    font: fonts.display,
    color: colors.ink,
    lineHeight: titleSize * 1.18,
    maxLines: titleLines,
  });
  let y = title.bottom;
  if (options.subtitle) {
    y = drawText(page, options.subtitle, fonts, { x: MARGIN, top: y - 2, width: headerWidth }, {
      size: type.small,
      font: fonts.bold,
      color: colors.muted,
      maxLines: 1,
    }).bottom;
  }
  // Content starts below the sticker spot too.
  return spotSticker ? Math.min(y - 10, CONTENT_TOP - STICKER_DIAMETER - 10) : y - 10;
}

// A soft rounded "sticker" behind a block of content.
export function drawSticker(page: PDFPage, box: { x: number; y: number; width: number; height: number }, fill: RGB, border?: RGB) {
  drawRoundedRect(page, box, 12, { color: fill, borderColor: border, borderWidth: border ? 1.2 : undefined });
}
