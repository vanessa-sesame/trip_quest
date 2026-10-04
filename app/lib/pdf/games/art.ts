import {
  concatTransformationMatrix,
  popGraphicsState,
  pushGraphicsState,
  type PDFImage,
  type PDFPage,
} from "pdf-lib";
import {
  coloringPageSpec,
  coloringSceneFor,
  coloringVariantFor,
  type ColoringScene,
} from "../../booklet/coloring.ts";
import { drawColoringScene } from "../art/coloring-scenes.ts";
import { coloringArtworkKey } from "../context.ts";
import { drawRoundedRect } from "../illustrations.ts";
import { drawBulletList, drawDottedLine, drawPill, drawText, fitTextSize, pdfText, type Box } from "../layout.ts";
import { colors } from "../theme.ts";
import type { GameArgs } from "./types.ts";

function drawImageContained(page: PDFPage, image: PDFImage, box: Box) {
  const dimensions = image.scale(1);
  const scale = Math.min(box.width / dimensions.width, box.height / dimensions.height);
  const width = dimensions.width * scale;
  const height = dimensions.height * scale;
  page.drawImage(image, { x: box.x + (box.width - width) / 2, y: box.y + (box.height - height) / 2, width, height });
}

// The vector scenes are designed in a 320x200 box; scale one into `box`.
function drawSceneContained(page: PDFPage, box: Box, scene: ColoringScene, variation: ReturnType<typeof coloringVariantFor>) {
  const artWidth = 320;
  const artHeight = 200;
  const scale = Math.min(box.width / artWidth, box.height / artHeight);
  const x = box.x + (box.width - artWidth * scale) / 2;
  const y = box.y + (box.height - artHeight * scale) / 2;
  page.pushOperators(pushGraphicsState(), concatTransformationMatrix(scale, 0, 0, scale, x, y));
  drawColoringScene(page, { x: 0, y: 0, width: artWidth, height: artHeight }, scene, variation);
  page.pushOperators(popGraphicsState());
}

// A big faint word to trace over, on a dotted guide line.
function drawTraceRow(args: GameArgs, word: string, box: Box) {
  const { fonts, type } = args.ctx;
  const pill = drawPill(args.page, fonts, "Trace", { x: box.x, top: box.y + box.height - 4, color: colors.coral, fill: colors.coralSoft, size: type.label });
  const traceX = pill.x + pill.width + 12;
  const traceWord = pdfText(word).toUpperCase();
  const traceSize = fitTextSize(traceWord, fonts.bold, box.x + box.width - traceX, 24, 12);
  const baseline = box.y + 8;
  args.page.drawText(traceWord, { x: traceX, y: baseline, size: traceSize, font: fonts.bold, color: colors.line, opacity: 0.8 });
  drawDottedLine(args.page, traceX, box.x + box.width, baseline - 3, colors.line, 2, 3);
}

// Picture A above picture B, each in a rounded frame, with three circles
// beside picture B to tick off as the changes are found. Returns the
// bottom it drew to, or undefined when either picture is unavailable, so
// the caller can fall back to look-and-find.
export function drawDifferencePictures(args: GameArgs): number | undefined {
  const { ctx, page, activity, box } = args;
  const pictures = activity.differencePaths;
  const a = pictures && ctx.artwork[pictures.a];
  const b = pictures && ctx.artwork[pictures.b];
  if (!a || !b) return undefined;
  const { fonts, type } = ctx;
  const labelGap = type.label * 2 + 2;
  const trackerWidth = 34;
  const side = Math.min(box.width - trackerWidth * 2, (box.height - labelGap * 2 - 8) / 2);
  const x = box.x + (box.width - side) / 2;
  let top = box.y + box.height;
  [
    { image: a, label: "Picture A", color: colors.teal, soft: colors.tealSoft },
    { image: b, label: "Picture B", color: colors.coral, soft: colors.coralSoft },
  ].forEach(({ image, label, color, soft }, index) => {
    drawPill(page, fonts, label, { x, top, color, fill: soft, size: type.label });
    const frame = { x, y: top - labelGap - side, width: side, height: side };
    drawRoundedRect(page, frame, 12, { color: colors.white, borderColor: color, borderWidth: 1.4 });
    drawImageContained(page, image, { x: frame.x + 5, y: frame.y + 5, width: frame.width - 10, height: frame.height - 10 });
    if (index === 1) {
      // A circle down the right of picture B for each change to find.
      const count = pictures.regions.length;
      const step = Math.min(30, (frame.height - 28) / Math.max(1, count - 1));
      pictures.regions.forEach((_, circle) => {
        page.drawCircle({
          x: frame.x + frame.width + trackerWidth / 2 + 4,
          y: frame.y + frame.height - 18 - circle * step,
          size: 10,
          color: colors.white,
          borderColor: [colors.coral, colors.teal, colors.green][circle % 3],
          borderWidth: 1.6,
        });
      });
    }
    top = frame.y - 8;
  });
  return top + 8;
}

