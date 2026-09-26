import { PDFDocument, type PDFPage } from "pdf-lib";
import { STICKERS_PER_SHEET, stickersForBooklet, type Sticker } from "../booklet/stickers.ts";
import type { GeneratedBookletData } from "../generation/booklet-ai.ts";
import { drawStickerIcon } from "./art/icons.ts";
import { STICKER_DIAMETER, STICKER_TONES, type FamilyPackContext, type FontResolver } from "./context.ts";
import { bookletPdfFilename, loadBookletFonts } from "./document.ts";
import { drawPill, drawText, fitTextSize, pdfText, type Fonts } from "./layout.ts";
import { normalizedBooklet } from "./plan.ts";
import { PAGE_HEIGHT, PAGE_SIZE, PAGE_WIDTH, colors } from "./theme.ts";

// The kit's sticker sheets: A5 pages of 30mm circles, 4 across and 5 down,
// printed on full-sheet sticker paper and cut with a 30mm circle punch (or
// kiss-cut by the print shop). Every sticker comes from the same plan as
// the booklet's sticker spots (app/lib/booklet/stickers.ts).

const MM = 72 / 25.4;
export const STICKER_COLUMNS = 4;
export const STICKER_ROWS = 5;
export const STICKER_GAP = 5 * MM;
// Colour runs 0.5mm past the cut line so a slightly-off punch leaves no
// white edge; icons and words stay inside 24mm, clear of the cut.
const BLEED_RADIUS = STICKER_DIAMETER / 2 + 0.5 * MM;
const SAFE_WIDTH = 22 * MM;
const GRID_TOP = PAGE_HEIGHT - 66;

export function stickerCellCenters() {
  const gridWidth = STICKER_COLUMNS * STICKER_DIAMETER + (STICKER_COLUMNS - 1) * STICKER_GAP;
  const left = (PAGE_WIDTH - gridWidth) / 2;
  return Array.from({ length: STICKER_COLUMNS * STICKER_ROWS }, (_, index) => ({
    x: left + (index % STICKER_COLUMNS) * (STICKER_DIAMETER + STICKER_GAP) + STICKER_DIAMETER / 2,
    y: GRID_TOP - Math.floor(index / STICKER_COLUMNS) * (STICKER_DIAMETER + STICKER_GAP) - STICKER_DIAMETER / 2,
  }));
}

export function stickerSheetsPdfFilename(booklet: Pick<GeneratedBookletData, "destination" | "age">) {
  return bookletPdfFilename(booklet).replace(/\.pdf$/i, "-stickers.pdf");
}

function chunk<T>(values: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) chunks.push(values.slice(index, index + size));
  return chunks;
}

function drawCutGuide(page: PDFPage, cx: number, cy: number) {
  page.drawCircle({ x: cx, y: cy, size: STICKER_DIAMETER / 2, borderColor: colors.muted, borderWidth: 0.5, borderDashArray: [1.5, 2.5] });
}

function drawSticker(page: PDFPage, fonts: Fonts, sticker: Sticker, cx: number, cy: number) {
  const tone = STICKER_TONES[sticker.tone % STICKER_TONES.length];
  const special = sticker.kind === "seal" || sticker.kind === "master" || sticker.kind === "name";
  page.drawCircle({ x: cx, y: cy, size: BLEED_RADIUS, color: special ? tone.ink : tone.soft });
  page.drawCircle({ x: cx, y: cy, size: STICKER_DIAMETER / 2 - 4, borderColor: colors.white, borderWidth: 1.6 });
  const ink = special ? colors.white : tone.ink;
  const textColor = special ? colors.white : colors.ink;
  const font = sticker.kind === "name" ? fonts.display : fonts.bold;
  const size = fitTextSize(sticker.label, font, SAFE_WIDTH, sticker.kind === "name" ? 13 : 10.5, 8, 2);
  const twoLines = drawText(null, sticker.label, fonts, { x: 0, top: 0, width: SAFE_WIDTH }, { size, font, maxLines: 2, lineHeight: size * 1.1 }).lines.length > 1;
  const dayTag = sticker.kind === "game" && sticker.spot.page === "activity";
  // Icon, label and the day tag stack as one block centred in the circle.
  const lift = (twoLines ? size * 0.55 : 0) + (dayTag ? 5 : 0);
  drawStickerIcon(page, fonts, sticker.icon, cx, cy + 13 + lift - (twoLines && dayTag ? 2 : 0), twoLines && dayTag ? 18 : 22, ink);
  const labelTop = cy - 1 + lift - size * 0.25;
  drawText(page, sticker.label, fonts, { x: cx - SAFE_WIDTH / 2, top: labelTop, width: SAFE_WIDTH }, {
    size, font, color: textColor, maxLines: 2, align: "center", lineHeight: size * 1.1,
  });
  if (dayTag && sticker.spot.page === "activity") {
    const tagTop = labelTop - (twoLines ? size * 2.2 : size * 1.1) - 2;
    drawText(page, `Day ${sticker.spot.day}`, fonts, { x: cx - SAFE_WIDTH / 2, top: tagTop, width: SAFE_WIDTH }, {
      size: 8, font: fonts.bold, color: tone.ink, maxLines: 1, align: "center",
    });
  }
  drawCutGuide(page, cx, cy);
}

