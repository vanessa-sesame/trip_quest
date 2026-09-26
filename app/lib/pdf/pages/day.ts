import type { PDFPage, RGB } from "pdf-lib";
import type { DayPlan } from "../../booklet/booklet.ts";
import { queueGameActivity } from "../../booklet/pages.ts";
import { addPage, drawPageHeader, type PdfContext } from "../context.ts";
import {
  drawDoodleSparkle,
  drawRoundedRect,
  drawSpeechBubble,
  drawTicketEdge,
} from "../illustrations.ts";
import {
  drawBulletList,
  drawCard,
  drawPill,
  drawText,
  Flow,
  measureText,
  type BulletItem,
} from "../layout.ts";
import { CONTENT_BOTTOM, CONTENT_WIDTH, MARGIN, colors } from "../theme.ts";

// Label and colour for the queue page's secret-target ticket, keyed by
// QueueTargetKind. Presentational only; unknown kinds use the default.
export const queueTargetKindCopy: Record<string, { prefix: string; accent: RGB; soft: RGB }> = {
  shape: { prefix: "Your secret shape", accent: colors.teal, soft: colors.tealSoft },
  colour: { prefix: "Your secret colour", accent: colors.coral, soft: colors.coralSoft },
  object: { prefix: "Your secret object", accent: colors.green, soft: colors.greenSoft },
  sound: { prefix: "Your secret sound", accent: colors.coral, soft: colors.coralSoft },
  person: { prefix: "Who to spot", accent: colors.green, soft: colors.greenSoft },
};
const defaultQueueTargetKindCopy = { prefix: "Your secret target", accent: colors.teal, soft: colors.tealSoft };

// A soft card holding a label pill and wrapped text; returns its bottom.
function drawNoteCard(
  ctx: PdfContext,
  page: PDFPage,
  top: number,
  options: { label: string; text: string; accent: RGB; fill: RGB; size: number; maxLines: number },
) {
  const { fonts, type } = ctx;
  const inner = CONTENT_WIDTH - 24;
  const pillHeight = type.label * 2;
  const textHeight = measureText(options.text, fonts, inner, { size: options.size, maxLines: options.maxLines }).height;
  const height = 10 + pillHeight + 6 + textHeight + 10;
  drawCard(page, { x: MARGIN, y: top - height, width: CONTENT_WIDTH, height }, { fill: options.fill });
  const pill = drawPill(page, fonts, options.label, { x: MARGIN + 12, top: top - 10, color: options.accent, fill: colors.white, size: type.label });
  drawText(page, options.text, fonts, { x: MARGIN + 12, top: pill.y - 6, width: inner }, { size: options.size, color: colors.ink, maxLines: options.maxLines });
  return top - height;
}

function factItems(day: DayPlan): BulletItem[] {
  return day.slots.factCard.length === 3 ? day.slots.factCard : [];
}

