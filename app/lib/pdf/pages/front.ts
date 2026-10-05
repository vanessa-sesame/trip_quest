import { clip, endPath, popGraphicsState, pushGraphicsState, rectangle, type PDFPage } from "pdf-lib";
import { getAgeBand } from "../../booklet/booklet.ts";
import { familyChildDisplayName } from "../../family.ts";
import { STICKER_DIAMETER, addPage, drawPageHeader, drawStickerSpot, type PdfContext } from "../context.ts";
import {
  drawDestinationMotif,
  drawDoodleCloud,
  drawDoodleSparkle,
  drawDoodleStar,
  drawHandLine,
  drawRoundedRect,
  drawStampCircle,
} from "../illustrations.ts";
import {
  drawBulletList,
  drawCard,
  drawPill,
  drawText,
  fitTextSize,
  Flow,
  measureText,
  pdfText,
  type Box,
} from "../layout.ts";
import { CONTENT_BOTTOM, CONTENT_TOP, CONTENT_WIDTH, MARGIN, PAGE_WIDTH, colors, type DestinationTheme } from "../theme.ts";

// The cover's picture when there is no AI or curated art: a sunny postcard
// scene with the destination's own motif, never an empty or technical mark.
function drawPostcardScene(page: PDFPage, box: Box, theme: DestinationTheme, seed: string) {
  drawRoundedRect(page, box, 18, { color: theme.accentSoft });
  page.drawCircle({ x: box.x + box.width - 44, y: box.y + box.height - 40, size: 20, color: colors.yellowSoft, borderColor: colors.yellow, borderWidth: 2 });
  drawDoodleCloud(page, { x: box.x + 24, y: box.y + box.height - 62, width: 70, height: 34 }, colors.white);
  drawDoodleCloud(page, { x: box.x + box.width * 0.45, y: box.y + box.height - 50, width: 52, height: 24 }, colors.white);
  // Rolling hills along the bottom, following the card's rounded corners.
  const w = box.width;
  const h = box.height;
  const r = 18;
  page.drawSvgPath(
    `M 0,${h - 50} Q ${w * 0.28},${h - 92} ${w * 0.55},${h - 56} Q ${w * 0.8},${h - 26} ${w},${h - 64} L ${w},${h - r} Q ${w},${h} ${w - r},${h} L ${r},${h} Q 0,${h} 0,${h - r} Z`,
    { x: box.x, y: box.y + h, color: colors.greenSoft, borderColor: colors.green, borderWidth: 1.4 },
  );
  drawDestinationMotif(page, { x: box.x + w * 0.3, y: box.y + 34, width: w * 0.4, height: h * 0.58 }, theme, seed);
  drawDoodleStar(page, box.x + 26, box.y + box.height * 0.45, 6, colors.yellow);
  drawDoodleSparkle(page, box.x + box.width - 30, box.y + box.height * 0.42, 6, colors.white);
}

// The cover art is never cropped: a white print-style frame hugs the whole
// picture at its own aspect ratio, as large as `area` allows, centred.
const ART_PAD = 6;
function coverArtFrame(ctx: PdfContext, area: Box): Box {
  // The part of the canvas holding the picture (all of it unless the art
  // has a wide blank margin of plain paper; see art-bounds.ts).
  const bounds = ctx.coverArtBounds ?? { x: 0, y: 0, width: 1, height: 1 };
  const dims = ctx.coverArtwork!.scale(1);
  const scale = Math.min((area.width - ART_PAD * 2) / (dims.width * bounds.width), (area.height - ART_PAD * 2) / (dims.height * bounds.height));
  const width = dims.width * bounds.width * scale;
  const height = dims.height * bounds.height * scale;
  return {
    x: area.x + (area.width - width - ART_PAD * 2) / 2,
    y: area.y + (area.height - height - ART_PAD * 2) / 2,
    width: width + ART_PAD * 2,
    height: height + ART_PAD * 2,
  };
}

