import { LineCapStyle, type PDFPage, type RGB } from "pdf-lib";
import type { StickerIcon } from "../../booklet/stickers.ts";
import { drawDoodleSparkle, drawDoodleStar } from "../illustrations.ts";
import type { Fonts } from "../layout.ts";

// Small line icons for stickers and sticker spots, drawn centred on
// (cx, cy) inside a square of side `size`.
export function drawStickerIcon(page: PDFPage, fonts: Fonts, icon: StickerIcon, cx: number, cy: number, size: number, color: RGB) {
  const s = size / 2;
  const line = (x1: number, y1: number, x2: number, y2: number, thickness = Math.max(1.2, size * 0.08)) =>
    page.drawLine({ start: { x: cx + x1 * s, y: cy + y1 * s }, end: { x: cx + x2 * s, y: cy + y2 * s }, thickness, color, lineCap: LineCapStyle.Round });
  const stroke = Math.max(1.2, size * 0.08);
  switch (icon) {
    case "star":
      drawDoodleStar(page, cx, cy, s * 0.95, color, stroke);
      return;
    case "sparkle":
      drawDoodleSparkle(page, cx, cy, s * 0.95, color);
      return;
    case "heart":
      page.drawSvgPath("M 0,0.35 C -0.1,0.1 -0.9,-0.1 -0.9,-0.45 C -0.9,-0.8 -0.45,-0.95 0,-0.55 C 0.45,-0.95 0.9,-0.8 0.9,-0.45 C 0.9,-0.1 0.1,0.1 0,0.35 Z"
        .replace(/-?\d+(\.\d+)?/g, (value) => String(Number(value) * s)), { x: cx, y: cy + s * 0.15, borderColor: color, borderWidth: stroke });
      return;
    case "magnifier":
      page.drawCircle({ x: cx - s * 0.2, y: cy + s * 0.2, size: s * 0.5, borderColor: color, borderWidth: stroke });
      line(0.15, -0.15, 0.8, -0.8);
      return;
    case "pencil":
      line(-0.7, -0.7, 0.55, 0.55, size * 0.22);
      line(-0.7, -0.7, -0.9, -0.9, stroke);
      return;
    case "pin":
      page.drawSvgPath("M 0,-0.9 C 0.5,-0.9 0.7,-0.5 0.7,-0.25 C 0.7,0.2 0.2,0.5 0,0.95 C -0.2,0.5 -0.7,0.2 -0.7,-0.25 C -0.7,-0.5 -0.5,-0.9 0,-0.9 Z"
        .replace(/-?\d+(\.\d+)?/g, (value) => String(Number(value) * s)), { x: cx, y: cy, borderColor: color, borderWidth: stroke });
      page.drawCircle({ x: cx, y: cy + s * 0.25, size: s * 0.22, borderColor: color, borderWidth: stroke });
      return;
    case "maze":
      line(-0.8, 0.8, 0.8, 0.8); line(0.8, 0.8, 0.8, -0.8); line(0.8, -0.8, -0.4, -0.8);
      line(-0.8, 0.8, -0.8, -0.4); line(-0.4, 0.4, 0.4, 0.4); line(0.4, 0.4, 0.4, -0.4); line(-0.4, 0.4, -0.4, -0.4);
      return;
    case "check":
      line(-0.7, 0, -0.2, -0.55); line(-0.2, -0.55, 0.75, 0.6);
      return;
    case "crown":
      line(-0.8, -0.5, 0.8, -0.5); line(-0.8, -0.5, -0.8, 0.4); line(-0.8, 0.4, -0.4, 0); line(-0.4, 0, 0, 0.6);
      line(0, 0.6, 0.4, 0); line(0.4, 0, 0.8, 0.4); line(0.8, 0.4, 0.8, -0.5);
      return;
    case "flag":
      line(-0.6, -0.9, -0.6, 0.9);
      page.drawSvgPath(`M 0,0 L ${1.3 * s},${0.3 * s} L 0,${0.75 * s} Z`, { x: cx - s * 0.6, y: cy + s * 0.9, borderColor: color, borderWidth: stroke });
      return;
    case "key":
      page.drawCircle({ x: cx - s * 0.45, y: cy, size: s * 0.35, borderColor: color, borderWidth: stroke });
      line(-0.1, 0, 0.85, 0); line(0.55, 0, 0.55, -0.3); line(0.8, 0, 0.8, -0.3);
      return;
    case "book":
      line(0, -0.6, 0, 0.7);
      page.drawSvgPath(`M 0,0 L ${-0.85 * s},${-0.15 * s} L ${-0.85 * s},${1.15 * s} L 0,${1.3 * s} L ${0.85 * s},${1.15 * s} L ${0.85 * s},${-0.15 * s} Z`, { x: cx, y: cy + s * 0.65, borderColor: color, borderWidth: stroke });
      return;
    case "envelope":
      page.drawRectangle({ x: cx - s * 0.85, y: cy - s * 0.55, width: s * 1.7, height: s * 1.1, borderColor: color, borderWidth: stroke });
      line(-0.85, 0.55, 0, -0.1); line(0, -0.1, 0.85, 0.55);
      return;
    case "sun":
      page.drawCircle({ x: cx, y: cy, size: s * 0.42, borderColor: color, borderWidth: stroke });
      for (let ray = 0; ray < 8; ray += 1) {
        const angle = (ray / 8) * Math.PI * 2;
        line(Math.cos(angle) * 0.6, Math.sin(angle) * 0.6, Math.cos(angle) * 0.9, Math.sin(angle) * 0.9);
      }
      return;
    case "question": {
      const textSize = size * 0.95;
      const width = fonts.display.widthOfTextAtSize("?", textSize);
      page.drawText("?", { x: cx - width / 2, y: cy - textSize * 0.35, size: textSize, font: fonts.display, color });
      return;
    }
  }
}
