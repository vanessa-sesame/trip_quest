import { PDFDocument, clip, endPath, popGraphicsState, pushGraphicsState, rectangle, type PDFImage, type PDFPage } from "pdf-lib";
import { familyChildDisplayName } from "../family.ts";
import type { GeneratedBookletData } from "../generation/booklet-ai.ts";
import { artContentBounds, type ArtBounds } from "./art-bounds.ts";
import type { ColoringImageResolver, FamilyPackContext, FontResolver } from "./context.ts";
import { bookletPdfFilename, embedIllustration, loadBookletFonts } from "./document.ts";
import { drawDoodleSparkle, drawDoodleStar, drawRoundedRect } from "./illustrations.ts";
import { drawPill, drawText, fitTextSize, pdfText, type Fonts } from "./layout.ts";
import { drawPostcardScene } from "./pages/front.ts";
import { normalizedBooklet } from "./plan.ts";
import { colors, getDestinationTheme, type DestinationTheme } from "./theme.ts";
import { drawRuledLine } from "./writing.ts";

// The mystery envelope's printed inserts, one A6 card each, front then
// back so a duplex print lines up: a postcard with the booklet's own cover
// picture to write home on, and (when a next-kit offer is set) a "next
// adventure" card with its promotion code. The envelope's sticker sheet
// comes from stickers.ts.

const MM = 72 / 25.4;
// A6 landscape, the standard postcard size.
const WIDTH = 148 * MM;
const HEIGHT = 105 * MM;
const EDGE = 8 * MM;

export type NextKitOffer = { code: string; offer: string; site: string };

export function envelopeInsertsPdfFilename(booklet: Pick<GeneratedBookletData, "destination" | "age">) {
  return bookletPdfFilename(booklet).replace(/\.pdf$/i, "-envelope-inserts.pdf");
}

type Card = { page: PDFPage; fonts: Fonts; theme: DestinationTheme };

function addCard(document: PDFDocument, fonts: Fonts, theme: DestinationTheme): Card {
  const page = document.addPage([WIDTH, HEIGHT]);
  page.drawRectangle({ x: 0, y: 0, width: WIDTH, height: HEIGHT, color: colors.white });
  return { page, fonts, theme };
}

function drawCoverPicture(page: PDFPage, art: { image: PDFImage; bounds: ArtBounds } | undefined, box: { x: number; y: number; width: number; height: number }, theme: DestinationTheme, seed: string) {
  if (!art) {
    drawPostcardScene(page, box, theme, seed);
    return;
  }
  // The whole picture, never cropped, centred in the box on white.
  const dims = art.image.scale(1);
  const { bounds } = art;
  const scale = Math.min(box.width / (dims.width * bounds.width), box.height / (dims.height * bounds.height));
  const width = dims.width * bounds.width * scale;
  const height = dims.height * bounds.height * scale;
  const inner = { x: box.x + (box.width - width) / 2, y: box.y + (box.height - height) / 2, width, height };
  const canvasWidth = inner.width / bounds.width;
  const canvasHeight = inner.height / bounds.height;
  page.pushOperators(pushGraphicsState(), rectangle(inner.x, inner.y, inner.width, inner.height), clip(), endPath());
  page.drawImage(art.image, {
    x: inner.x - bounds.x * canvasWidth,
    y: inner.y + inner.height - (1 - bounds.y) * canvasHeight,
    width: canvasWidth,
    height: canvasHeight,
  });
  page.pushOperators(popGraphicsState());
}

function drawPostcardFront(card: Card, booklet: GeneratedBookletData, art: { image: PDFImage; bounds: ArtBounds } | undefined) {
  const { page, fonts, theme } = card;
  const destination = pdfText(booklet.destination);
  const textWidth = WIDTH * 0.36;
  const greeting = drawText(page, "Greetings from", fonts, { x: EDGE, top: HEIGHT - EDGE - 4, width: textWidth }, {
    size: 13, font: fonts.display, color: theme.accent, maxLines: 1,
  });
  // As large as fits with every word whole on its line ("Singapore", not
  // "Singapor-e"), up to three lines.
  const longestWord = destination.split(/\s+/).reduce((longest, word) => (word.length > longest.length ? word : longest), "");
  const wordFit = textWidth / Math.max(1, fonts.display.widthOfTextAtSize(longestWord, 1));
  const size = Math.max(12, Math.min(30, wordFit * 0.98, fitTextSize(destination, fonts.display, textWidth, 30, 12, 3)));
  const title = drawText(page, destination, fonts, { x: EDGE, top: greeting.bottom - 2, width: textWidth }, {
    size, font: fonts.display, color: colors.ink, maxLines: 3, lineHeight: size * 1.05,
  });
  drawDoodleStar(page, EDGE + 8, title.bottom - 14, 6, colors.yellow);
  drawDoodleSparkle(page, EDGE + 26, title.bottom - 24, 5, theme.accent);
  page.drawText("TRIPQUEST KIDS", { x: EDGE, y: EDGE, size: 7.5, font: fonts.bold, color: colors.muted });
  const pictureBox = { x: EDGE + textWidth + 10, y: EDGE, width: WIDTH - EDGE * 2 - textWidth - 10, height: HEIGHT - EDGE * 2 };
  drawRoundedRect(page, { x: pictureBox.x - 4, y: pictureBox.y - 4, width: pictureBox.width + 8, height: pictureBox.height + 8 }, 10, {
    color: colors.white, borderColor: colors.line, borderWidth: 1,
  });
  drawCoverPicture(page, art, pictureBox, theme, `postcard-${booklet.destination}`);
}