export function drawDrawingBoard(args: GameArgs) {
  const { ctx, page, activity, box, context } = args;
  const { fonts, type } = ctx;
  const traceHeight = 36;
  const canvas = { x: box.x, y: box.y + traceHeight + 10, width: box.width, height: box.height - traceHeight - 10 };
  drawRoundedRect(page, canvas, 14, { color: colors.white, borderColor: colors.line, borderWidth: 1.2 });

  // A small reference picture tucked into the canvas corner: something to
  // glance at, while almost the whole board stays open to draw on.
  const refWidth = Math.min(130, canvas.width * 0.36);
  const refHeight = refWidth * 0.66;
  const refBox = { x: canvas.x + canvas.width - refWidth - 10, y: canvas.y + canvas.height - refHeight - 10, width: refWidth, height: refHeight };
  drawRoundedRect(page, refBox, 9, { color: colors.paper, borderColor: colors.softLine, borderWidth: 1 });
  const inset = { x: refBox.x + 5, y: refBox.y + 5, width: refBox.width - 10, height: refBox.height - 10 };
  const image = ctx.artwork[coloringArtworkKey(activity, context)];
  if (image) drawImageContained(page, image, inset);
  else drawSceneContained(page, inset, coloringSceneFor(activity, context), coloringVariantFor(activity, context));
  drawPill(page, fonts, "Look closely", { x: refBox.x + 6, top: refBox.y + 8, color: colors.teal, fill: colors.tealSoft, size: type.label });

  const clue = activity.items?.[0]?.clue || activity.prompt;
  if (clue) {
    drawText(page, clue, fonts, { x: canvas.x + 12, top: canvas.y + canvas.height - 10, width: canvas.width - refWidth - 34 }, {
      size: type.small, color: colors.muted, maxLines: 4,
    });
  }
  drawTraceRow(args, activity.items?.[0]?.label || "Local detail", { x: box.x, y: box.y, width: box.width, height: traceHeight });
  return box.y;
}

export function drawColoringBoard(args: GameArgs) {
  const { ctx, page, activity, box, context } = args;
  const { fonts, type } = ctx;
  const spec = coloringPageSpec(activity, context);
  const traceHeight = 36;
  const spotCells = spec.cells.filter((cell) => cell.kind !== "free").slice(0, 6);
  const spotColumns = 2;
  const columnWidth = (box.width - 12) / spotColumns;
  const spotItems = spotCells.map((cell) => pdfText(cell.label));
  const spotHeight = Math.max(
    ...[0, 1].map((column) => -drawBulletList(null, fonts, spotItems.filter((_, index) => index % spotColumns === column), {
      x: 0, top: 0, width: columnWidth, size: type.small, marker: "check", maxLines: 1, gap: 5,
    }).bottom),
  );
  const pillHeight = type.label * 2;
  const imageHeight = box.height - traceHeight - spotHeight - pillHeight - 34;
  const imageBox = { x: box.x, y: box.y + box.height - imageHeight, width: box.width, height: imageHeight };
  drawRoundedRect(page, imageBox, 14, { color: colors.white, borderColor: colors.line, borderWidth: 1.2 });
  const inset = { x: imageBox.x + 8, y: imageBox.y + 8, width: imageBox.width - 16, height: imageBox.height - 16 };
  const image = ctx.artwork[coloringArtworkKey(activity, context)];
  if (image) drawImageContained(page, image, inset);
  else drawSceneContained(page, inset, spec.scene, coloringVariantFor(activity, context));

  const spotTop = imageBox.y - 12;
  drawPill(page, fonts, "Can you spot...", { x: box.x, top: spotTop, color: colors.teal, fill: colors.tealSoft, size: type.label });
  [0, 1].forEach((column) => {
    drawBulletList(page, fonts, spotItems.filter((_, index) => index % spotColumns === column), {
      x: box.x + column * (columnWidth + 12),
      top: spotTop - pillHeight - 8,
      width: columnWidth,
      size: type.small,
      marker: "check",
      markerColor: column ? colors.green : colors.coral,
      maxLines: 1,
      gap: 5,
    });
  });
  drawTraceRow(args, spec.traceWord, { x: box.x, y: box.y, width: box.width, height: traceHeight });
  return box.y;
}
