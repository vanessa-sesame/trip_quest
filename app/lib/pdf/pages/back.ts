import type { Activity } from "../../booklet/booklet.ts";
import { addPage, drawPageHeader, type PdfContext } from "../context.ts";
import { displayTitle } from "../../booklet/game-copy.ts";
import { answerFor } from "../games/index.ts";
import {
  drawDestinationMotif,
  drawDoodleSparkle,
  drawDoodleStar,
  drawHandLine,
  drawMosaicFragment,
  drawRoundedRect,
  drawStampCircle,
} from "../illustrations.ts";
import { drawPill, drawText, drawWriteLines, fitTextSize, Flow, pdfText } from "../layout.ts";
import { CONTENT_BOTTOM, CONTENT_WIDTH, MARGIN, PAGE_HEIGHT, PAGE_WIDTH, colors } from "../theme.ts";

export type AnswerEntry = { day: number; index: number; activity: Activity };

// Closed-answer entries per answer-notes page. Each entry is at most one
// title line plus two answer lines, so this always fits an A5 page.
export const ANSWERS_PER_PAGE = 8;

export function drawAnswerKeyPage(ctx: PdfContext, entries: AnswerEntry[], part: number, parts: number) {
  const { fonts, type, booklet } = ctx;
  const page = addPage(ctx, "Answer notes", colors.yellow);
  const top = drawPageHeader(ctx, page, {
    kicker: parts > 1 ? `Grown-up answer notes / ${part} of ${parts}` : "Grown-up answer notes",
    title: part === 1 ? "A quick peek for helpful humans" : "More answers",
    accent: colors.coral,
    soft: colors.coralSoft,
    titleLines: 1,
  });
  const flow = new Flow(page, fonts, { x: MARGIN, top, width: CONTENT_WIDTH, bottom: CONTENT_BOTTOM });
  if (part === 1) {
    flow.text("Keep this page tucked away until your explorer has had a proper go. Observation and imagination pages have no single right answer.", {
      size: type.small, color: colors.muted, maxLines: 3,
    });
    flow.space(12);
  }
  if (!entries.length) {
    flow.text("Every game in this booklet is open-ended, so there is nothing to check. Ask what they noticed and celebrate one specific detail.", {
      size: type.body, color: colors.ink, maxLines: 4,
    });
    return;
  }
  flow.bullets(
    entries.map((entry) => ({
      marker: `${entry.day}.${entry.index + 1}`,
      title: displayTitle(entry.activity.title),
      text: answerFor(entry.activity, booklet.age),
    })),
    { size: type.small, marker: "number", markerColor: colors.yellow, maxLines: 2, gap: 9 },
  );
}

export function drawNotesPage(ctx: PdfContext) {
  const { type, theme } = ctx;
  const page = addPage(ctx, "My notes", colors.teal);
  const top = drawPageHeader(ctx, page, { kicker: "My notes", title: "Notes and doodles", accent: colors.teal, soft: colors.tealSoft, titleLines: 1 });
  const box = { x: MARGIN, y: CONTENT_BOTTOM, width: CONTENT_WIDTH, height: top - CONTENT_BOTTOM };
  drawRoundedRect(page, box, 14, { color: colors.white, borderColor: colors.softLine, borderWidth: 1.2 });
  drawWriteLines(page, { x: box.x + 16, y: box.y + 10, width: box.width - 32, height: box.height - 16 }, type.body * 2.2);
  drawDoodleStar(page, box.x + box.width - 24, box.y + 22, 7, theme.accent);
  drawDoodleSparkle(page, box.x + box.width - 46, box.y + 16, 5, colors.yellow);
}

export function drawMemoryPage(ctx: PdfContext) {
  const { fonts, type, theme, booklet } = ctx;
  const page = addPage(ctx, "Memory museum", theme.accent);
  const top = drawPageHeader(ctx, page, {
    kicker: "Memory museum",
    title: `${booklet.destination} moments worth keeping`,
    accent: theme.accent,
    soft: theme.accentSoft,
  });
  const flow = new Flow(page, fonts, { x: MARGIN, top, width: CONTENT_WIDTH, bottom: CONTENT_BOTTOM });
  flow.text("Draw the details that made your family stop, laugh, taste, listen or look twice.", { size: type.small, color: colors.muted, maxLines: 2 });
  flow.space(12);

  const prompts = ["Smallest detail", "Biggest surprise", "Kindest moment", "A sound or flavor"];
  const inks = [theme.accent, colors.teal, colors.green, colors.yellow];
  const fills = [theme.accentSoft, colors.tealSoft, colors.greenSoft, colors.yellowSoft];
  const gap = 12;
  const width = (CONTENT_WIDTH - gap) / 2;
  const height = (flow.remaining() - gap) / 2;
  prompts.forEach((prompt, index) => {
    const x = MARGIN + (index % 2) * (width + gap);
    const y = flow.y - (Math.floor(index / 2) + 1) * height - Math.floor(index / 2) * gap;
    // A pastel frame with a white drawing window inside it.
    drawRoundedRect(page, { x, y, width, height }, 16, { color: fills[index] });
    drawRoundedRect(page, { x: x + 8, y: y + 8, width: width - 16, height: height - 16 - type.label * 2 - 6 }, 10, { color: colors.white });
    drawPill(page, fonts, prompt, { x: x + 10, top: y + height - 8, color: inks[index], fill: colors.white, size: type.label, maxWidth: width - 20 });
  });
}