function drawPostcardBack(card: Card, booklet: GeneratedBookletData, explorer: string) {
  const { page, fonts, theme } = card;
  const middle = WIDTH / 2;
  page.drawLine({ start: { x: middle, y: EDGE + 4 }, end: { x: middle, y: HEIGHT - EDGE - 4 }, thickness: 0.8, color: colors.line });

  // Message side: a greeting, ruled lines to write on, and who it is from.
  const left = { x: EDGE, width: middle - EDGE - 12 };
  const dear = drawText(page, "Dear", fonts, { x: left.x, top: HEIGHT - EDGE - 2, width: 40 }, { size: 12, font: fonts.display, color: theme.accent, maxLines: 1 });
  const lineGap = 8 * MM;
  let y = dear.baselines[0];
  drawRuledLine(page, left.x + 34, left.x + left.width, y);
  for (let row = 0; row < 6; row += 1) {
    y -= lineGap;
    if (y < EDGE + 22) break;
    drawRuledLine(page, left.x, left.x + left.width, y);
  }
  drawText(page, `From ${explorer}, official ${pdfText(booklet.destination)} Explorer`, fonts, { x: left.x, top: EDGE + 14, width: left.width }, {
    size: 7.5, font: fonts.bold, color: colors.muted, maxLines: 2,
  });

  // Address side: a stamp box and four address lines.
  const stamp = { width: 22 * MM, height: 26 * MM };
  const stampBox = { x: WIDTH - EDGE - stamp.width, y: HEIGHT - EDGE - stamp.height, ...stamp };
  page.drawRectangle({ ...stampBox, borderColor: colors.line, borderWidth: 0.9, borderDashArray: [3, 2.5] });
  const stampLabel = "Stamp";
  page.drawText(stampLabel, {
    x: stampBox.x + (stamp.width - fonts.bold.widthOfTextAtSize(stampLabel, 8)) / 2,
    y: stampBox.y + stamp.height / 2 - 3,
    size: 8,
    font: fonts.bold,
    color: colors.muted,
  });
  const right = { x: middle + 12, end: WIDTH - EDGE };
  for (let row = 0; row < 4; row += 1) {
    drawRuledLine(page, right.x, right.end, EDGE + 14 + row * lineGap);
  }
  drawPill(page, fonts, "To", { x: right.x, top: EDGE + 14 + 4 * lineGap + 14, color: theme.accent, fill: theme.accentSoft, size: 7.5 });
}

