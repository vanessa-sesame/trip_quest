import type { PDFPage } from "pdf-lib";
import type { ColoringScene, coloringVariantFor } from "../../booklet/coloring.ts";
import type { Box } from "../layout.ts";
import { colors } from "../theme.ts";

// Hand-built vector line art for each coloring scene, drawn into a 320x200
// design box (callers scale it with a transformation matrix). It is the
// zero-cost fallback whenever no curated or AI illustration is available.

function drawColoringVariant(page: PDFPage, scene: Box, variant: ColoringScene, variation: ReturnType<typeof coloringVariantFor>) {
  if (variation === 0) return;
  const { x, y, width, height } = scene;
  const ground = y + 24;
  const outline = colors.ink;
  const detail = colors.muted;
  const accent = colors.coral;
  if (variant === "supertree") {
    if (variation === 1) {
      page.drawEllipse({ x: x + width / 2, y: ground + 18, xScale: 42, yScale: 10, borderColor: accent, borderWidth: 1.4 });
      [x + 62, x + width - 62].forEach((treeX) => page.drawLine({ start: { x: treeX - 15, y: ground }, end: { x: treeX, y: ground + 28 }, color: outline, thickness: 1.3 }));
    } else {
      [0, 1, 2, 3].forEach((index) => {
        const waveX = x + 42 + index * 74;
        page.drawLine({ start: { x: waveX, y: ground + 9 }, end: { x: waveX + 18, y: ground + 13 }, color: detail, thickness: 1 });
        page.drawLine({ start: { x: waveX + 18, y: ground + 13 }, end: { x: waveX + 36, y: ground + 9 }, color: detail, thickness: 1 });
      });
    }
    return;
  }
  if (variant === "garden") {
    if (variation === 1) {
      page.drawRectangle({ x: x + width / 2 - 42, y: ground, width: 84, height: 62, borderColor: outline, borderWidth: 1.5 });
      page.drawLine({ start: { x: x + width / 2 - 51, y: ground + 62 }, end: { x: x + width / 2, y: ground + 82 }, color: accent, thickness: 1.4 });
      page.drawLine({ start: { x: x + width / 2 + 51, y: ground + 62 }, end: { x: x + width / 2, y: ground + 82 }, color: accent, thickness: 1.4 });
      [x + width / 2 - 22, x + width / 2, x + width / 2 + 22].forEach((stemX) => page.drawLine({ start: { x: stemX, y: ground }, end: { x: stemX, y: ground + 62 }, color: detail, thickness: 1 }));
    } else {
      page.drawEllipse({ x: x + width / 2, y: ground + 16, xScale: 77, yScale: 16, borderColor: detail, borderWidth: 1.2 });
      [0, 1, 2].forEach((index) => page.drawCircle({ x: x + width / 2 - 34 + index * 34, y: ground + 16 + (index % 2) * 7, size: 4, borderColor: accent, borderWidth: 1 }));
    }
    return;
  }
  if (variant === "skyline") {
    const center = x + width - 78;
    if (variation === 1) {
      page.drawCircle({ x: center, y: ground + 62, size: 27, borderColor: outline, borderWidth: 1.5 });
      page.drawLine({ start: { x: center, y: ground + 35 }, end: { x: center, y: ground + 89 }, color: detail, thickness: 1 });
      page.drawLine({ start: { x: center - 27, y: ground + 62 }, end: { x: center + 27, y: ground + 62 }, color: detail, thickness: 1 });
      page.drawLine({ start: { x: center - 19, y: ground + 43 }, end: { x: center + 19, y: ground + 81 }, color: detail, thickness: 1 });
    } else {
      page.drawRectangle({ x: center - 25, y: ground, width: 50, height: 88, borderColor: outline, borderWidth: 1.5 });
      page.drawCircle({ x: center, y: ground + 47, size: 15, borderColor: accent, borderWidth: 1.3 });
      page.drawLine({ start: { x: center, y: ground + 47 }, end: { x: center, y: ground + 58 }, color: detail, thickness: 1 });
      page.drawLine({ start: { x: center, y: ground + 47 }, end: { x: center + 9, y: ground + 43 }, color: detail, thickness: 1 });
    }
    return;
  }
  if (variant === "market") {
    if (variation === 1) {
      [0, 1, 2, 3].forEach((index) => {
        const basketX = x + 94 + index * 54;
        page.drawCircle({ x: basketX, y: ground + 29, size: 8, borderColor: index % 2 ? accent : colors.green, borderWidth: 1.1 });
        page.drawCircle({ x: basketX + 14, y: ground + 29, size: 7, borderColor: colors.yellow, borderWidth: 1.1 });
      });
    } else {
      [0, 1, 2].forEach((index) => {
        const stallX = x + 72 + index * 90;
        page.drawLine({ start: { x: stallX, y: ground + 94 }, end: { x: stallX + 30, y: ground + 112 }, color: accent, thickness: 1.4 });
        page.drawLine({ start: { x: stallX + 30, y: ground + 112 }, end: { x: stallX + 60, y: ground + 94 }, color: accent, thickness: 1.4 });
      });
    }
    return;
  }
  if (variant === "dinosaur") {
    if (variation === 1) {
      page.drawLine({ start: { x: x + width - 106, y: ground }, end: { x: x + width - 90, y: ground + 31 }, color: outline, thickness: 1.4 });
      page.drawLine({ start: { x: x + width - 72, y: ground }, end: { x: x + width - 57, y: ground + 30 }, color: outline, thickness: 1.4 });
      page.drawLine({ start: { x: x + width - 90, y: ground + 31 }, end: { x: x + width - 72, y: ground }, color: detail, thickness: 1.1 });
    } else {
      [0, 1, 2, 3].forEach((index) => page.drawCircle({ x: x + 42 + index * 24, y: ground + 10 + (index % 2) * 4, size: 3.5, borderColor: detail, borderWidth: 1 }));
      [0, 1, 2, 3].forEach((index) => page.drawCircle({ x: x + width - 120 + index * 22, y: ground + 10 + (index % 2) * 4, size: 3.5, borderColor: detail, borderWidth: 1 }));
    }
    return;
  }
  if (variant === "shophouse") {
    if (variation === 1) {
      [x + 70, x + width / 2, x + width - 70].forEach((balconyX) => {
        page.drawLine({ start: { x: balconyX - 22, y: ground + 69 }, end: { x: balconyX + 22, y: ground + 69 }, color: accent, thickness: 1.5 });
        [-14, 0, 14].forEach((offset) => page.drawLine({ start: { x: balconyX + offset, y: ground + 69 }, end: { x: balconyX + offset, y: ground + 51 }, color: detail, thickness: 1 }));
      });
    } else {
      page.drawLine({ start: { x: x + 32, y: ground + 8 }, end: { x: x + width - 32, y: ground + 8 }, color: outline, thickness: 1.5 });
      [x + 82, x + width / 2, x + width - 82].forEach((signX) => page.drawRectangle({ x: signX - 13, y: ground + 12, width: 26, height: 16, borderColor: accent, borderWidth: 1 }));
    }
    return;
  }
  if (variant === "coast") {
    if (variation === 1) {
      page.drawLine({ start: { x: x + width / 2 - 30, y: ground + 45 }, end: { x: x + width / 2, y: ground + 65 }, color: outline, thickness: 1.5 });
      page.drawLine({ start: { x: x + width / 2, y: ground + 65 }, end: { x: x + width / 2 + 30, y: ground + 45 }, color: outline, thickness: 1.5 });
      page.drawLine({ start: { x: x + width / 2, y: ground + 65 }, end: { x: x + width / 2, y: ground + 15 }, color: accent, thickness: 1.2 });
    } else {
      [x + 150, x + 185, x + 220].forEach((shellX, index) => page.drawCircle({ x: shellX, y: ground + 12, size: 5 + index, borderColor: accent, borderWidth: 1 }));
    }
    return;
  }
  if (variation === 1) {
    page.drawLine({ start: { x: x + 34, y: ground + 28 }, end: { x: x + 82, y: ground + 44 }, color: detail, thickness: 1.1 });
    page.drawLine({ start: { x: x + 82, y: ground + 44 }, end: { x: x + 130, y: ground + 28 }, color: detail, thickness: 1.1 });
  } else {
    page.drawCircle({ x: x + width / 2, y: y + height - 30, size: 7, borderColor: accent, borderWidth: 1.2 });
    page.drawLine({ start: { x: x + width / 2, y: y + height - 23 }, end: { x: x + width / 2, y: y + height - 11 }, color: detail, thickness: 1 });
  }
}