export function drawCertificate(ctx: PdfContext) {
  const { fonts, type, theme, booklet } = ctx;
  const page = addPage(ctx, "Certificate", theme.accent);
  const frame = { x: MARGIN - 8, y: CONTENT_BOTTOM - 6, width: CONTENT_WIDTH + 16, height: PAGE_HEIGHT - 40 - CONTENT_BOTTOM + 12 };
  drawRoundedRect(page, frame, 22, { color: colors.white, borderColor: theme.accent, borderWidth: 2 });
  drawRoundedRect(page, { x: frame.x + 8, y: frame.y + 8, width: frame.width - 16, height: frame.height - 16 }, 16, { borderColor: theme.accentSoft, borderWidth: 1.2 });
  const cornerSize = 18;
  [
    { x: frame.x + 16, y: frame.y + frame.height - 16 - cornerSize },
    { x: frame.x + frame.width - 16 - cornerSize, y: frame.y + frame.height - 16 - cornerSize },
    { x: frame.x + 16, y: frame.y + 16 },
    { x: frame.x + frame.width - 16 - cornerSize, y: frame.y + 16 },
  ].forEach((corner, index) => drawMosaicFragment(page, { ...corner, width: cornerSize, height: cornerSize }, `cert-corner-${index}`));

  const column = { x: frame.x + 30, width: frame.width - 60 };
  let top = frame.y + frame.height - 34;
  top = drawText(page, "Official TripQuest certificate", fonts, { ...column, top }, { size: type.label, font: fonts.bold, color: theme.accent, align: "center" }).bottom - 16;

  const sealCy = top - 40;
  const sealCx = PAGE_WIDTH / 2;
  drawStampCircle(page, fonts, sealCx, sealCy, 38, theme.accent, theme.accentSoft, "");
  page.drawCircle({ x: sealCx, y: sealCy, size: 24, color: theme.accent });
  page.drawText("TQ", { x: sealCx - fonts.display.widthOfTextAtSize("TQ", 20) / 2, y: sealCy - 7, size: 20, font: fonts.display, color: colors.white });
  [0, 45, 90, 135, 180, 225, 270, 315].forEach((angle, index) => {
    const radians = (angle * Math.PI) / 180;
    page.drawCircle({ x: sealCx + Math.cos(radians) * 47, y: sealCy + Math.sin(radians) * 47, size: 2, color: [theme.accent, colors.teal, colors.yellow, colors.green][index % 4] });
  });
  top = sealCy - 62;

  top = drawText(page, "This certifies that", fonts, { ...column, top }, { size: type.small, font: fonts.bold, color: colors.muted, align: "center" }).bottom - 30;
  drawHandLine(page, column.x + 30, top, column.x + column.width - 30, top, colors.line, 1.2, "cert-name-line");
  top = drawText(page, "Explorer name", fonts, { ...column, top: top - 4 }, { size: type.label, color: colors.muted, align: "center" }).bottom - 14;
  top = drawText(page, "is now a", fonts, { ...column, top }, { size: type.small, font: fonts.bold, color: colors.muted, align: "center" }).bottom - 6;

  const title = `${pdfText(booklet.destination)} Explorer`;
  const titleSize = fitTextSize(title, fonts.display, column.width, 30, 18, 2);
  const titleBlock = drawText(page, title, fonts, { ...column, top }, { size: titleSize, font: fonts.display, color: theme.accent, align: "center", maxLines: 2, lineHeight: titleSize * 1.1 });
  const lastWidth = fonts.display.widthOfTextAtSize(titleBlock.lines[titleBlock.lines.length - 1] ?? "", titleSize);
  const lastBaseline = titleBlock.baselines[titleBlock.baselines.length - 1] ?? top;
  drawDoodleStar(page, PAGE_WIDTH / 2 + lastWidth / 2 + 14, lastBaseline + titleSize * 0.35, 6, colors.yellow);
  top = titleBlock.bottom - 8;
  top = drawText(page, "Awarded for curious noticing, kind traveling, brave questions and excellent pencil work.", fonts, { x: column.x + 20, top, width: column.width - 40 }, {
    size: type.small, color: colors.muted, align: "center", maxLines: 3,
  }).bottom - 10;

  const signY = frame.y + 70;
  if (top - signY > 70) {
    drawDestinationMotif(page, { x: PAGE_WIDTH / 2 - 55, y: signY + 18, width: 110, height: Math.min(54, top - signY - 30) }, theme, `cert-motif-${booklet.destination}`);
  }
  const lineWidth = (column.width - 30) / 2;
  [
    { label: "Grown-up signature", x: column.x },
    { label: "Date", x: column.x + lineWidth + 30 },
  ].forEach((field, index) => {
    drawHandLine(page, field.x, signY, field.x + lineWidth, signY, colors.line, 1, `cert-line-${index}`);
    drawText(page, field.label, fonts, { x: field.x, top: signY - 4, width: lineWidth }, { size: type.label, font: fonts.bold, color: colors.muted, align: "center" });
  });
  const edition = `Age ${booklet.age} edition  /  ${booklet.days} ${booklet.days === 1 ? "day" : "days"}`;
  drawText(page, edition, fonts, { ...column, top: frame.y + 34 }, { size: type.label, font: fonts.bold, color: theme.accent, align: "center" });
}
