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

  // Picture: AI/curated hero art when available, otherwise the postcard.
  // The picture takes whatever the name fields and tagline leave over.
  const reservedBelow = 24 + 44 + type.label * 2 + 6 + 96;
  const hero = flow.take(Math.max(150, Math.min(300, flow.remaining() - reservedBelow)));
  if (ctx.coverArtwork) {
    // The art fills the frame, cropped to it: models return pictures of
    // any shape, often with a paper-coloured background that would show
    // as a block inside the frame.
    drawRoundedRect(page, hero, 18, { color: colors.white, borderColor: colors.line, borderWidth: 1.2 });
    const inner = { x: hero.x + 6, y: hero.y + 6, width: hero.width - 12, height: hero.height - 12 };
    const dims = ctx.coverArtwork.scale(1);
    const scale = Math.max(inner.width / dims.width, inner.height / dims.height);
    page.pushOperators(pushGraphicsState(), rectangle(inner.x, inner.y, inner.width, inner.height), clip(), endPath());
    page.drawImage(ctx.coverArtwork, {
      x: inner.x + (inner.width - dims.width * scale) / 2,
      y: inner.y + (inner.height - dims.height * scale) / 2,
      width: dims.width * scale,
      height: dims.height * scale,
    });
    page.pushOperators(popGraphicsState());
  } else {
    drawPostcardScene(page, hero, theme, `cover-${booklet.destination}`);
  }
  // Travel stamps overlapping the picture's bottom edge.
  drawStampCircle(page, fonts, hero.x + hero.width - 88, hero.y + 4, 26, theme.accent, theme.accentSoft, `Age ${booklet.age}`);
  drawStampCircle(page, fonts, hero.x + hero.width - 30, hero.y + 16, 26, colors.teal, colors.tealSoft, booklet.days === 1 ? "1 day" : `${booklet.days} days`);
  flow.space(24);

  const names = familyPack?.children.length
    ? familyPack.children.map((child, index) => pdfText(familyChildDisplayName(child, index))).join(" / ")
    : "";
  const fieldHeight = 44;
  const fieldWidth = (CONTENT_WIDTH - 12) / 2;
  const fields = flow.take(fieldHeight + type.label * 2 + 6);
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
      drawHandLine(page, box.x + 12, box.y + 14, box.x + box.width - 12, box.y + 14, colors.line, 1, `cover-field-${index}`);
    }
  });

  const tagline = "Pack a pencil. Notice everything.";
  const taglineTop = CONTENT_BOTTOM + 44;
  drawHandLine(page, MARGIN, taglineTop + 8, PAGE_WIDTH - MARGIN, taglineTop + 8, theme.accent, 1.4, "cover-tagline-rule");
  const block = drawText(page, tagline, fonts, { x: MARGIN, top: taglineTop, width: CONTENT_WIDTH }, { size: type.heading, font: fonts.display, color: theme.accent, maxLines: 1 });
  drawDoodleSparkle(page, MARGIN + fonts.display.widthOfTextAtSize(tagline, type.heading) + 14, block.baselines[0] + 5, 6, colors.yellow);
  drawText(page, "Games, drawing spaces, local clues and family missions made for this exact trip.", fonts, { x: MARGIN, top: block.bottom - 2, width: CONTENT_WIDTH }, {
    size: type.small, color: colors.muted, maxLines: 2,
  });
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