function drawSheetHeader(page: PDFPage, fonts: Fonts, title: string, subtitle: string, sheetLabel: string, accent: typeof STICKER_TONES[number]) {
  const left = stickerCellCenters()[0].x - STICKER_DIAMETER / 2;
  const right = PAGE_WIDTH - left;
  page.drawRectangle({ x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT, color: colors.white });
  const pill = drawPill(page, fonts, sheetLabel, { x: right, top: PAGE_HEIGHT - 16, color: accent.ink, fill: accent.soft, size: 8, align: "right" });
  drawText(page, title, fonts, { x: left, top: PAGE_HEIGHT - 16, width: pill.x - left - 8 }, { size: 15, font: fonts.display, color: colors.ink, maxLines: 1 });
  drawText(page, subtitle, fonts, { x: left, top: PAGE_HEIGHT - 38, width: right - left }, { size: 8.5, color: colors.muted, maxLines: 1 });
}

function drawSheetFooter(page: PDFPage, fonts: Fonts, text: string) {
  drawText(page, text, fonts, { x: 20, top: 26, width: PAGE_WIDTH - 40 }, { size: 8, color: colors.muted, maxLines: 1, align: "center" });
}

export async function createStickerSheetPdf(
  input: GeneratedBookletData,
  familyPack?: FamilyPackContext,
  resolveFontBytes?: FontResolver,
  options: { alignmentPage?: boolean } = {},
) {
  const booklet = normalizedBooklet(input);
  const stickers = stickersForBooklet(booklet, familyPack);
  const document = await PDFDocument.create();
  const fonts = await loadBookletFonts(document, resolveFontBytes);
  const nameSticker = stickers.find((sticker) => sticker.kind === "name");
  const owner = nameSticker && nameSticker.label !== "Explorer" ? `${pdfText(nameSticker.label)}'s ` : "";
  const destination = pdfText(booklet.destination);
  const edition = booklet.editionFingerprint ? ` · Edition ${booklet.editionFingerprint.slice(0, 8).toUpperCase()}` : "";

  document.setTitle(`${destination} stickers - Age ${booklet.age}`);
  document.setAuthor("TripQuest");
  document.setSubject("TripQuest sticker sheets: 30mm circles on A5 sticker paper");
  document.setCreator("TripQuest Kids");
  document.setProducer("TripQuest Kids");

  const sheets = [
    ...chunk(stickers.filter((sticker) => sticker.sheet === "game"), STICKERS_PER_SHEET).map((items) => ({ kind: "game" as const, items })),
    ...chunk(stickers.filter((sticker) => sticker.sheet === "envelope"), STICKERS_PER_SHEET).map((items) => ({ kind: "envelope" as const, items })),
  ];
  const cells = stickerCellCenters();
  sheets.forEach((sheet, index) => {
    const page = document.addPage(PAGE_SIZE);
    const envelope = sheet.kind === "envelope";
    drawSheetHeader(
      page,
      fonts,
      envelope ? "Mystery envelope stickers" : `${owner}${destination} stickers`,
      envelope
        ? `Keep these sealed until the treat trail is done!${edition}`
        : `Finish a game, add its sticker to the booklet · Age ${booklet.age}${edition}`,
      `Sheet ${index + 1} of ${sheets.length}`,
      envelope ? STICKER_TONES[2] : STICKER_TONES[1],
    );
    sheet.items.forEach((sticker, cell) => drawSticker(page, fonts, sticker, cells[cell].x, cells[cell].y));
    drawSheetFooter(page, fonts, "30mm circles · cut on the dotted line or use a 30mm circle punch");
  });

  if (options.alignmentPage) {
    const page = document.addPage(PAGE_SIZE);
    drawSheetHeader(page, fonts, "Print test", "Print at 100% (actual size) on plain paper. Each circle should measure 30mm.", "Test", STICKER_TONES[3]);
    for (const cell of cells) {
      drawCutGuide(page, cell.x, cell.y);
      page.drawLine({ start: { x: cell.x - 4, y: cell.y }, end: { x: cell.x + 4, y: cell.y }, thickness: 0.5, color: colors.muted });
      page.drawLine({ start: { x: cell.x, y: cell.y - 4 }, end: { x: cell.x, y: cell.y + 4 }, thickness: 0.5, color: colors.muted });
    }
    drawSheetFooter(page, fonts, "Hold this over a sticker sheet against the light: the circles should line up");
  }
  return document.save();
}
