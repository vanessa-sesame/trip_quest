import { PDFDocument, clip, endPath, popGraphicsState, pushGraphicsState, rectangle, type PDFImage, type PDFPage, type RGB } from "pdf-lib";
import { familyChildDisplayName } from "../family.ts";
import type { GeneratedBookletData } from "../generation/booklet-ai.ts";
import { artContentBounds, type ArtBounds } from "./art-bounds.ts";
import type { ColoringImageResolver, FamilyPackContext, FontResolver } from "./context.ts";
import { bookletPdfFilename, embedIllustration, loadBookletFonts } from "./document.ts";
import { drawDoodleSparkle, drawDoodleStar, drawHandLine, drawRoundedRect, drawStampCircle } from "./illustrations.ts";
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
// Cards are trimmed by the print shop, so colour that runs to the edge
// goes 3mm past it (the file's trim box is the A6 card).
const BLEED = 3 * MM;

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

// A postage-stamp frame: a white card whose edges are bitten by small
// half-circles in the background colour, like perforations.
function drawPerforatedFrame(page: PDFPage, box: { x: number; y: number; width: number; height: number }, background: RGB) {
  page.drawRectangle({ x: box.x + 2.5, y: box.y - 2.5, width: box.width, height: box.height, color: colors.ink, opacity: 0.12 });
  page.drawRectangle({ ...box, color: colors.white });
  const radius = 3.2;
  const step = 10;
  for (let x = box.x + step / 2; x < box.x + box.width; x += step) {
    page.drawCircle({ x, y: box.y, size: radius, color: background });
    page.drawCircle({ x, y: box.y + box.height, size: radius, color: background });
  }
  for (let y = box.y + step / 2; y < box.y + box.height; y += step) {
    page.drawCircle({ x: box.x, y, size: radius, color: background });
    page.drawCircle({ x: box.x + box.width, y, size: radius, color: background });
  }
}

// Wavy postmark cancellation lines.
function drawPostmarkWaves(page: PDFPage, x: number, y: number, width: number, color: RGB) {
  const segments = 6;
  const step = width / segments;
  const wave = `M 0,0 Q ${step / 2},-3 ${step},0${Array.from({ length: segments - 1 }, (_, index) => ` T ${step * (index + 2)},0`).join("")}`;
  for (let row = 0; row < 3; row += 1) {
    page.drawSvgPath(wave, { x, y: y - row * 6, borderColor: color, borderWidth: 1, borderOpacity: 0.75 });
  }
}

function drawPostcardFront(card: Card, booklet: GeneratedBookletData, art: { image: PDFImage; bounds: ArtBounds } | undefined) {
  const { page, fonts, theme } = card;
  const background = theme.accentSoft;
  page.drawRectangle({ x: -BLEED, y: -BLEED, width: WIDTH + BLEED * 2, height: HEIGHT + BLEED * 2, color: background });

  // The picture, in a perforated postage-stamp frame on the left.
  const frame = { x: EDGE + 2, y: EDGE + 2, width: WIDTH * 0.52, height: HEIGHT - EDGE * 2 - 4 };
  drawPerforatedFrame(page, frame, background);
  const inset = 11;
  drawCoverPicture(page, art, { x: frame.x + inset, y: frame.y + inset, width: frame.width - inset * 2, height: frame.height - inset * 2 }, theme, `postcard-${booklet.destination}`);

  // "Greetings from" and the destination in big shadowed letters.
  const column = { x: frame.x + frame.width + 18, width: WIDTH - EDGE - (frame.x + frame.width + 18) };
  const greeting = drawText(page, "Greetings from", fonts, { x: column.x, top: HEIGHT - EDGE - 4, width: column.width }, {
    size: fitTextSize("Greetings from", fonts.display, column.width, 16, 11, 1), font: fonts.display, color: theme.accent, maxLines: 1,
  });
  const destination = pdfText(booklet.destination).toLocaleUpperCase();
  const words = destination.split(/\s+/);
  const longest = words.reduce((widest, word) => Math.max(widest, fonts.display.widthOfTextAtSize(word, 1)), 1);
  const size = Math.max(14, Math.min(40, (column.width - 3) / longest, 110 / Math.max(1, words.length)));
  let baseline = greeting.bottom - size * 0.92;
  // Sticker lettering: ink letters over a coral offset shadow.
  for (const word of words) {
    page.drawText(word, { x: column.x + 2.2, y: baseline - 2.2, size, font: fonts.display, color: colors.coral });
    page.drawText(word, { x: column.x, y: baseline, size, font: fonts.display, color: colors.ink });
    baseline -= size * 1.02;
  }

  // A dotted flight path ending in a little paper plane, and a postmark
  // overlapping the frame's corner.
  const pathTop = baseline + size * 0.55;
  page.drawSvgPath(`M 0,0 C ${column.width * 0.35},-26 ${column.width * 0.55},12 ${column.width * 0.82},-14`, {
    x: column.x, y: pathTop - 8, borderColor: theme.accent, borderWidth: 1.2, borderDashArray: [2, 3],
  });
  const planeX = column.x + column.width * 0.82;
  const planeY = pathTop - 22;
  // A paper plane: two triangles folded along a centre crease.
  page.drawSvgPath("M 0,6 L 18,0 L 6,10 Z", { x: planeX, y: planeY + 16, color: colors.white, borderColor: colors.ink, borderWidth: 1 });
  page.drawSvgPath("M 6,10 L 18,0 L 8,15 Z", { x: planeX, y: planeY + 16, color: theme.accentSoft, borderColor: colors.ink, borderWidth: 1 });
  // "Say it like a local": the booklet's own local word, on a luggage tag.
  const word = pdfText(booklet.profile.word || "");
  if (word) {
    const tagTop = pathTop - 40;
    const textHeight = drawText(null, word, fonts, { x: 0, top: 0, width: column.width - 20 }, { size: 9.5, font: fonts.bold, maxLines: 3 }).height;
    const tag = { x: column.x, y: tagTop - (7.5 * 2 + 10 + textHeight + 10), width: column.width, height: 7.5 * 2 + 10 + textHeight + 10 };
    if (tag.y > frame.y + 62) {
      drawRoundedRect(page, tag, 9, { color: colors.white, borderColor: theme.accent, borderWidth: 1 });
      page.drawCircle({ x: tag.x + tag.width - 11, y: tag.y + tag.height - 11, size: 3, color: background, borderColor: theme.accent, borderWidth: 0.8 });
      const pill = drawPill(page, fonts, "Say it like a local", { x: tag.x + 9, top: tag.y + tag.height - 8, color: theme.accent, fill: theme.accentSoft, size: 7.5 });
      drawText(page, word, fonts, { x: tag.x + 10, top: pill.y - 6, width: tag.width - 20 }, { size: 9.5, font: fonts.bold, color: colors.ink, maxLines: 3 });
    }
  }
  const year = new Date(booklet.generatedAt).getFullYear();
  drawStampCircle(page, fonts, frame.x + frame.width - 6, frame.y + 30, 24, colors.coral, colors.coralSoft, String(year));
  drawPostmarkWaves(page, frame.x + frame.width + 20, frame.y + 34, 58, colors.coral);
  drawDoodleSparkle(page, WIDTH - EDGE - 6, frame.y + 42, 5, colors.yellow);
  page.drawText("TRIPQUEST KIDS", { x: column.x, y: EDGE + 2, size: 7.5, font: fonts.bold, color: theme.accent });
}

