import type { PDFPage, RGB } from "pdf-lib";
import type { Activity, DayPlan } from "../../booklet/booklet.ts";
import type { StickerSpot } from "../../booklet/stickers.ts";
import { addPage, drawPageHeader, type PdfContext } from "../context.ts";
import { displayTitle, showsActivityBody } from "../../booklet/game-copy.ts";
import { drawGame, gameHasOwnWritingSpace, gameInstruction } from "../games/index.ts";
import { drawCard, drawPill, Flow } from "../layout.ts";
import { drawWriteArea, measureWriteArea, parseWritePrompt } from "../writing.ts";
import { CONTENT_BOTTOM, CONTENT_WIDTH, MARGIN, colors } from "../theme.ts";

export type ActivityPageOptions = {
  stickerSpot?: StickerSpot;
  kicker: string;
  accent: RGB;
  soft: RGB;
  context: string;
};

// One game per page: kicker, title and place, a short intro, one line on
// how to play, the board, and (for games without their own writing space)
// a field-note card at the foot of the page.
export function drawActivityPage(ctx: PdfContext, day: DayPlan, activity: Activity, options: ActivityPageOptions) {
  const { fonts, type } = ctx;
  const page = addPage(ctx, `Day ${day.day}`, options.accent);
  const top = drawPageHeader(ctx, page, {
    kicker: options.kicker,
    title: displayTitle(activity.title),
    accent: options.accent,
    soft: options.soft,
    subtitle: day.landmark.place,
    stickerSpot: options.stickerSpot,
  });

  const flow = new Flow(page, fonts, { x: MARGIN, top, width: CONTENT_WIDTH, bottom: CONTENT_BOTTOM });
  if (showsActivityBody(activity)) {
    flow.text(activity.body, { size: type.body, color: colors.ink, maxLines: 3 });
  }
  flow.space(6);
  flow.bullets([gameInstruction(activity)], { size: type.small, marker: "dot", color: colors.muted, markerColor: options.accent, maxLines: 2 });
  flow.space(12);

  // Games without their own writing space end in a field-note card. The
  // game is laid out first at its natural height (leaving the card at
  // least its minimum), then the card grows into whatever is left, so
  // spare space becomes writing room instead of an empty gap.
  const note = !gameHasOwnWritingSpace(activity) && activity.prompt ? activity.prompt : "";
  const noteGap = 14;
  const reserved = note ? fieldNoteMinHeight(ctx, note) + noteGap : 0;
  const gameBottom = drawGame({
    ctx,
    page,
    activity,
    box: { x: MARGIN, y: CONTENT_BOTTOM + reserved, width: CONTENT_WIDTH, height: flow.y - CONTENT_BOTTOM - reserved },
    context: options.context,
    fill: !note,
  });
  if (note) drawFieldNote(ctx, page, note, options.accent, Math.min(gameBottom, flow.y) - noteGap);
  return page;
}

const FIELD_NOTE_PAD = 12;

// At least two ruled rows at the age's writing pitch; a prompt that only
// asks the child to circle a choice needs just one (more if the page has
// room).
function fieldNoteOptions(ctx: PdfContext, prompt: string) {
  const parsed = parseWritePrompt(prompt);
  return { pitch: ctx.type.writeLine, size: ctx.type.small, minLines: parsed.choices.length ? 1 : 2 };
}

export function fieldNoteMinHeight(ctx: PdfContext, prompt: string) {
  const area = measureWriteArea(ctx.fonts, prompt, CONTENT_WIDTH - FIELD_NOTE_PAD * 2, fieldNoteOptions(ctx, prompt));
  return 10 + ctx.type.label * 2 + 6 + area + 6;
}

// The field-note card, from `top` down to the bottom of the content area:
// the prompt with each of its blanks as a full writing row, then as many
// further ruled rows as fit.
function drawFieldNote(ctx: PdfContext, page: PDFPage, prompt: string, accent: RGB, top: number) {
  const { fonts, type } = ctx;
  const height = Math.max(fieldNoteMinHeight(ctx, prompt), top - CONTENT_BOTTOM);
  const box = { x: MARGIN, y: CONTENT_BOTTOM, width: CONTENT_WIDTH, height };
  drawCard(page, box, { fill: colors.white, border: colors.softLine });
  const pill = drawPill(page, fonts, "My field note", { x: MARGIN + FIELD_NOTE_PAD, top: box.y + height - 10, color: accent, fill: colors.paper, size: type.label });
  const areaTop = pill.y - 6;
  return drawWriteArea(page, fonts, prompt, {
    x: MARGIN + FIELD_NOTE_PAD, y: box.y + 6, width: CONTENT_WIDTH - FIELD_NOTE_PAD * 2, height: areaTop - box.y - 6,
  }, fieldNoteOptions(ctx, prompt));
}