function drawCoverArt(ctx: PdfContext, page: PDFPage, hero: Box) {
  const bounds = ctx.coverArtBounds ?? { x: 0, y: 0, width: 1, height: 1 };
  drawRoundedRect(page, hero, 14, { color: colors.white, borderColor: colors.line, borderWidth: 1.2 });
  // Scale the whole canvas so its picture box fills the frame; the clip
  // only ever trims blank paper outside that box.
  const inner = { x: hero.x + ART_PAD, y: hero.y + ART_PAD, width: hero.width - ART_PAD * 2, height: hero.height - ART_PAD * 2 };
  const canvasWidth = inner.width / bounds.width;
  const canvasHeight = inner.height / bounds.height;
  page.pushOperators(pushGraphicsState(), rectangle(inner.x, inner.y, inner.width, inner.height), clip(), endPath());
  page.drawImage(ctx.coverArtwork!, {
    x: inner.x - bounds.x * canvasWidth,
    y: inner.y + inner.height - (1 - bounds.y) * canvasHeight,
    width: canvasWidth,
    height: canvasHeight,
  });
  page.pushOperators(popGraphicsState());
}

export function drawCover(ctx: PdfContext) {
  const { fonts, type, theme, booklet, familyPack } = ctx;
  const page = addPage(ctx, "Cover", theme.accent);
  const flow = new Flow(page, fonts, { x: MARGIN, top: CONTENT_TOP, width: CONTENT_WIDTH, bottom: CONTENT_BOTTOM });
  // The child's name sticker sits top right, as the game stickers do on
  // the inside pages; the title lines stop short of it.
  drawStickerSpot(ctx, page, { page: "cover" }, PAGE_WIDTH - MARGIN - STICKER_DIAMETER / 2 - 2, CONTENT_TOP - STICKER_DIAMETER / 2 - 1, "My name");
  const titleWidth = CONTENT_WIDTH - STICKER_DIAMETER - 14;
  const pill = drawPill(page, fonts, "TripQuest Explorer Book", { x: MARGIN, top: CONTENT_TOP, color: theme.accent, fill: theme.accentSoft, size: type.label });
  const title = (value: string, style: Parameters<typeof drawText>[4]) => {
    flow.y = drawText(page, value, fonts, { x: MARGIN, top: flow.y, width: titleWidth }, style).bottom;
  };
  flow.y = pill.y - 10;
  title("A trip made for curious hands", { size: type.heading, font: fonts.display, color: theme.accent, maxLines: 1 });
  const destination = pdfText(booklet.destination);
  const destinationSize = fitTextSize(destination, fonts.display, titleWidth, 40, 24, 2);
  title(destination, { size: destinationSize, font: fonts.display, color: colors.ink, maxLines: 2, lineHeight: destinationSize * 1.08 });
  flow.space(2);
  title(booklet.profile.style, { size: type.body, font: fonts.bold, color: colors.muted, maxLines: 2 });
  flow.y = Math.min(flow.y - 12, CONTENT_TOP - STICKER_DIAMETER - 12);

  // The foot of the cover is laid out bottom-up: the tagline, then the
  // name and date fields (tall enough to write in at this age). The
  // picture takes everything between the title and the fields.
  const blurb = "Games, drawing spaces, local clues and family missions made for this exact trip.";
  const blurbHeight = measureText(blurb, fonts, CONTENT_WIDTH, { size: type.small, maxLines: 2 }).height;
  const taglineTop = CONTENT_BOTTOM + blurbHeight + 2 + type.heading * 1.35;
  const fieldHeight = Math.max(44, type.writeLine + 16);
  const fieldsHeight = fieldHeight + type.label * 2 + 6;
  const fields = { x: MARGIN, y: taglineTop + 8 + 18, width: CONTENT_WIDTH, height: fieldsHeight };
  const stampRadius = 26;
  const areaAbove = (gap: number) => {
    const y = fields.y + fields.height + gap;
    return { x: MARGIN, y, width: CONTENT_WIDTH, height: Math.max(120, flow.y - y) };
  };

  // Picture: AI/curated hero art when available, otherwise the postcard.
  const sideRoom = (frame: Box, area: Box) => area.x + area.width - (frame.x + frame.width) >= stampRadius * 2 - 6;
  // Stamps sit beside a narrow picture, or hang ~22pt below a wide one.
  let area = areaAbove(14);
  let hero: Box = area;
  if (ctx.coverArtwork) {
    hero = coverArtFrame(ctx, area);
    if (!sideRoom(hero, area)) {
      area = areaAbove(30);
      hero = coverArtFrame(ctx, area);
    }
    drawCoverArt(ctx, page, hero);
  } else {
    area = areaAbove(30);
    hero = area;
    drawPostcardScene(page, hero, theme, `cover-${booklet.destination}`);
  }
  // Travel stamps: in the margin beside a narrow picture, overlapping its
  // edge, or over the bottom-right corner of a wide one.
  const gutter = area.x + area.width - (hero.x + hero.width);
  const ageLabel = `Age ${booklet.age}`;
  const daysLabel = booklet.days === 1 ? "1 day" : `${booklet.days} days`;
  if (gutter >= stampRadius * 2 - 6) {
    const cx = hero.x + hero.width + Math.min(gutter - stampRadius - 2, stampRadius - 8);
    drawStampCircle(page, fonts, cx, hero.y + stampRadius + 52, stampRadius, theme.accent, theme.accentSoft, ageLabel);
    drawStampCircle(page, fonts, cx, hero.y + stampRadius - 6, stampRadius, colors.teal, colors.tealSoft, daysLabel);
  } else {
    drawStampCircle(page, fonts, hero.x + hero.width - 88, hero.y + 4, stampRadius, theme.accent, theme.accentSoft, ageLabel);
    drawStampCircle(page, fonts, hero.x + hero.width - 30, hero.y + 16, stampRadius, colors.teal, colors.tealSoft, daysLabel);
  }

  const names = familyPack?.children.length
    ? familyPack.children.map((child, index) => pdfText(familyChildDisplayName(child, index))).join(" / ")
    : "";
  const fieldWidth = (CONTENT_WIDTH - 12) / 2;
  [
    { label: names ? "Made for" : "Explorer name", x: fields.x },
    { label: "Trip dates", x: fields.x + fieldWidth + 12 },
  ].forEach((field, index) => {
    const pillBox = drawPill(page, fonts, field.label, { x: field.x, top: fields.y + fields.height, color: colors.muted, fill: colors.white, size: type.label });
    const box = { x: field.x, y: fields.y, width: fieldWidth, height: fieldHeight };
    drawRoundedRect(page, box, 12, { color: colors.white, borderColor: colors.softLine, borderWidth: 1 });
    if (index === 0 && names) {
      drawText(page, names, fonts, { x: box.x + 10, top: pillBox.y - 10, width: box.width - 20 }, { size: type.body, font: fonts.display, color: colors.ink, maxLines: 2 });
    } else {
      drawHandLine(page, box.x + 12, box.y + 12, box.x + box.width - 12, box.y + 12, colors.line, 1, `cover-field-${index}`);
    }
  });

  const tagline = "Pack a pencil. Notice everything.";
  drawHandLine(page, MARGIN, taglineTop + 8, PAGE_WIDTH - MARGIN, taglineTop + 8, theme.accent, 1.4, "cover-tagline-rule");
  const block = drawText(page, tagline, fonts, { x: MARGIN, top: taglineTop, width: CONTENT_WIDTH }, { size: type.heading, font: fonts.display, color: theme.accent, maxLines: 1 });
  drawDoodleSparkle(page, MARGIN + fonts.display.widthOfTextAtSize(tagline, type.heading) + 14, block.baselines[0] + 5, 6, colors.yellow);
  drawText(page, blurb, fonts, { x: MARGIN, top: block.bottom - 2, width: CONTENT_WIDTH }, {
    size: type.small, color: colors.muted, maxLines: 2,
  });
}