function drawPostcardBack(card: Card, booklet: GeneratedBookletData, explorer: string) {
  const { page, fonts, theme } = card;
  // An airmail border: alternating coral and indigo dashes round the edge.
  const border = { x: 5 * MM, y: 5 * MM, width: WIDTH - 10 * MM, height: HEIGHT - 10 * MM };
  page.drawRectangle({ ...border, borderColor: colors.coral, borderWidth: 5, borderDashArray: [9, 9] });
  page.drawRectangle({ ...border, borderColor: colors.teal, borderWidth: 5, borderDashArray: [9, 9], borderDashPhase: 9 });

  const top = HEIGHT - 11 * MM;
  const label = "P O S T   C A R D";
  page.drawText(label, { x: (WIDTH - fonts.bold.widthOfTextAtSize(label, 9)) / 2, y: top - 4, size: 9, font: fonts.bold, color: colors.muted });
  const middle = WIDTH / 2;
  drawHandLine(page, middle, top - 14, middle, 12 * MM, colors.line, 1, "postcard-divider");

  // Message side: prompts that help a child fill it in.
  const left = { x: 11 * MM, end: middle - 10 };
  const prompts = ["Dear", "Today I saw", "", "My favourite part was", "", "Love,"];
  let y = top - 26;
  // The lines share the height down to the signature line.
  const pitch = (y - 17 * MM) / (prompts.length - 1);
  for (const prompt of prompts) {
    const promptWidth = prompt ? fonts.display.widthOfTextAtSize(prompt, 10.5) + 6 : 0;
    if (prompt) page.drawText(prompt, { x: left.x, y, size: 10.5, font: fonts.display, color: theme.accent });
    drawRuledLine(page, left.x + promptWidth, left.end, y);
    y -= pitch;
  }
  drawText(page, `${explorer === "me" ? "An" : explorer + ", an"} official ${pdfText(booklet.destination)} Explorer`, fonts, {
    x: left.x, top: y + pitch - 10, width: left.end - left.x,
  }, { size: 7.5, font: fonts.bold, color: colors.muted, maxLines: 1 });

  // Address side: a perforated stamp box with postmark waves, then the
  // address lines.
  const stamp = { width: 21 * MM, height: 25 * MM };
  const stampBox = { x: WIDTH - 11 * MM - stamp.width, y: top - 10 - stamp.height, ...stamp };
  page.drawRectangle({ ...stampBox, borderColor: colors.muted, borderWidth: 0.8, borderDashArray: [2, 2] });
  const stampText = ["Place", "stamp", "here"];
  stampText.forEach((line, index) => {
    page.drawText(line, {
      x: stampBox.x + (stamp.width - fonts.bold.widthOfTextAtSize(line, 7.5)) / 2,
      y: stampBox.y + stamp.height / 2 + 8 - index * 9,
      size: 7.5,
      font: fonts.bold,
      color: colors.muted,
    });
  });
  drawPostmarkWaves(page, middle + 14, stampBox.y + stamp.height - 10, (stampBox.x - middle - 14) * 0.62, colors.line);
  const right = { x: middle + 14, end: WIDTH - 11 * MM };
  const addressPitch = 9 * MM;
  page.drawText("To", { x: right.x, y: 13 * MM + addressPitch * 3 + 14, size: 10.5, font: fonts.display, color: theme.accent });
  for (let row = 0; row < 4; row += 1) drawRuledLine(page, right.x, right.end, 13 * MM + row * addressPitch);
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
  for (const page of document.getPages()) {
    page.setMediaBox(-BLEED, -BLEED, WIDTH + BLEED * 2, HEIGHT + BLEED * 2);
    page.setBleedBox(-BLEED, -BLEED, WIDTH + BLEED * 2, HEIGHT + BLEED * 2);
    page.setTrimBox(0, 0, WIDTH, HEIGHT);
  }
  return document.save();
}