// The day's opening page: the mission, a note for grown-ups, the secret
// target to look for, and a counting game for the queue.
export function drawQueuePage(ctx: PdfContext, day: DayPlan) {
  const { fonts, type, theme } = ctx;
  const reveal = day.slots.questReveal;
  const page = addPage(ctx, `Day ${day.day}`, colors.yellow);
  let y = drawPageHeader(ctx, page, {
    kicker: `Day ${day.day} / Before you go`,
    title: day.theme,
    accent: colors.yellow,
    soft: colors.yellowSoft,
    subtitle: day.landmark.display,
    // With no reveal page, the day's badge goes on its opening page.
    stickerSpot: reveal ? undefined : { page: "dayBadge", day: day.day },
  });

  if (day.mission) {
    y = drawNoteCard(ctx, page, y, { label: "Today's mission", text: day.mission, accent: theme.accent, fill: theme.accentSoft, size: type.body, maxLines: 3 }) - 10;
  }

  const flow = new Flow(page, fonts, { x: MARGIN, top: y, width: CONTENT_WIDTH, bottom: CONTENT_BOTTOM });
  const notes: BulletItem[] = [{ title: "Grown-up tip", text: day.slots.beforeYouGo }];
  const lens = day.interestHook || day.siblingMission;
  if (lens) notes.push({ title: "Family lens", text: lens });
  flow.bullets(notes, { size: type.small, marker: "dot", markerColor: colors.teal, maxLines: 3, gap: 6 });
  flow.space(12);

  if (reveal?.targetLabel) {
    const kind = queueTargetKindCopy[reveal.targetKind || ""] || defaultQueueTargetKindCopy;
    const height = 52;
    const box = flow.take(height);
    drawRoundedRect(page, box, 12, { color: colors.white, borderColor: kind.accent, borderWidth: 1.4 });
    drawTicketEdge(page, { ...box, y: box.y + height }, kind.accent, 3);
    drawPill(page, fonts, kind.prefix, { x: box.x + 12, top: box.y + height - 8, color: kind.accent, fill: kind.soft, size: type.label });
    drawText(page, reveal.targetLabel.toUpperCase(), fonts, { x: box.x + 12, top: box.y + height - 8 - type.label * 2 - 2, width: box.width - 44 }, {
      size: type.heading, font: fonts.display, color: colors.ink, maxLines: 1,
    });
    drawDoodleSparkle(page, box.x + box.width - 20, box.y + height - 20, 7, colors.yellow);
    flow.space(8);
    if (reveal.bonusQuest) {
      flow.bullets([{ title: "Bonus quest", text: reveal.bonusQuest }], { size: type.small, marker: "dot", markerColor: kind.accent, maxLines: 2 });
    }
    flow.space(12);
  }

  // Facts live on the reveal page; with no reveal page they close this one.
  const facts = reveal ? [] : factItems(day);
  const factsHeight = facts.length
    ? type.label * 2 + 8 - drawBulletList(null, fonts, facts, { x: 0, top: 0, width: CONTENT_WIDTH, size: type.small, maxLines: 2 }).bottom + 10
    : 0;
  drawCounting(ctx, page, day, { x: MARGIN, y: CONTENT_BOTTOM + factsHeight, width: CONTENT_WIDTH, height: flow.y - CONTENT_BOTTOM - factsHeight }, Boolean(queueGameActivity(day)));
  if (facts.length) drawFacts(ctx, page, facts, CONTENT_BOTTOM + factsHeight - 10, theme.accent);
}

function drawFacts(ctx: PdfContext, page: PDFPage, facts: BulletItem[], top: number, accent: RGB) {
  const { fonts, type } = ctx;
  const pill = drawPill(page, fonts, "Did you know?", { x: MARGIN, top, color: accent, fill: colors.white, size: type.label });
  return drawBulletList(page, fonts, facts, { x: MARGIN, top: pill.y - 8, width: CONTENT_WIDTH, size: type.small, markerColor: accent, maxLines: 2 }).bottom;
}

// Count-while-you-wait: big circles to colour in for younger explorers, a
// tally card for older ones.
function drawCounting(ctx: PdfContext, page: PDFPage, day: DayPlan, box: { x: number; y: number; width: number; height: number }, hasQueueGame: boolean) {
  const { fonts, type } = ctx;
  const queue = day.slots.whileYouWait;
  if (box.height < 70) return;
  const top = box.y + box.height;
  const pill = drawPill(page, fonts, "Count while you wait", { x: box.x, top, color: colors.teal, fill: colors.tealSoft, size: type.label });
  let y = pill.y - 6;
  // With a queue game, its own page carries the instruction; here the
  // counting prompt is just the count label.
  const prompt = hasQueueGame ? queue.countLabel : queue.instruction;
  y = drawText(page, prompt, fonts, { x: box.x, top: y, width: box.width }, { size: type.body, color: colors.ink, maxLines: 2 }).bottom - 10;
  const area = { x: box.x, y: box.y, width: box.width, height: y - box.y };
  if (area.height < 40) return;

  if (ctx.booklet.age >= 11) {
    drawRoundedRect(page, area, 14, { color: colors.white, borderColor: colors.softLine, borderWidth: 1.2 });
    drawText(page, `Tally: ${queue.countLabel}`, fonts, { x: area.x + 12, top: area.y + area.height - 10, width: area.width - 24 }, {
      size: type.small, font: fonts.bold, color: colors.muted, maxLines: 1,
    });
    return;
  }
  const count = Math.max(1, Math.min(ctx.booklet.age <= 5 ? 10 : 20, queue.countTo));
  const columns = 5;
  const rowCount = Math.ceil(count / columns);
  const gap = 12;
  const diameter = Math.min(46, (area.width - gap * (columns - 1)) / columns, (area.height - gap * (rowCount - 1)) / rowCount);
  if (diameter < 16) return;
  const gridWidth = columns * diameter + (columns - 1) * gap;
  const startX = area.x + (area.width - gridWidth) / 2 + diameter / 2;
  const startY = area.y + area.height - diameter / 2;
  const inks = [colors.coral, colors.teal, colors.yellow, colors.green];
  for (let index = 0; index < count; index += 1) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    page.drawCircle({
      x: startX + column * (diameter + gap),
      y: startY - row * (diameter + gap),
      size: diameter / 2,
      color: colors.white,
      borderColor: inks[row % inks.length],
      borderWidth: 1.6,
    });
  }
}

