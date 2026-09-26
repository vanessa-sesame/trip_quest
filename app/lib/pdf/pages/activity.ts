import type { PDFPage, RGB } from "pdf-lib";
import type { Activity, DayPlan } from "../../booklet/booklet.ts";
import { addPage, drawPageHeader, type PdfContext } from "../context.ts";
import { drawGame, gameHasOwnWritingSpace, gameInstruction } from "../games/index.ts";
import { drawCard, drawDottedLine, drawPill, drawText, Flow, measureText } from "../layout.ts";
import { CONTENT_BOTTOM, CONTENT_WIDTH, MARGIN, colors } from "../theme.ts";

export type ActivityPageOptions = {
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
    title: activity.title,
    accent: options.accent,
    soft: options.soft,
    subtitle: day.landmark.place,
  });

  const flow = new Flow(page, fonts, { x: MARGIN, top, width: CONTENT_WIDTH, bottom: CONTENT_BOTTOM });
  // Spot-the-difference skips its intro: with pictures the how-to line says
  // it all (and the pictures need the room); without them it plays as
  // look-and-find, which the "compare the two pictures" intro would not match.
  if (activity.body && activity.gameType !== "spot_the_difference") {
    flow.text(activity.body, { size: type.body, color: colors.ink, maxLines: 3 });
  }
  flow.space(6);
  flow.bullets([gameInstruction(activity)], { size: type.small, marker: "dot", color: colors.muted, markerColor: options.accent, maxLines: 2 });
  flow.space(12);

  let bottom = CONTENT_BOTTOM;
  if (!gameHasOwnWritingSpace(activity) && activity.prompt) {
    bottom = drawFieldNote(ctx, page, activity.prompt, options.accent) + 14;
  }
  drawGame({
    ctx,
    page,
    activity,
    box: { x: MARGIN, y: bottom, width: CONTENT_WIDTH, height: flow.y - bottom },
    context: options.context,
  });
  return page;
}

// Returns the card's top edge.
function drawFieldNote(ctx: PdfContext, page: PDFPage, prompt: string, accent: RGB) {
  const { fonts, type } = ctx;
  const inner = CONTENT_WIDTH - 24;
  const promptHeight = measureText(prompt, fonts, inner, { size: type.small, maxLines: 2 }).height;
  const pillHeight = type.label * 2;
  const height = 10 + pillHeight + 6 + promptHeight + 26;
  const box = { x: MARGIN, y: CONTENT_BOTTOM, width: CONTENT_WIDTH, height };
  drawCard(page, box, { fill: colors.white, border: colors.softLine });
  const pill = drawPill(page, fonts, "My field note", { x: MARGIN + 12, top: box.y + height - 10, color: accent, fill: colors.paper, size: type.label });
  drawText(page, prompt, fonts, { x: MARGIN + 12, top: pill.y - 6, width: inner }, { size: type.small, color: colors.ink, maxLines: 2 });
  drawDottedLine(page, MARGIN + 12, MARGIN + CONTENT_WIDTH - 12, box.y + 12, colors.line, 3, 3);
  return box.y + height;
}