// The parent guide's cover: the booklet's own picture, so the two read as a
// set, but in the grown-ups' green, with who it is for and a clear note
// that the answers are inside.
export function drawParentGuideCover(ctx: PdfContext) {
  const { fonts, type, theme, booklet, familyPack } = ctx;
  const page = addPage(ctx, "Parent guide", colors.green);
  const flow = new Flow(page, fonts, { x: MARGIN, top: CONTENT_TOP, width: CONTENT_WIDTH, bottom: CONTENT_BOTTOM });
  const pill = drawPill(page, fonts, "TripQuest Parent Guide", { x: MARGIN, top: CONTENT_TOP, color: colors.green, fill: colors.greenSoft, size: type.label });
  flow.y = pill.y - 10;
  flow.y = drawText(page, "For the grown-ups", fonts, { x: MARGIN, top: flow.y, width: CONTENT_WIDTH }, { size: type.heading, font: fonts.display, color: colors.green, maxLines: 1 }).bottom;
  const destination = pdfText(booklet.destination);
  const destinationSize = fitTextSize(destination, fonts.display, CONTENT_WIDTH, 40, 24, 2);
  flow.y = drawText(page, destination, fonts, { x: MARGIN, top: flow.y, width: CONTENT_WIDTH }, {
    size: destinationSize, font: fonts.display, color: colors.ink, maxLines: 2, lineHeight: destinationSize * 1.08,
  }).bottom;
  flow.space(2);
  flow.y = drawText(page, `Every answer and a few tips for the ${destination} Explorer booklet.`, fonts, { x: MARGIN, top: flow.y, width: CONTENT_WIDTH }, {
    size: type.body, font: fonts.bold, color: colors.muted, maxLines: 2,
  }).bottom;
  flow.space(14);

  // The foot, bottom-up: the "answers inside" note, then who it is for.
  const noteHeight = 46;
  const note = { x: MARGIN, y: CONTENT_BOTTOM, width: CONTENT_WIDTH, height: noteHeight };
  const names = familyPack?.children.length
    ? familyPack.children.map((child, index) => pdfText(familyChildDisplayName(child, index))).join(" / ")
    : "";
  const facts = [
    { label: "Made for", value: names || "Your explorer" },
    { label: "Age", value: String(booklet.age) },
    { label: "Trip", value: booklet.days === 1 ? "1 day" : `${booklet.days} days` },
  ];
  const factsHeight = type.label * 2 + 8 + type.body * 1.6 + 14;
  const factsBox = { x: MARGIN, y: note.y + noteHeight + 12, width: CONTENT_WIDTH, height: factsHeight };
  drawRoundedRect(page, factsBox, 12, { color: colors.white, borderColor: colors.softLine, borderWidth: 1 });
  const columns = [CONTENT_WIDTH * 0.5, CONTENT_WIDTH * 0.2, CONTENT_WIDTH * 0.3];
  let x = factsBox.x;
  facts.forEach((fact, index) => {
    const label = drawPill(page, fonts, fact.label, { x: x + 10, top: factsBox.y + factsHeight - 8, color: colors.muted, fill: colors.white, size: type.label });
    drawText(page, fact.value, fonts, { x: x + 12, top: label.y - 6, width: columns[index] - 20 }, { size: type.body, font: fonts.display, color: colors.ink, maxLines: 1 });
    x += columns[index];
  });

  drawRoundedRect(page, note, 12, { color: colors.yellowSoft, borderColor: colors.yellow, borderWidth: 1 });
  drawDoodleStar(page, note.x + 22, note.y + noteHeight / 2, 8, colors.yellow);
  drawText(page, "The answers are inside: keep this guide with the grown-ups, away from little explorers.", fonts, {
    x: note.x + 40, top: note.y + noteHeight - 10, width: note.width - 52,
  }, { size: type.small, font: fonts.bold, color: colors.ink, maxLines: 2 });

  // The picture takes everything between the title and the facts.
  const areaBottom = factsBox.y + factsHeight + 14;
  const area = { x: MARGIN, y: areaBottom, width: CONTENT_WIDTH, height: Math.max(120, flow.y - areaBottom) };
  if (ctx.coverArtwork) {
    drawCoverArt(ctx, page, coverArtFrame(ctx, area));
  } else {
    drawPostcardScene(page, area, theme, `guide-cover-${booklet.destination}`);
  }
}