function drawNextKitFront(card: Card, offer: NextKitOffer, booklet: GeneratedBookletData) {
  const { page, fonts, theme } = card;
  drawRoundedRect(page, { x: EDGE / 2, y: EDGE / 2, width: WIDTH - EDGE, height: HEIGHT - EDGE }, 14, { color: theme.accentSoft });
  const column = { x: EDGE + 6, width: WIDTH - EDGE * 2 - 12 };
  const headlineText = `Where will you explore after ${pdfText(booklet.destination)}?`;
  const code = offer.code.toUpperCase();
  const codeSize = fitTextSize(code, fonts.bold, column.width - 40, 26, 12, 1);
  const codeHeight = codeSize * 1.9;
  const footer = `Enter it at checkout on ${offer.site} for your next explorer kit.`;
  const headlineStyle = { size: 18, font: fonts.display, color: colors.ink, maxLines: 2, lineHeight: 20 };
  const offerStyle = { size: 12, font: fonts.bold, color: theme.accent, maxLines: 2 };
  const footerStyle = { size: 8.5, color: colors.muted, maxLines: 2 };
  // Lay the block out once to measure it, then centre it on the card.
  const pillHeight = 8 * 2;
  const blockHeight = pillHeight + 10
    + drawText(null, headlineText, fonts, { x: 0, top: 0, width: column.width }, headlineStyle).height + 6
    + drawText(null, offer.offer, fonts, { x: 0, top: 0, width: column.width }, offerStyle).height + 14
    + codeHeight + 10
    + drawText(null, footer, fonts, { x: 0, top: 0, width: column.width }, footerStyle).height;
  const top = (HEIGHT + blockHeight) / 2;
  const pill = drawPill(page, fonts, "Your next adventure", { x: column.x, top, color: theme.accent, fill: colors.white, size: 8 });
  const headline = drawText(page, headlineText, fonts, { x: column.x, top: pill.y - 10, width: column.width }, headlineStyle);
  const offerLine = drawText(page, offer.offer, fonts, { x: column.x, top: headline.bottom - 6, width: column.width }, offerStyle);
  // The code, big and boxed so it is easy to copy.
  const codeWidth = fonts.bold.widthOfTextAtSize(code, codeSize) + 40;
  const codeBox = { x: column.x, y: offerLine.bottom - 14 - codeHeight, width: codeWidth, height: codeHeight };
  drawRoundedRect(page, codeBox, 10, { color: colors.white, borderColor: theme.accent, borderWidth: 1.6 });
  page.drawText(code, { x: codeBox.x + 20, y: codeBox.y + codeHeight / 2 - codeSize * 0.35, size: codeSize, font: fonts.bold, color: colors.ink });
  drawText(page, footer, fonts, { x: column.x, top: codeBox.y - 10, width: column.width }, footerStyle);
  drawDoodleStar(page, WIDTH - EDGE - 24, codeBox.y + codeHeight / 2 + 6, 11, colors.yellow);
  drawDoodleSparkle(page, WIDTH - EDGE - 52, codeBox.y + codeHeight / 2 - 8, 6, theme.accent);
}

function drawNextKitBack(card: Card) {
  const { page, fonts, theme } = card;
  const title = drawText(page, "Where should we explore next?", fonts, { x: EDGE, top: HEIGHT - EDGE - 2, width: WIDTH - EDGE * 2 }, {
    size: 14, font: fonts.display, color: theme.accent, maxLines: 1,
  });
  drawText(page, "Write the place, then draw what you want to see there.", fonts, { x: EDGE, top: title.bottom - 2, width: WIDTH - EDGE * 2 }, {
    size: 8, color: colors.muted, maxLines: 1,
  });
  const placeY = title.bottom - 26;
  page.drawText("Place:", { x: EDGE, y: placeY, size: 9, font: fonts.bold, color: colors.ink });
  drawRuledLine(page, EDGE + 34, WIDTH - EDGE, placeY);
  const drawBox = { x: EDGE, y: EDGE, width: WIDTH - EDGE * 2, height: placeY - EDGE - 12 };
  drawRoundedRect(page, drawBox, 10, { color: colors.white, borderColor: colors.softLine, borderWidth: 1 });
}

export async function createEnvelopeInsertsPdf(
  inputBooklet: GeneratedBookletData,
  familyPack: FamilyPackContext | undefined,
  resolveFontBytes: FontResolver | undefined,
  resolveImage: ColoringImageResolver | undefined,
  offer: NextKitOffer | null,
) {
  const booklet = normalizedBooklet(inputBooklet);
  const document = await PDFDocument.create();
  const fonts = await loadBookletFonts(document, resolveFontBytes);
  document.setTitle(`${pdfText(booklet.destination)} Mystery Envelope Inserts`);
  document.setAuthor("TripQuest");
  document.setCreator("TripQuest Kids");
  document.setProducer("TripQuest Kids");
  const theme = getDestinationTheme(booklet.destination);
  let art: { image: PDFImage; bounds: ArtBounds } | undefined;
  if (booklet.coverIllustrationPath && resolveImage) {
    try {
      const bytes = await resolveImage(booklet.coverIllustrationPath);
      if (bytes) art = { image: await embedIllustration(document, bytes), bounds: artContentBounds(bytes) ?? { x: 0, y: 0, width: 1, height: 1 } };
    } catch (error) {
      console.error("[TripQuest illustration] postcard cover art", error);
    }
  }
  const children = familyPack?.children ?? [];
  const named = children.length
    ? children.map((child, index) => pdfText(familyChildDisplayName(child, index))).join(" & ")
    : "";
  const explorer = named && !/^Explorer \d+$/.test(named) ? named : "me";

  drawPostcardFront(addCard(document, fonts, theme), booklet, art);
  drawPostcardBack(addCard(document, fonts, theme), booklet, explorer);
  if (offer) {
    drawNextKitFront(addCard(document, fonts, theme), offer, booklet);
    drawNextKitBack(addCard(document, fonts, theme));
  }
  return document.save();
}