// The payoff once the family arrives: the reveal, two things to talk
// about, the day's facts and a completion stamp.
export function drawRevealPage(ctx: PdfContext, day: DayPlan, dayIndex: number) {
  const reveal = day.slots.questReveal;
  if (!reveal) return;
  const { fonts, type, theme } = ctx;
  const page = addPage(ctx, `Day ${day.day}`, theme.accent);
  const top = drawPageHeader(ctx, page, {
    kicker: `Day ${day.day} / At the destination`,
    title: "Found it!",
    accent: theme.accent,
    soft: theme.accentSoft,
    subtitle: reveal.targetLabel ? `The secret: ${reveal.targetLabel}` : day.landmark.display,
    stickerSpot: { page: "dayBadge", day: day.day },
  });
  const flow = new Flow(page, fonts, { x: MARGIN, top, width: CONTENT_WIDTH, bottom: CONTENT_BOTTOM });

  // Everything below the photo, measured first so the photo takes only
  // the space that is left.
  const prompts: BulletItem[] = reveal.chatPrompts.filter(Boolean);
  const inner = CONTENT_WIDTH - 28;
  const listHeight = -drawBulletList(null, fonts, prompts, { x: 0, top: 0, width: inner, size: type.small, maxLines: 3 }).bottom;
  const bubbleHeight = 10 + type.label * 2 + 8 + listHeight + 12;
  const facts = factItems(day);
  const factsHeight = facts.length
    ? type.label * 2 + 8 - drawBulletList(null, fonts, facts, { x: 0, top: 0, width: CONTENT_WIDTH, size: type.small, maxLines: 2 }).bottom
    : 0;
  const textHeight = measureText(reveal.revealText, fonts, CONTENT_WIDTH, { size: type.body, maxLines: 4 }).height + 14;
  const creditHeight = reveal.photoCredit ? 3 + 8 * 1.3 * 2 : 0;
  const belowPhoto = 10 + creditHeight + textHeight + bubbleHeight + 20 + factsHeight;

  const photo = ctx.revealArtwork[dayIndex];
  if (photo) {
    // A white print-style border hugging the photo, centred.
    const row = flow.take(Math.max(100, Math.min(170, flow.remaining() - belowPhoto)));
    const dims = photo.scale(1);
    const scale = Math.min((row.width - 16) / dims.width, (row.height - 16) / dims.height);
    const width = dims.width * scale;
    const height = dims.height * scale;
    const frame = { x: row.x + (row.width - width - 16) / 2, y: row.y + (row.height - height - 16) / 2, width: width + 16, height: height + 16 };
    drawRoundedRect(page, frame, 10, { color: colors.white, borderColor: colors.line, borderWidth: 1.2 });
    page.drawImage(photo, { x: frame.x + 8, y: frame.y + 8, width, height });
    if (reveal.photoCredit) {
      flow.space(3);
      flow.text(reveal.photoCredit, { size: 8, color: colors.muted, maxLines: 2, align: "center" });
    }
    flow.space(10);
  }

  flow.text(reveal.revealText, { size: type.body, color: colors.ink, maxLines: 4 });
  flow.space(14);

  // Chat prompts in a speech bubble.
  const bubble = flow.take(bubbleHeight);
  drawSpeechBubble(page, bubble, colors.tealSoft, colors.teal, 36);
  const pill = drawPill(page, fonts, "Chat about it", { x: bubble.x + 14, top: bubble.y + bubbleHeight - 10, color: colors.teal, fill: colors.white, size: type.label });
  drawBulletList(page, fonts, prompts, { x: bubble.x + 14, top: pill.y - 8, width: inner, size: type.small, markerColor: colors.teal, maxLines: 3 });
  flow.space(20);

  if (facts.length) {
    flow.y = drawFacts(ctx, page, facts, flow.y, theme.accent);
    flow.space(14);
  }

  // The day's badge sticker is in the header; then a drawing space if the
  // page still has room.
  if (flow.remaining() >= 90) {
    const box = flow.rest();
    drawRoundedRect(page, box, 14, { color: colors.white, borderColor: colors.line, borderWidth: 1.2 });
    drawPill(page, fonts, "Draw your discovery", { x: box.x + 12, top: box.y + box.height - 10, color: theme.accent, fill: theme.accentSoft, size: type.label });
  }
}