export function drawGuide(ctx: PdfContext) {
  const { fonts, type, theme, booklet, familyPack } = ctx;
  const page = addPage(ctx, "For grown-ups", colors.green);
  const top = drawPageHeader(ctx, page, {
    kicker: "A quick note for grown-ups",
    title: `A thoughtful pace for age ${booklet.age}`,
    accent: colors.green,
    soft: colors.greenSoft,
    titleLines: 1,
  });
  const flow = new Flow(page, fonts, { x: MARGIN, top, width: CONTENT_WIDTH, bottom: CONTENT_BOTTOM });
  flow.text(booklet.profile.intro, { size: type.body, color: colors.muted, maxLines: 4 });
  flow.space(12);

  // Local word and care clue as two soft cards.
  const cardGap = 12;
  const cardWidth = (CONTENT_WIDTH - cardGap) / 2;
  const cards = [
    { title: "Local word", body: booklet.profile.word, accent: theme.accent, fill: theme.accentSoft },
    { title: "Local care clue", body: booklet.profile.etiquette, accent: colors.green, fill: colors.greenSoft },
  ];
  const pillHeight = type.label * 2;
  const cardHeight = 10 + pillHeight + 6 + Math.max(...cards.map((card) =>
    measureText(card.body, fonts, cardWidth - 24, { size: type.small, maxLines: 5 }).height,
  )) + 10;
  const cardRow = flow.take(cardHeight);
  cards.forEach((card, index) => {
    const box = { x: MARGIN + index * (cardWidth + cardGap), y: cardRow.y, width: cardWidth, height: cardHeight };
    drawCard(page, box, { fill: card.fill });
    const pill = drawPill(page, fonts, card.title, { x: box.x + 12, top: box.y + cardHeight - 10, color: card.accent, fill: colors.white, size: type.label });
    drawText(page, card.body, fonts, { x: box.x + 12, top: pill.y - 6, width: cardWidth - 24 }, { size: type.small, color: colors.ink, maxLines: 5 });
  });
  flow.space(14);

  // The trip at a glance: numbered days in two columns.
  const glancePill = drawPill(page, fonts, "Your adventure at a glance", { x: MARGIN, top: flow.y, color: colors.muted, fill: colors.white, size: type.label });
  flow.y = glancePill.y - 8;
  const rowsPerColumn = Math.ceil(booklet.dayPlans.length / 2);
  const rowHeight = Math.min(26, 150 / Math.max(1, rowsPerColumn));
  const glance = flow.take(rowsPerColumn * rowHeight);
  booklet.dayPlans.forEach((day, index) => {
    const column = Math.floor(index / rowsPerColumn);
    const row = index % rowsPerColumn;
    const x = MARGIN + column * (cardWidth + cardGap);
    const rowTop = glance.y + glance.height - row * rowHeight;
    const markerColor = index % 2 ? colors.teal : theme.accent;
    drawBulletList(page, fonts, [{ title: day.theme, marker: String(day.day) }], {
      x, top: rowTop, width: cardWidth, size: Math.min(type.small, 9.5), marker: "number", markerColor, lineHeight: 9.5 * 1.3,
    });
  });
  flow.space(14);

  const how = "How it works: a quick game while you wait in line, games to play once you arrive, then a calm page to unwind after. No reading needed until your child is ready.";
  const pack = familyPack?.children.length
    ? `Explorers: ${familyPack.children.map((child, index) => `${pdfText(familyChildDisplayName(child, index))} (age ${child.age})`).join(", ")}. Same place, different ways to play.`
    : `Bring pencils or colored pencils, this booklet, and about ${getAgeBand(booklet.age).minutes} unhurried minutes at each stop.`;
  const items = [{ title: familyPack?.children.length ? "Family explorers" : "What to bring", text: pack }, { title: "How it works", text: how.replace(/^How it works: /, "") }];
  const listOptions = { size: type.small, marker: "dot" as const, markerColor: colors.green, maxLines: 3, gap: 6 };
  const listHeight = -drawBulletList(null, fonts, items, { ...listOptions, x: 0, top: 0, width: CONTENT_WIDTH - 24 }).bottom;
  const boxHeight = Math.min(flow.remaining(), listHeight + 20);
  const box = { x: MARGIN, y: flow.y - boxHeight, width: CONTENT_WIDTH, height: boxHeight };
  drawCard(page, box, { fill: colors.white, border: colors.softLine });
  drawBulletList(page, fonts, items, { ...listOptions, x: MARGIN + 12, top: box.y + boxHeight - 10, width: CONTENT_WIDTH - 24 });
}