export function drawColoringScene(page: PDFPage, scene: Box, variant: ColoringScene, variation: ReturnType<typeof coloringVariantFor>) {
  const { x, y, width, height } = scene;
  const ground = y + 24;
  const drawCloud = (cloudX: number, cloudY: number) => {
    page.drawCircle({ x: cloudX, y: cloudY, size: 13, borderColor: colors.line, borderWidth: 1.2 });
    page.drawCircle({ x: cloudX + 18, y: cloudY + 5, size: 17, borderColor: colors.line, borderWidth: 1.2 });
    page.drawCircle({ x: cloudX + 38, y: cloudY, size: 12, borderColor: colors.line, borderWidth: 1.2 });
    page.drawLine({ start: { x: cloudX - 8, y: cloudY - 9 }, end: { x: cloudX + 46, y: cloudY - 9 }, color: colors.line, thickness: 1.2 });
  };
  const drawTree = (treeX: number, treeY: number, scale = 1) => {
    page.drawLine({ start: { x: treeX, y: treeY }, end: { x: treeX, y: treeY + 50 * scale }, color: colors.ink, thickness: 2 });
    page.drawCircle({ x: treeX - 16 * scale, y: treeY + 56 * scale, size: 21 * scale, borderColor: colors.green, borderWidth: 1.5 });
    page.drawCircle({ x: treeX + 13 * scale, y: treeY + 64 * scale, size: 24 * scale, borderColor: colors.green, borderWidth: 1.5 });
    page.drawCircle({ x: treeX + 32 * scale, y: treeY + 52 * scale, size: 18 * scale, borderColor: colors.green, borderWidth: 1.5 });
  };
  const drawWindows = (buildingX: number, buildingY: number, columns: number, rows: number, gap = 22) => {
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        page.drawRectangle({ x: buildingX + column * gap, y: buildingY + row * gap, width: 11, height: 13, borderColor: colors.blue, borderWidth: 1 });
      }
    }
  };
  const drawBird = (birdX: number, birdY: number, scale = 1) => {
    page.drawLine({ start: { x: birdX, y: birdY }, end: { x: birdX + 8 * scale, y: birdY + 5 * scale }, color: colors.ink, thickness: 1.2 });
    page.drawLine({ start: { x: birdX + 8 * scale, y: birdY + 5 * scale }, end: { x: birdX + 16 * scale, y: birdY }, color: colors.ink, thickness: 1.2 });
  };
  const drawWaves = (waveY: number, count = 4) => {
    for (let index = 0; index < count; index += 1) {
      const waveX = x + 26 + index * ((width - 52) / count);
      page.drawLine({ start: { x: waveX, y: waveY }, end: { x: waveX + 24, y: waveY + 4 }, color: colors.blue, thickness: 1 });
      page.drawLine({ start: { x: waveX + 24, y: waveY + 4 }, end: { x: waveX + 48, y: waveY }, color: colors.blue, thickness: 1 });
    }
  };
  const drawLantern = (lanternX: number, lanternY: number) => {
    page.drawLine({ start: { x: lanternX, y: lanternY + 18 }, end: { x: lanternX, y: lanternY + 28 }, color: colors.ink, thickness: 1 });
    page.drawRectangle({ x: lanternX - 8, y: lanternY, width: 16, height: 18, borderColor: colors.coral, borderWidth: 1.2 });
    page.drawLine({ start: { x: lanternX - 5, y: lanternY + 5 }, end: { x: lanternX + 5, y: lanternY + 5 }, color: colors.coral, thickness: 1 });
  };
  const drawPolyline = (
    points: Array<[number, number]>,
    color = colors.ink,
    thickness = 1.4,
    closed = false,
  ) => {
    const linePoints = closed && points.length > 1 ? [...points, points[0]] : points;
    for (let index = 1; index < linePoints.length; index += 1) {
      page.drawLine({
        start: { x: x + linePoints[index - 1][0], y: ground + linePoints[index - 1][1] },
        end: { x: x + linePoints[index][0], y: ground + linePoints[index][1] },
        color,
        thickness,
      });
    }
  };
  const drawSupertree = (treeX: number, baseY: number, scale = 1) => {
    const crownY = baseY + 92 * scale;
    page.drawLine({ start: { x: treeX - 7 * scale, y: baseY }, end: { x: treeX - 2 * scale, y: crownY - 23 * scale }, color: colors.ink, thickness: 1.8 });
    page.drawLine({ start: { x: treeX + 7 * scale, y: baseY }, end: { x: treeX + 2 * scale, y: crownY - 23 * scale }, color: colors.ink, thickness: 1.8 });
    page.drawEllipse({ x: treeX, y: crownY, xScale: 38 * scale, yScale: 25 * scale, borderColor: colors.ink, borderWidth: 1.6 });
    page.drawEllipse({ x: treeX, y: crownY, xScale: 26 * scale, yScale: 16 * scale, borderColor: colors.green, borderWidth: 1.2 });
    [-26, -15, 0, 15, 26].forEach((offset) => {
      page.drawLine({
        start: { x: treeX, y: crownY - 18 * scale },
        end: { x: treeX + offset * scale, y: crownY + (18 - Math.abs(offset) * 0.16) * scale },
        color: offset % 2 ? colors.coral : colors.green,
        thickness: 1,
      });
    });
    [0.25, 0.48, 0.7].forEach((portion, index) => {
      page.drawLine({
        start: { x: treeX - (5 - portion * 3) * scale, y: baseY + 68 * portion * scale },
        end: { x: treeX + (5 - portion * 3) * scale, y: baseY + 68 * portion * scale + 5 },
        color: index % 2 ? colors.coral : colors.green,
        thickness: 1.1,
      });
    });
  };
  switch (variant) {
    case "tile": {
      const tileLeft = x + 32;
      const tileBottom = ground + 12;
      const tileWidth = width - 64;
      const tileHeight = 126;
      page.drawRectangle({ x: tileLeft, y: tileBottom, width: tileWidth, height: tileHeight, borderColor: colors.ink, borderWidth: 1.7 });
      page.drawLine({ start: { x: tileLeft, y: tileBottom + 42 }, end: { x: tileLeft + tileWidth, y: tileBottom + 42 }, color: colors.muted, thickness: 1 });
      page.drawLine({ start: { x: tileLeft, y: tileBottom + 84 }, end: { x: tileLeft + tileWidth, y: tileBottom + 84 }, color: colors.muted, thickness: 1 });
      page.drawLine({ start: { x: tileLeft + tileWidth / 4, y: tileBottom }, end: { x: tileLeft + tileWidth / 4, y: tileBottom + tileHeight }, color: colors.muted, thickness: 1 });
      page.drawLine({ start: { x: tileLeft + tileWidth / 2, y: tileBottom }, end: { x: tileLeft + tileWidth / 2, y: tileBottom + tileHeight }, color: colors.muted, thickness: 1 });
      page.drawLine({ start: { x: tileLeft + tileWidth * 0.75, y: tileBottom }, end: { x: tileLeft + tileWidth * 0.75, y: tileBottom + tileHeight }, color: colors.muted, thickness: 1 });
      for (let row = 0; row < 3; row += 1) {
        for (let column = 0; column < 4; column += 1) {
          const centerX = tileLeft + tileWidth * (column + 0.5) / 4;
          const centerY = tileBottom + tileHeight * (row + 0.5) / 3;
          page.drawLine({ start: { x: centerX, y: centerY + 15 }, end: { x: centerX + 15, y: centerY }, color: colors.ink, thickness: 1.3 });
          page.drawLine({ start: { x: centerX + 15, y: centerY }, end: { x: centerX, y: centerY - 15 }, color: colors.ink, thickness: 1.3 });
          page.drawLine({ start: { x: centerX, y: centerY - 15 }, end: { x: centerX - 15, y: centerY }, color: colors.ink, thickness: 1.3 });
          page.drawLine({ start: { x: centerX - 15, y: centerY }, end: { x: centerX, y: centerY + 15 }, color: colors.ink, thickness: 1.3 });
          page.drawLine({ start: { x: centerX, y: centerY + 12 }, end: { x: centerX + 7, y: centerY + 4 }, color: colors.coral, thickness: 1 });
          page.drawLine({ start: { x: centerX + 12, y: centerY }, end: { x: centerX + 4, y: centerY - 7 }, color: colors.coral, thickness: 1 });
          page.drawLine({ start: { x: centerX, y: centerY - 12 }, end: { x: centerX - 7, y: centerY - 4 }, color: colors.coral, thickness: 1 });
          page.drawLine({ start: { x: centerX - 12, y: centerY }, end: { x: centerX - 4, y: centerY + 7 }, color: colors.coral, thickness: 1 });
          page.drawCircle({ x: centerX, y: centerY, size: 2.5, color: colors.yellow });
        }
      }
      page.drawLine({ start: { x: x + 38, y: tileBottom + tileHeight + 8 }, end: { x: x + width - 38, y: tileBottom + tileHeight + 8 }, color: colors.coral, thickness: 1.4 });
      page.drawLine({ start: { x: x + 38, y: tileBottom - 8 }, end: { x: x + width - 38, y: tileBottom - 8 }, color: colors.coral, thickness: 1.4 });
      break;
    }
    case "merlion": {
      page.drawRectangle({ x: x + 78, y: ground, width: 116, height: 11, borderColor: colors.ink, borderWidth: 1.6 });
      page.drawEllipse({ x: x + 136, y: ground + 12, xScale: 52, yScale: 8, borderColor: colors.coral, borderWidth: 1.3 });
      page.drawEllipse({ x: x + 136, y: ground + 64, xScale: 34, yScale: 50, borderColor: colors.ink, borderWidth: 1.8 });
      drawPolyline([[108, 50], [86, 42], [65, 49], [49, 66], [61, 79], [82, 76], [101, 65]], colors.ink, 1.8, true);
      drawPolyline([[62, 66], [82, 62], [101, 65]], colors.coral, 1.2);
      page.drawEllipse({ x: x + 136, y: ground + 126, xScale: 43, yScale: 34, borderColor: colors.ink, borderWidth: 1.8 });
      drawPolyline([[101, 118], [89, 128], [100, 135], [92, 148], [109, 147], [115, 162], [128, 151], [139, 166], [150, 151], [167, 158], [164, 143], [180, 143], [171, 130]], colors.coral, 1.7);
      drawPolyline([[108, 135], [101, 148], [117, 145]], colors.ink, 1.4);
      drawPolyline([[157, 145], [173, 148], [166, 135]], colors.ink, 1.4);
      page.drawEllipse({ x: x + 158, y: ground + 117, xScale: 22, yScale: 14, borderColor: colors.ink, borderWidth: 1.4 });
      page.drawCircle({ x: x + 125, y: ground + 134, size: 2.8, color: colors.ink });
      page.drawCircle({ x: x + 148, y: ground + 134, size: 2.8, color: colors.ink });
      drawPolyline([[137, 129], [133, 122], [141, 122]], colors.ink, 1.1);
      drawPolyline([[145, 113], [158, 109], [171, 115]], colors.coral, 1.3);
      [[121, 84], [141, 84], [131, 67], [151, 67]].forEach(([scaleX, scaleY]) => {
        drawPolyline([[scaleX, scaleY + 7], [scaleX + 7, scaleY], [scaleX, scaleY - 7], [scaleX - 7, scaleY]], colors.green, 1, true);
      });
      drawPolyline([[104, 93], [89, 100], [100, 107]], colors.blue, 1.3);
      drawPolyline([[168, 116], [190, 112], [214, 101], [240, 86], [273, 82]], colors.blue, 1.5);
      drawPolyline([[169, 112], [195, 104], [220, 90], [246, 75], [274, 72]], colors.blue, 1.3);
      drawPolyline([[169, 108], [194, 96], [215, 80], [238, 65], [265, 61]], colors.blue, 1.1);
      drawWaves(ground + 35, 3);
      page.drawCircle({ x: x + width - 32, y: y + height - 27, size: 14, borderColor: colors.yellow, borderWidth: 1.5 });
      break;
    }
    case "guardian": {
      page.drawRectangle({ x: x + 92, y: ground, width: 116, height: 11, borderColor: colors.ink, borderWidth: 1.6 });
      page.drawRectangle({ x: x + 104, y: ground + 11, width: 92, height: 8, borderColor: colors.coral, borderWidth: 1.2 });
      drawPolyline([[119, 19], [113, 46], [123, 84], [137, 95], [163, 95], [177, 84], [187, 46], [181, 19]], colors.ink, 1.8, true);
      drawPolyline([[125, 20], [129, 48], [140, 78], [150, 88], [160, 78], [171, 48], [175, 20]], colors.coral, 1.2);
      drawPolyline([[120, 82], [108, 94], [116, 105], [130, 96]], colors.ink, 1.4, true);
      drawPolyline([[180, 82], [192, 94], [184, 105], [170, 96]], colors.ink, 1.4, true);
      page.drawEllipse({ x: x + 150, y: ground + 125, xScale: 31, yScale: 28, borderColor: colors.ink, borderWidth: 1.8 });
      drawPolyline([[119, 132], [108, 143], [122, 145], [117, 159], [135, 153], [143, 171], [151, 155], [160, 171], [167, 153], [185, 159], [180, 145], [193, 143], [181, 132]], colors.coral, 1.7);
      drawPolyline([[124, 139], [136, 145], [150, 141], [164, 145], [176, 139]], colors.ink, 1.2);
      page.drawCircle({ x: x + 138, y: ground + 130, size: 2.8, color: colors.ink });
      page.drawCircle({ x: x + 163, y: ground + 130, size: 2.8, color: colors.ink });
      drawPolyline([[151, 126], [146, 118], [154, 118]], colors.ink, 1.1);
      drawPolyline([[137, 109], [150, 103], [163, 109]], colors.coral, 1.3);
      drawPolyline([[130, 98], [150, 88], [170, 98]], colors.blue, 1.2);
      drawPolyline([[121, 87], [96, 82], [77, 65], [69, 42]], colors.ink, 1.8);
      drawPolyline([[179, 87], [198, 80], [211, 62], [216, 41]], colors.ink, 1.8);
      drawPolyline([[71, 39], [43, 46], [37, 69], [52, 86], [77, 79], [82, 58]], colors.ink, 1.7, true);
      drawPolyline([[45, 55], [73, 50], [42, 66], [76, 62], [48, 76], [76, 72]], colors.coral, 1);
      page.drawLine({ start: { x: x + 218, y: ground + 18 }, end: { x: x + 218, y: ground + 144 }, color: colors.ink, thickness: 1.8 });
      page.drawLine({ start: { x: x + 210, y: ground + 18 }, end: { x: x + 226, y: ground + 18 }, color: colors.ink, thickness: 1.2 });
      drawPolyline([[218, 144], [207, 158], [229, 158]], colors.coral, 1.5, true);
      break;
    }
    // These eight scenes (added 2026-09-22) have no bespoke vector art yet —
    // no image credits available to batch-generate their curated PNGs (see
    // scripts/generate-coloring-library.ts) or write eight new hand-drawn
    // compositions in the meantime. They share skyline's neutral scene
    // rather than rendering blank; each becomes its own bespoke drawing (or
    // gets real curated art) as a follow-up, not a permanent choice.
    case "canal":
    case "windmill":
    case "bicycle":
    case "machine":
    case "boat":
    case "statue":
    case "playground":
    case "artwork":
    case "skyline":
      page.drawCircle({ x: x + width - 42, y: y + height - 36, size: 20, borderColor: colors.yellow, borderWidth: 2 });
      drawCloud(x + 34, y + height - 46);
      [0, 1, 2].forEach((index) => {
        const buildingX = x + 32 + index * 82;
        const buildingHeight = 56 + index * 18;
        page.drawRectangle({ x: buildingX, y: ground, width: 56, height: buildingHeight, borderColor: colors.ink, borderWidth: 1.8 });
        page.drawLine({ start: { x: buildingX + 14, y: ground + buildingHeight }, end: { x: buildingX + 28, y: ground + buildingHeight + 20 }, color: colors.ink, thickness: 1.6 });
        page.drawLine({ start: { x: buildingX + 42, y: ground + buildingHeight }, end: { x: buildingX + 28, y: ground + buildingHeight + 20 }, color: colors.ink, thickness: 1.6 });
        drawWindows(buildingX + 12, ground + 14, 3, Math.max(1, Math.floor(buildingHeight / 34)));
      });
      page.drawLine({ start: { x: x + 24, y: ground }, end: { x: x + width - 24, y: ground }, color: colors.ink, thickness: 1.8 });
      drawTree(x + width - 78, ground, 0.8);
      drawBird(x + 55, y + height - 62);
      drawBird(x + 92, y + height - 76, 0.8);
      break;
    case "supertree":
      page.drawLine({ start: { x: x + 22, y: ground }, end: { x: x + width - 22, y: ground }, color: colors.ink, thickness: 1.5 });
      drawSupertree(x + width * 0.5, ground, 1.15);
      drawSupertree(x + width * 0.23, ground, 0.78);
      drawSupertree(x + width * 0.78, ground, 0.84);
      page.drawLine({ start: { x: x + width * 0.29, y: ground + 77 }, end: { x: x + width * 0.43, y: ground + 91 }, color: colors.blue, thickness: 2 });
      page.drawLine({ start: { x: x + width * 0.57, y: ground + 93 }, end: { x: x + width * 0.72, y: ground + 83 }, color: colors.blue, thickness: 2 });
      page.drawLine({ start: { x: x + width * 0.29, y: ground + 72 }, end: { x: x + width * 0.43, y: ground + 86 }, color: colors.blue, thickness: 0.8 });
      page.drawLine({ start: { x: x + width * 0.57, y: ground + 88 }, end: { x: x + width * 0.72, y: ground + 78 }, color: colors.blue, thickness: 0.8 });
      [0.14, 0.34, 0.66, 0.88].forEach((portion) => page.drawCircle({ x: x + width * portion, y: ground + 5, size: 5, borderColor: colors.green, borderWidth: 1 }));
      page.drawCircle({ x: x + width - 38, y: y + height - 28, size: 13, borderColor: colors.yellow, borderWidth: 1.6 });
      drawBird(x + 35, y + height - 34, 0.8);
      break;
    case "garden":
      page.drawLine({ start: { x: x + 34, y: ground }, end: { x: x + width - 34, y: ground }, color: colors.ink, thickness: 1.5 });
      drawTree(x + 45, ground, 0.8);
      drawCloud(x + width - 150, y + height - 40);
      [0, 1, 2].forEach((index) => {
        const flowerX = x + 72 + index * 92;
        const flowerY = ground + 52 + (index % 2) * 20;
        page.drawLine({ start: { x: flowerX, y: ground }, end: { x: flowerX, y: flowerY }, color: colors.ink, thickness: 1.5 });
        page.drawCircle({ x: flowerX - 7, y: flowerY, size: 8, borderColor: colors.coral, borderWidth: 1.5 });
        page.drawCircle({ x: flowerX + 7, y: flowerY, size: 8, borderColor: colors.coral, borderWidth: 1.5 });
        page.drawCircle({ x: flowerX, y: flowerY + 7, size: 8, borderColor: colors.yellow, borderWidth: 1.5 });
        page.drawCircle({ x: flowerX, y: flowerY, size: 3, borderColor: colors.ink, borderWidth: 1 });
      });
      page.drawLine({ start: { x: x + 58, y: ground }, end: { x: x + width / 2, y: y + height - 28 }, color: colors.ink, thickness: 1.2 });
      page.drawLine({ start: { x: x + width - 58, y: ground }, end: { x: x + width / 2, y: y + height - 28 }, color: colors.ink, thickness: 1.2 });
      page.drawCircle({ x: x + width - 56, y: ground + 74, size: 5, borderColor: colors.coral, borderWidth: 1.2 });
      page.drawCircle({ x: x + width - 43, y: ground + 80, size: 5, borderColor: colors.coral, borderWidth: 1.2 });
      drawBird(x + 210, y + height - 52, 0.8);
      break;
    case "bridge":
      page.drawLine({ start: { x: x + 26, y: ground + 42 }, end: { x: x + width - 26, y: ground + 42 }, color: colors.ink, thickness: 2 });
      page.drawLine({ start: { x: x + 26, y: ground + 30 }, end: { x: x + width - 26, y: ground + 30 }, color: colors.ink, thickness: 1.5 });
      [0, 1, 2, 3].forEach((index) => {
        const bridgeX = x + 60 + index * 88;
        page.drawLine({ start: { x: bridgeX, y: ground + 30 }, end: { x: bridgeX + 20, y: ground }, color: colors.ink, thickness: 1.4 });
        page.drawLine({ start: { x: bridgeX + 20, y: ground }, end: { x: bridgeX + 40, y: ground + 30 }, color: colors.ink, thickness: 1.4 });
      });
      [0, 1, 2].forEach((index) => page.drawLine({ start: { x: x + 35, y: y + 22 + index * 10 }, end: { x: x + width - 35, y: y + 22 + index * 10 }, color: colors.blue, thickness: 1 }));
      page.drawLine({ start: { x: x + 30, y: ground + 104 }, end: { x: x + 115, y: ground + 140 }, color: colors.green, thickness: 1.6 });
      page.drawLine({ start: { x: x + width - 30, y: ground + 104 }, end: { x: x + width - 115, y: ground + 140 }, color: colors.green, thickness: 1.6 });
      drawCloud(x + 54, y + height - 46);
      drawWaves(ground + 8, 4);
      drawBird(x + 222, y + height - 63);
      break;
    case "train": {
      const trainX = x + 58;
      const trainY = ground + 22;
      page.drawRectangle({ x: trainX, y: trainY, width: width - 116, height: 82, borderColor: colors.ink, borderWidth: 1.8 });
      page.drawLine({ start: { x: trainX, y: trainY + 82 }, end: { x: trainX + 28, y: trainY + 105 }, color: colors.ink, thickness: 1.8 });
      page.drawLine({ start: { x: trainX + width - 116, y: trainY + 82 }, end: { x: trainX + width - 144, y: trainY + 105 }, color: colors.ink, thickness: 1.8 });
      page.drawLine({ start: { x: trainX + 28, y: trainY + 105 }, end: { x: trainX + width - 144, y: trainY + 105 }, color: colors.coral, thickness: 2 });
      [0, 1, 2, 3].forEach((index) => page.drawRectangle({ x: trainX + 24 + index * ((width - 190) / 3), y: trainY + 43, width: 42, height: 24, borderColor: colors.blue, borderWidth: 1.2 }));
      page.drawCircle({ x: trainX + 70, y: trainY, size: 14, color: colors.white, borderColor: colors.ink, borderWidth: 1.5 });
      page.drawCircle({ x: trainX + width - 184, y: trainY, size: 14, color: colors.white, borderColor: colors.ink, borderWidth: 1.5 });
      page.drawLine({ start: { x: x + 28, y: ground + 3 }, end: { x: x + width - 28, y: ground + 3 }, color: colors.ink, thickness: 1.4 });
      page.drawLine({ start: { x: x + 28, y: ground - 6 }, end: { x: x + width - 28, y: ground - 6 }, color: colors.ink, thickness: 1.4 });
      break;
    }
    case "market":
      page.drawRectangle({ x: x + 72, y: ground, width: 210, height: 94, borderColor: colors.ink, borderWidth: 1.8 });
      page.drawLine({ start: { x: x + 58, y: ground + 94 }, end: { x: x + 296, y: ground + 94 }, color: colors.coral, thickness: 3 });
      [0, 1, 2, 3].forEach((index) => page.drawLine({ start: { x: x + 70 + index * 57, y: ground + 94 }, end: { x: x + 84 + index * 57, y: ground + 72 }, color: colors.coral, thickness: 1.6 }));
      page.drawCircle({ x: x + 130, y: ground + 38, size: 18, borderColor: colors.green, borderWidth: 1.7 });
      page.drawCircle({ x: x + 220, y: ground + 44, size: 23, borderColor: colors.yellow, borderWidth: 1.7 });
      page.drawLine({ start: { x: x + 95, y: ground + 18 }, end: { x: x + 260, y: ground + 18 }, color: colors.ink, thickness: 1.2 });
      drawWindows(x + 92, ground + 60, 6, 1, 25);
      [0, 1, 2, 3].forEach((index) => page.drawCircle({ x: x + 112 + index * 33, y: ground + 27, size: 7, borderColor: index % 2 ? colors.coral : colors.green, borderWidth: 1.2 }));
      page.drawLine({ start: { x: x + 48, y: ground }, end: { x: x + 62, y: ground + 56 }, color: colors.ink, thickness: 1.4 });
      page.drawLine({ start: { x: x + width - 48, y: ground }, end: { x: x + width - 62, y: ground + 56 }, color: colors.ink, thickness: 1.4 });
      drawLantern(x + 96, ground + 122);
      drawLantern(x + 252, ground + 122);
      break;
    case "mountain":
      page.drawLine({ start: { x: x + 24, y: ground }, end: { x: x + 120, y: y + height - 24 }, color: colors.ink, thickness: 1.8 });
      page.drawLine({ start: { x: x + 120, y: y + height - 24 }, end: { x: x + 214, y: ground }, color: colors.ink, thickness: 1.8 });
      page.drawLine({ start: { x: x + 164, y: ground }, end: { x: x + 266, y: y + height - 56 }, color: colors.ink, thickness: 1.8 });
      page.drawLine({ start: { x: x + 266, y: y + height - 56 }, end: { x: x + width - 20, y: ground }, color: colors.ink, thickness: 1.8 });
      page.drawCircle({ x: x + width - 45, y: y + height - 32, size: 18, borderColor: colors.yellow, borderWidth: 2 });
      page.drawLine({ start: { x: x + width / 2, y: ground }, end: { x: x + width / 2 + 24, y: ground + 44 }, color: colors.green, thickness: 1.4 });
      page.drawLine({ start: { x: x + 120, y: y + height - 24 }, end: { x: x + 137, y: y + height - 45 }, color: colors.blue, thickness: 1.1 });
      drawTree(x + 54, ground, 0.65);
      drawTree(x + width - 80, ground, 0.55);
      drawCloud(x + 30, y + height - 78);
      page.drawLine({ start: { x: x + 135, y: ground }, end: { x: x + 165, y: ground + 64 }, color: colors.coral, thickness: 1.3 });
      page.drawLine({ start: { x: x + 165, y: ground + 64 }, end: { x: x + 198, y: ground + 106 }, color: colors.coral, thickness: 1.3 });
      break;
    case "temple":
      page.drawRectangle({ x: x + 92, y: ground, width: 168, height: 92, borderColor: colors.ink, borderWidth: 1.8 });
      page.drawLine({ start: { x: x + 68, y: ground + 92 }, end: { x: x + 176, y: ground + 136 }, color: colors.coral, thickness: 2 });
      page.drawLine({ start: { x: x + 284, y: ground + 92 }, end: { x: x + 176, y: ground + 136 }, color: colors.coral, thickness: 2 });
      page.drawLine({ start: { x: x + 52, y: ground + 78 }, end: { x: x + 300, y: ground + 78 }, color: colors.ink, thickness: 1.6 });
      [0, 1, 2].forEach((index) => page.drawRectangle({ x: x + 116 + index * 46, y: ground, width: 15, height: 54, borderColor: colors.blue, borderWidth: 1.4 }));
      page.drawCircle({ x: x + width - 38, y: y + height - 28, size: 17, borderColor: colors.yellow, borderWidth: 2 });
      page.drawLine({ start: { x: x + 76, y: ground }, end: { x: x + 62, y: ground + 52 }, color: colors.ink, thickness: 1.4 });
      page.drawLine({ start: { x: x + width - 76, y: ground }, end: { x: x + width - 62, y: ground + 52 }, color: colors.ink, thickness: 1.4 });
      [0, 1, 2].forEach((index) => page.drawCircle({ x: x + 116 + index * 46, y: ground + 72, size: 6, borderColor: colors.coral, borderWidth: 1.2 }));
      page.drawLine({ start: { x: x + 78, y: ground - 3 }, end: { x: x + 282, y: ground - 3 }, color: colors.ink, thickness: 1.3 });
      drawLantern(x + 86, ground + 103);
      drawLantern(x + 266, ground + 103);
      break;
    case "mosque": {
      const center = x + width / 2;
      page.drawLine({ start: { x: x + 36, y: ground }, end: { x: x + width - 36, y: ground }, color: colors.ink, thickness: 1.6 });
      page.drawRectangle({ x: center - 95, y: ground, width: 190, height: 78, borderColor: colors.ink, borderWidth: 1.8 });
      page.drawCircle({ x: center, y: ground + 78, size: 53, borderColor: colors.coral, borderWidth: 2 });
      page.drawRectangle({ x: center - 56, y: ground + 24, width: 112, height: 54, color: colors.white });
      page.drawLine({ start: { x: center - 53, y: ground + 78 }, end: { x: center + 53, y: ground + 78 }, color: colors.coral, thickness: 2 });
      [center - 58, center, center + 58].forEach((archX, index) => {
        page.drawRectangle({ x: archX - 12, y: ground, width: 24, height: 39 + (index % 2) * 8, borderColor: colors.blue, borderWidth: 1.2 });
        page.drawCircle({ x: archX, y: ground + 39 + (index % 2) * 8, size: 12, borderColor: colors.blue, borderWidth: 1.2 });
        page.drawRectangle({ x: archX - 14, y: ground + 25 + (index % 2) * 8, width: 28, height: 16, color: colors.white });
      });
      [center - 132, center + 132].forEach((minaretX) => {
        page.drawRectangle({ x: minaretX - 9, y: ground, width: 18, height: 114, borderColor: colors.ink, borderWidth: 1.5 });
        page.drawLine({ start: { x: minaretX - 16, y: ground + 114 }, end: { x: minaretX, y: ground + 137 }, color: colors.ink, thickness: 1.5 });
        page.drawLine({ start: { x: minaretX + 16, y: ground + 114 }, end: { x: minaretX, y: ground + 137 }, color: colors.ink, thickness: 1.5 });
        page.drawLine({ start: { x: minaretX, y: ground + 137 }, end: { x: minaretX, y: ground + 149 }, color: colors.coral, thickness: 1.2 });
      });
      page.drawLine({ start: { x: center, y: ground + 131 }, end: { x: center, y: ground + 148 }, color: colors.coral, thickness: 1.2 });
      page.drawCircle({ x: center + 5, y: ground + 151, size: 7, borderColor: colors.coral, borderWidth: 1.2 });
      page.drawCircle({ x: center + 8, y: ground + 153, size: 6, color: colors.white });
      break;
    }
    case "tower": {
      const center = x + width / 2;
      page.drawLine({ start: { x: center - 66, y: ground }, end: { x: center - 13, y: ground + 142 }, color: colors.ink, thickness: 2 });
      page.drawLine({ start: { x: center + 66, y: ground }, end: { x: center + 13, y: ground + 142 }, color: colors.ink, thickness: 2 });
      page.drawLine({ start: { x: center - 45, y: ground + 44 }, end: { x: center + 45, y: ground + 44 }, color: colors.coral, thickness: 1.8 });
      page.drawLine({ start: { x: center - 31, y: ground + 82 }, end: { x: center + 31, y: ground + 82 }, color: colors.coral, thickness: 1.8 });
      page.drawRectangle({ x: center - 40, y: ground + 99, width: 80, height: 14, borderColor: colors.blue, borderWidth: 1.5 });
      page.drawLine({ start: { x: center, y: ground + 142 }, end: { x: center, y: ground + 166 }, color: colors.ink, thickness: 1.5 });
      [[-52, 44, 31, 82], [52, 44, -31, 82], [-31, 82, 13, 142], [31, 82, -13, 142]].forEach(([x1, y1, x2, y2]) => {
        page.drawLine({ start: { x: center + x1, y: ground + y1 }, end: { x: center + x2, y: ground + y2 }, color: colors.muted, thickness: 1 });
      });
      drawTree(x + 54, ground, 0.55);
      drawTree(x + width - 74, ground, 0.55);
      break;
    }
    case "castle": {
      const left = x + 70;
      const right = x + width - 70;
      page.drawRectangle({ x: left + 40, y: ground, width: right - left - 80, height: 86, borderColor: colors.ink, borderWidth: 1.8 });
      [left, right - 45].forEach((towerX) => {
        page.drawRectangle({ x: towerX, y: ground, width: 45, height: 116, borderColor: colors.ink, borderWidth: 1.8 });
        [0, 1, 2].forEach((index) => page.drawRectangle({ x: towerX + index * 18, y: ground + 116, width: 9, height: 13, borderColor: colors.coral, borderWidth: 1.2 }));
      });
      [0, 1, 2, 3, 4].forEach((index) => page.drawRectangle({ x: left + 45 + index * ((right - left - 55) / 4), y: ground + 86, width: 10, height: 13, borderColor: colors.coral, borderWidth: 1.2 }));
      const center = x + width / 2;
      page.drawRectangle({ x: center - 18, y: ground, width: 36, height: 48, borderColor: colors.blue, borderWidth: 1.4 });
      page.drawCircle({ x: center, y: ground + 48, size: 18, borderColor: colors.blue, borderWidth: 1.4 });
      page.drawRectangle({ x: center - 20, y: ground + 31, width: 40, height: 20, color: colors.white });
      page.drawLine({ start: { x: x + 28, y: ground }, end: { x: x + width - 28, y: ground }, color: colors.ink, thickness: 1.5 });
      break;
    }
    case "cave":
      page.drawCircle({ x: x + width / 2, y: ground + 82, size: 110, borderColor: colors.ink, borderWidth: 2 });
      page.drawCircle({ x: x + width / 2, y: ground + 74, size: 72, borderColor: colors.blue, borderWidth: 1.5 });
      page.drawLine({ start: { x: x + 34, y: ground }, end: { x: x + width - 34, y: ground }, color: colors.ink, thickness: 1.8 });
      [0, 1, 2, 3].forEach((index) => {
        const stalactiteX = x + 72 + index * 62;
        page.drawLine({ start: { x: stalactiteX, y: ground + 158 - (index % 2) * 14 }, end: { x: stalactiteX + 9, y: ground + 128 - (index % 2) * 14 }, color: colors.ink, thickness: 1.5 });
      });
      drawTree(x + 50, ground, 0.55);
      drawTree(x + width - 70, ground, 0.55);
      drawBird(x + 92, y + height - 42, 0.8);
      [0, 1, 2].forEach((index) => page.drawCircle({ x: x + 142 + index * 28, y: ground + 48, size: 4, borderColor: colors.blue, borderWidth: 1.2 }));
      break;
    case "coast":
      page.drawCircle({ x: x + width - 42, y: y + height - 35, size: 18, borderColor: colors.yellow, borderWidth: 1.8 });
      [0, 1, 2].forEach((index) => drawWaves(ground + index * 11, 4));
      page.drawRectangle({ x: x + 64, y: ground + 24, width: 34, height: 92, borderColor: colors.ink, borderWidth: 1.7 });
      page.drawLine({ start: { x: x + 58, y: ground + 116 }, end: { x: x + 81, y: ground + 140 }, color: colors.ink, thickness: 1.6 });
      page.drawLine({ start: { x: x + 104, y: ground + 116 }, end: { x: x + 81, y: ground + 140 }, color: colors.ink, thickness: 1.6 });
      page.drawRectangle({ x: x + 69, y: ground + 70, width: 24, height: 20, borderColor: colors.blue, borderWidth: 1.2 });
      page.drawLine({ start: { x: x + 81, y: ground + 140 }, end: { x: x + 81, y: ground + 154 }, color: colors.coral, thickness: 1.2 });
      page.drawLine({ start: { x: x + 81, y: ground + 154 }, end: { x: x + 111, y: ground + 147 }, color: colors.coral, thickness: 1.2 });
      page.drawLine({ start: { x: x + 216, y: ground + 51 }, end: { x: x + 258, y: ground + 94 }, color: colors.ink, thickness: 1.5 });
      page.drawLine({ start: { x: x + 258, y: ground + 94 }, end: { x: x + 300, y: ground + 51 }, color: colors.ink, thickness: 1.5 });
      page.drawLine({ start: { x: x + 258, y: ground + 94 }, end: { x: x + 258, y: ground + 122 }, color: colors.ink, thickness: 1.4 });
      page.drawLine({ start: { x: x + 258, y: ground + 122 }, end: { x: x + 292, y: ground + 101 }, color: colors.coral, thickness: 1.2 });
      page.drawLine({ start: { x: x + 204, y: ground + 50 }, end: { x: x + 310, y: ground + 50 }, color: colors.ink, thickness: 2 });
      break;
    case "penguin": {
      const drawPenguin = (penguinX: number, penguinY: number, scale: number) => {
        page.drawCircle({ x: penguinX, y: penguinY + 44 * scale, size: 30 * scale, borderColor: colors.ink, borderWidth: 1.7 });
        page.drawCircle({ x: penguinX, y: penguinY + 86 * scale, size: 22 * scale, borderColor: colors.ink, borderWidth: 1.7 });
        page.drawCircle({ x: penguinX, y: penguinY + 42 * scale, size: 18 * scale, borderColor: colors.blue, borderWidth: 1.1 });
        page.drawLine({ start: { x: penguinX - 27 * scale, y: penguinY + 55 * scale }, end: { x: penguinX - 45 * scale, y: penguinY + 33 * scale }, color: colors.coral, thickness: 1.3 });
        page.drawLine({ start: { x: penguinX + 27 * scale, y: penguinY + 55 * scale }, end: { x: penguinX + 45 * scale, y: penguinY + 33 * scale }, color: colors.coral, thickness: 1.3 });
        page.drawLine({ start: { x: penguinX - 8 * scale, y: penguinY + 13 * scale }, end: { x: penguinX - 21 * scale, y: penguinY }, color: colors.ink, thickness: 1.3 });
        page.drawLine({ start: { x: penguinX + 8 * scale, y: penguinY + 13 * scale }, end: { x: penguinX + 21 * scale, y: penguinY }, color: colors.ink, thickness: 1.3 });
        page.drawLine({ start: { x: penguinX, y: penguinY + 83 * scale }, end: { x: penguinX + 18 * scale, y: penguinY + 78 * scale }, color: colors.coral, thickness: 1.2 });
      };
      page.drawLine({ start: { x: x + 28, y: ground }, end: { x: x + width - 28, y: ground }, color: colors.blue, thickness: 1.4 });
      drawPenguin(x + width * 0.4, ground + 4, 1);
      drawPenguin(x + width * 0.68, ground + 2, 0.72);
      drawBird(x + 45, y + height - 42, 0.8);
      break;
    }
    case "wildlife": {
      const animalX = x + width * 0.45;
      page.drawCircle({ x: animalX, y: ground + 76, size: 54, borderColor: colors.ink, borderWidth: 1.7 });
      page.drawCircle({ x: animalX + 65, y: ground + 100, size: 34, borderColor: colors.ink, borderWidth: 1.7 });
      page.drawCircle({ x: animalX + 48, y: ground + 104, size: 28, borderColor: colors.green, borderWidth: 1.2 });
      page.drawLine({ start: { x: animalX + 92, y: ground + 94 }, end: { x: animalX + 108, y: ground + 54 }, color: colors.ink, thickness: 2 });
      page.drawLine({ start: { x: animalX + 108, y: ground + 54 }, end: { x: animalX + 118, y: ground + 65 }, color: colors.ink, thickness: 1.5 });
      [-31, 8].forEach((offset) => {
        page.drawRectangle({ x: animalX + offset, y: ground, width: 17, height: 48, borderColor: colors.ink, borderWidth: 1.5 });
      });
      page.drawCircle({ x: animalX + 75, y: ground + 110, size: 3, color: colors.ink });
      drawTree(x + 55, ground, 0.75);
      drawTree(x + width - 55, ground, 0.5);
      drawBird(x + 40, y + height - 35, 0.8);
      break;
    }
    case "dinosaur": {
      const bodyX = x + width * 0.48;
      page.drawCircle({ x: bodyX, y: ground + 74, size: 58, borderColor: colors.ink, borderWidth: 1.8 });
      page.drawCircle({ x: bodyX - 79, y: ground + 126, size: 25, borderColor: colors.ink, borderWidth: 1.8 });
      page.drawLine({ start: { x: bodyX - 55, y: ground + 91 }, end: { x: bodyX - 72, y: ground + 119 }, color: colors.ink, thickness: 2 });
      page.drawLine({ start: { x: bodyX + 55, y: ground + 86 }, end: { x: bodyX + 126, y: ground + 106 }, color: colors.ink, thickness: 2 });
      page.drawLine({ start: { x: bodyX + 126, y: ground + 106 }, end: { x: bodyX + 92, y: ground + 72 }, color: colors.ink, thickness: 1.5 });
      [-30, 24].forEach((offset) => {
        page.drawLine({ start: { x: bodyX + offset, y: ground + 32 }, end: { x: bodyX + offset - 9, y: ground }, color: colors.ink, thickness: 2 });
        page.drawLine({ start: { x: bodyX + offset - 9, y: ground }, end: { x: bodyX + offset + 8, y: ground }, color: colors.ink, thickness: 1.5 });
      });
      [-42, -22, 0, 24, 45].forEach((offset) => {
        page.drawLine({ start: { x: bodyX + offset, y: ground + 124 - Math.abs(offset) * 0.3 }, end: { x: bodyX + offset + 8, y: ground + 141 - Math.abs(offset) * 0.2 }, color: colors.coral, thickness: 1.3 });
      });
      page.drawCircle({ x: bodyX - 87, y: ground + 132, size: 3, color: colors.ink });
      page.drawLine({ start: { x: x + 24, y: ground }, end: { x: x + width - 24, y: ground }, color: colors.green, thickness: 1.3 });
      break;
    }
    case "shophouse":
      [0, 1, 2].forEach((index) => {
        const shopX = x + 34 + index * 88;
        const buildingHeight = 116 - (index % 2) * 16;
        const roofBase = ground + buildingHeight;
        page.drawRectangle({ x: shopX, y: ground, width: 74, height: buildingHeight, borderColor: colors.ink, borderWidth: 1.7 });
        page.drawLine({ start: { x: shopX - 4, y: roofBase }, end: { x: shopX + 37, y: roofBase + 22 }, color: colors.ink, thickness: 1.6 });
        page.drawLine({ start: { x: shopX + 37, y: roofBase + 22 }, end: { x: shopX + 78, y: roofBase }, color: colors.ink, thickness: 1.6 });
        page.drawLine({ start: { x: shopX + 3, y: roofBase - 6 }, end: { x: shopX + 71, y: roofBase - 6 }, color: colors.muted, thickness: 1 });
        page.drawLine({ start: { x: shopX, y: ground + 74 }, end: { x: shopX + 74, y: ground + 74 }, color: colors.coral, thickness: 2.2 });
        page.drawLine({ start: { x: shopX, y: ground + 80 }, end: { x: shopX + 74, y: ground + 80 }, color: colors.coral, thickness: 1 });
        drawWindows(shopX + 12, ground + buildingHeight - 30, 2, 1, 26);
        page.drawLine({ start: { x: shopX + 17, y: ground + buildingHeight - 30 }, end: { x: shopX + 17, y: ground + buildingHeight - 17 }, color: colors.muted, thickness: 1 });
        page.drawLine({ start: { x: shopX + 43, y: ground + buildingHeight - 30 }, end: { x: shopX + 43, y: ground + buildingHeight - 17 }, color: colors.muted, thickness: 1 });
        page.drawRectangle({ x: shopX + 25, y: ground, width: 24, height: 42, borderColor: colors.blue, borderWidth: 1.2 });
        page.drawLine({ start: { x: shopX + 37, y: ground }, end: { x: shopX + 37, y: ground + 42 }, color: colors.blue, thickness: 1 });
        page.drawCircle({ x: shopX + 33, y: ground + 20, size: 1.5, color: colors.blue });
        page.drawRectangle({ x: shopX + 26, y: ground + 84, width: 22, height: 11, borderColor: colors.coral, borderWidth: 1 });
      });
      page.drawLine({ start: { x: x + 22, y: ground }, end: { x: x + width - 22, y: ground }, color: colors.ink, thickness: 1.8 });
      page.drawLine({ start: { x: x + 24, y: ground + 136 }, end: { x: x + width - 24, y: ground + 136 }, color: colors.muted, thickness: 1 });
      [0, 1, 2].forEach((index) => {
        const signX = x + 70 + index * 88;
        page.drawLine({ start: { x: signX, y: ground + 136 }, end: { x: signX, y: ground + 124 }, color: colors.ink, thickness: 1 });
        page.drawCircle({ x: signX, y: ground + 116, size: 8, borderColor: colors.yellow, borderWidth: 1.3 });
      });
      drawLantern(x + 70, ground + 142);
      drawLantern(x + width - 70, ground + 142);
      break;
  }
  drawColoringVariant(page, scene, variant, variation);
}
