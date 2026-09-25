import { degrees, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import { palette, type DestinationTheme } from "./theme.ts";

// Reusable, stylistically-consistent drawing primitives for the printable
// PDF booklet — the "hand-drawn journal" vocabulary referenced throughout
// app/lib/pdf/booklet-pdf.ts's page-composition functions, instead of each page
// inventing its own one-off rectangles. Every function here only draws; it
// has no knowledge of booklet content.
//
// "Imperfect" shapes take a `seed` (any string — a title, a day number) and
// derive their jitter from it deterministically, so the same booklet looks
// the same on every re-render instead of shuffling on each regenerate.

function seededRandom(seed: string) {
  let hash = 17;
  for (const character of seed) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return () => {
    hash = (hash * 1664525 + 1013904223) >>> 0;
    return hash / 4294967296;
  };
}

type Box = { x: number; y: number; width: number; height: number };

// A gently imperfect line — a single quadratic bezier bowed slightly off
// the straight path — for underlines, journey marks, and connector lines
// wherever the design calls for "hand-drawn" rather than a ruled line.
export function drawHandLine(
  page: PDFPage,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: RGB,
  thickness = 1.4,
  seed = `${x1},${y1},${x2},${y2}`,
) {
  const random = seededRandom(seed);
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.max(1, Math.hypot(dx, dy));
  const bow = (random() - 0.5) * Math.min(6, length * 0.08);
  const normalX = -dy / length;
  const normalY = dx / length;
  const controlX = midX + normalX * bow;
  const controlY = midY + normalY * bow;
  // drawSvgPath's own coordinate system increases downward from the given
  // x/y anchor (unlike the page's normal upward-y axis) — anchor at the
  // path's own origin and express the rest as relative-to-that deltas.
  page.drawSvgPath(`M 0,0 Q ${controlX - x1},${-(controlY - y1)} ${dx},${-dy}`, {
    x: x1,
    y: y1,
    borderColor: color,
    borderWidth: thickness,
  });
}

// A curved dotted path connecting a small handful of waypoints — the
// "journey line" motif, an upgrade of a straight dotted line.
export function drawJourneyDots(
  page: PDFPage,
  points: Array<{ x: number; y: number }>,
  color: RGB,
  dotSize = 1.6,
  seed = "journey",
) {
  if (points.length < 2) return;
  const random = seededRandom(seed);
  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index];
    const b = points[index + 1];
    const steps = Math.max(4, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / 10));
    const bow = (random() - 0.5) * 10;
    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps;
      const wave = Math.sin(t * Math.PI) * bow;
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t + wave;
      page.drawCircle({ x, y, size: dotSize, color });
    }
  }
}

// The one consistent "quest complete" mark used everywhere completion is
// shown — a stamped seal, not a generic checkbox.
export function drawStampCircle(
  page: PDFPage,
  fonts: { bold: PDFFont },
  cx: number,
  cy: number,
  radius: number,
  color: RGB,
  softColor: RGB,
  label: string,
) {
  page.drawCircle({ x: cx, y: cy, size: radius, color: softColor, borderColor: color, borderWidth: 1.6 });
  page.drawCircle({ x: cx, y: cy, size: radius - 6, borderColor: color, borderWidth: 0.8 });
  const safe = label.toUpperCase();
  const size = Math.max(6, Math.min(9, (radius * 1.6) / Math.max(6, safe.length)));
  const width = fonts.bold.widthOfTextAtSize(safe, size);
  page.drawText(safe, { x: cx - width / 2, y: cy - size / 2.6, size, font: fonts.bold, color });
}

// A notched/perforated edge along the bottom of a box — the "ticket stub"
// motif for card-like frames.
export function drawTicketEdge(page: PDFPage, box: Box, color: RGB, notchRadius = 4) {
  const count = Math.max(3, Math.round(box.width / 26));
  const gap = box.width / count;
  for (let index = 1; index < count; index += 1) {
    page.drawCircle({ x: box.x + index * gap, y: box.y, size: notchRadius, color: palette.paper, borderColor: color, borderWidth: 0.8 });
  }
}

// Light corner marks instead of a full rectangle border — for drawing
// spaces and memory-page cells that should feel open, not boxed-in.
export function drawScrapbookCorner(page: PDFPage, box: Box, color: RGB, armLength = 16) {
  const corners: Array<[number, number, number, number]> = [
    [box.x, box.y + box.height, 1, -1],
    [box.x + box.width, box.y + box.height, -1, -1],
    [box.x, box.y, 1, 1],
    [box.x + box.width, box.y, -1, 1],
  ];
  corners.forEach(([x, y, dx, dy]) => {
    page.drawLine({ start: { x, y }, end: { x: x + armLength * dx, y }, thickness: 1.4, color });
    page.drawLine({ start: { x, y }, end: { x, y: y + armLength * dy }, thickness: 1.4, color });
  });
}

// An irregular hand-drawn-ish ellipse for highlighting a detail —
// annotation/detective styling, never a perfect geometric oval.
export function drawAnnotationCircle(
  page: PDFPage,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  color: RGB,
  thickness = 1.4,
  seed = `${cx},${cy}`,
) {
  const random = seededRandom(seed);
  const points = 10;
  const coords: Array<[number, number]> = [];
  for (let index = 0; index <= points; index += 1) {
    const angle = (index / points) * Math.PI * 2;
    const jitter = 1 + (random() - 0.5) * 0.14;
    coords.push([Math.cos(angle) * rx * jitter, Math.sin(angle) * ry * jitter]);
  }
  const path = coords
    .map(([px, py], index) => `${index === 0 ? "M" : "L"} ${px},${-py}`)
    .join(" ");
  page.drawSvgPath(`${path} Z`, { x: cx, y: cy, borderColor: color, borderWidth: thickness });
}

// A small cluster of irregular tile fragments — the Barcelona/Gaudí-nod
// motif primitive. Not a specific real mosaic, an original abstraction:
// a handful of rotated, unevenly-sized polygons in the theme's palette.
export function drawMosaicFragment(page: PDFPage, box: Box, seed: string) {
  const random = seededRandom(seed);
  const colors = [palette.coral, palette.teal, palette.yellow, palette.green];
  const count = 6;
  for (let index = 0; index < count; index += 1) {
    const w = box.width * (0.18 + random() * 0.14);
    const h = box.height * (0.18 + random() * 0.14);
    const x = box.x + random() * (box.width - w);
    const y = box.y + random() * (box.height - h);
    const rotation = (random() - 0.5) * 26;
    const color = colors[index % colors.length];
    page.drawRectangle({
      x,
      y,
      width: w,
      height: h,
      color,
      opacity: 0.85,
      rotate: degrees(rotation),
    });
  }
}

// El Drac — the tiled salamander at Park Güell — translated into an
// original line-art mascot: a simple side-profile lizard sitting on a
// strip of mosaic tile, with a few mosaic-coloured spots along its own
// back as the one direct visual nod to the real fountain's ceramic skin.
// Not a copy of the artwork, an original character in the same spirit.
export function drawSalamander(page: PDFPage, box: Box, theme: DestinationTheme, seed: string) {
  const random = seededRandom(seed);
  const ink = palette.ink;
  const groundY = box.y + box.height * 0.16;
  const bodyCx = box.x + box.width * 0.54;
  const bodyCy = box.y + box.height * 0.46;
  const bodyRx = box.width * 0.29;
  const bodyRy = box.height * 0.15;

  // A strip of mosaic tile the creature sits on — ties the mascot back to
  // the destination's tile motif instead of floating in empty space.
  drawMosaicFragment(page, { x: box.x, y: box.y, width: box.width, height: box.height * 0.15 }, `${seed}-bench`);
  drawHandLine(page, box.x, groundY, box.x + box.width, groundY, palette.line, 1, `${seed}-ground`);

  // Tail: a two-segment curl back and down from the body.
  const tailStartX = bodyCx - bodyRx * 0.92;
  const tailStartY = bodyCy - bodyRy * 0.15;
  const tailMidX = tailStartX - bodyRx * 0.75;
  const tailMidY = groundY + (bodyCy - groundY) * 0.55;
  const tailTipX = box.x + box.width * 0.03;
  const tailTipY = groundY + box.height * 0.05;
  drawHandLine(page, tailStartX, tailStartY, tailMidX, tailMidY, ink, 2, `${seed}-tail1`);
  drawHandLine(page, tailMidX, tailMidY, tailTipX, tailTipY, ink, 1.6, `${seed}-tail2`);

  // Legs: two front, two back, each a short bowed line down to the ground.
  const legXs = [bodyCx + bodyRx * 0.4, bodyCx + bodyRx * 0.05, bodyCx - bodyRx * 0.3, bodyCx - bodyRx * 0.62];
  legXs.forEach((legX, index) => {
    const footX = legX + (random() - 0.5) * 6;
    drawHandLine(page, legX, bodyCy - bodyRy * 0.7, footX, groundY + 1, ink, 1.6, `${seed}-leg${index}`);
  });

  // Body + head.
  page.drawEllipse({ x: bodyCx, y: bodyCy, xScale: bodyRx, yScale: bodyRy, rotate: degrees(4), color: theme.accentSoft, borderColor: ink, borderWidth: 2 });
  const headCx = bodyCx + bodyRx * 0.92;
  const headCy = bodyCy + bodyRy * 0.3;
  const headR = box.height * 0.11;
  page.drawCircle({ x: headCx, y: headCy, size: headR, color: theme.accentSoft, borderColor: ink, borderWidth: 2 });
  page.drawCircle({ x: headCx + headR * 0.4, y: headCy + headR * 0.3, size: 1.6, color: ink });

  // Dorsal spikes: three small hand-drawn "^" marks along the spine.
  const bodyTopY = bodyCy + bodyRy * 0.95;
  [bodyCx - bodyRx * 0.35, bodyCx, bodyCx + bodyRx * 0.35].forEach((spikeX, index) => {
    drawHandLine(page, spikeX - 4, bodyTopY - 3, spikeX, bodyTopY + 7, ink, 1.4, `${seed}-spike${index}a`);
    drawHandLine(page, spikeX, bodyTopY + 7, spikeX + 4, bodyTopY - 3, ink, 1.4, `${seed}-spike${index}b`);
  });

  // Mosaic-coloured spots along the back — the one direct tile callback.
  const spotColors = [theme.accent, palette.teal, palette.yellow, palette.green];
  [0.15, 0.38, 0.6, 0.82].forEach((t, index) => {
    const spotX = bodyCx - bodyRx * 0.8 + bodyRx * 1.6 * t;
    const spotY = bodyCy + bodyRy * (0.35 + (random() - 0.5) * 0.2);
    page.drawCircle({ x: spotX, y: spotY, size: 2.8, color: spotColors[index % spotColors.length] });
  });
}

// One consistent small mark for destinations without a bespoke motif yet
// (see pdf-theme.ts's DestinationTheme.motif) — a simple compass/map-pin,
// so an untheme'd destination still looks intentional, not empty.
function drawCompassMark(page: PDFPage, box: Box, color: RGB) {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const r = Math.min(box.width, box.height) / 2;
  page.drawCircle({ x: cx, y: cy, size: r, borderColor: color, borderWidth: 1.6 });
  page.drawCircle({ x: cx, y: cy, size: 2.4, color });
  [0, 90, 180, 270].forEach((angle) => {
    const radians = (angle * Math.PI) / 180;
    const x2 = cx + Math.cos(radians) * (r - 4);
    const y2 = cy + Math.sin(radians) * (r - 4);
    page.drawLine({ start: { x: cx, y: cy }, end: { x: x2, y: y2 }, thickness: 1, color });
  });
}

export function drawDestinationMotif(page: PDFPage, box: Box, theme: DestinationTheme, seed: string) {
  if (theme.motif === "salamander") {
    drawSalamander(page, box, theme, seed);
    return;
  }
  if (theme.motif === "mosaic") {
    drawMosaicFragment(page, box, seed);
    return;
  }
  drawCompassMark(page, box, theme.accent);
}

// ---------------------------------------------------------------------
// "Japanese stationery" component vocabulary, second pass — the printable
// counterpart to app/components/doodles.tsx and the .jt-* classes in app/globals.css.
// pdf-lib has no native rounded-rectangle or shadow support, so
// drawRoundedRect below is the one new foundational primitive everything
// else here builds on (a hand-rolled rounded-corner SVG path); the rest —
// speech bubbles, illustrated checkboxes, confetti, small doodles — are
// built from it plus the existing drawCircle/drawSvgPath vocabulary above.
// ---------------------------------------------------------------------

// A true rounded rectangle (pdf-lib's drawRectangle has no radius option).
// Built the same way drawHandLine is: anchored at the box's own bottom-left
// corner, with every other point expressed as a page-space delta from that
// anchor and Y negated, since drawSvgPath's local coordinate system
// increases downward while the page's increases upward.
export function drawRoundedRect(
  page: PDFPage,
  box: Box,
  radius: number,
  options: { color?: RGB; borderColor?: RGB; borderWidth?: number; opacity?: number } = {},
) {
  const r = Math.max(0, Math.min(radius, box.width / 2, box.height / 2));
  const w = box.width;
  const h = box.height;
  const path = [
    `M ${r},0`,
    `L ${w - r},0`,
    `Q ${w},0 ${w},${-r}`,
    `L ${w},${-(h - r)}`,
    `Q ${w},${-h} ${w - r},${-h}`,
    `L ${r},${-h}`,
    `Q 0,${-h} 0,${-(h - r)}`,
    `L 0,${-r}`,
    `Q 0,0 ${r},0`,
    "Z",
  ].join(" ");
  page.drawSvgPath(path, {
    x: box.x,
    y: box.y,
    color: options.color,
    borderColor: options.borderColor,
    borderWidth: options.borderWidth,
    opacity: options.opacity,
  });
}

// A rounded card with a small triangular tail — for a chat prompt or an
// aside that reads as spoken/whispered rather than printed instruction.
export function drawSpeechBubble(
  page: PDFPage,
  box: Box,
  color: RGB,
  borderColor: RGB,
  tailOffset = box.width * 0.18,
) {
  drawRoundedRect(page, box, Math.min(14, box.height * 0.3), { color, borderColor, borderWidth: 1.4 });
  const tailWidth = 12;
  const tailHeight = 10;
  page.drawSvgPath(`M 0,0 L ${tailWidth},0 L 0,${tailHeight} Z`, {
    x: box.x + tailOffset,
    y: box.y,
    color,
    borderColor,
    borderWidth: 1.4,
  });
  // Redraw the seam where the tail meets the card so the border reads as
  // one continuous outline rather than two overlapping shapes.
  page.drawLine({ start: { x: box.x + tailOffset, y: box.y }, end: { x: box.x + tailOffset + tailWidth, y: box.y }, thickness: 1.4, color });
}

// A small rounded checkbox with a tiny accent dot in the corner — an
// "illustrated" checkbox rather than a plain hollow square, for
// scavenger-hunt/checklist rows. Deliberately not pre-checked: a printed
// booklet's checkbox is filled in by the child, not by the page.
export function drawIllustratedCheckbox(page: PDFPage, x: number, y: number, size: number, color: RGB) {
  drawRoundedRect(page, { x, y, width: size, height: size }, size * 0.32, { color: palette.white, borderColor: color, borderWidth: 1.6 });
  page.drawCircle({ x: x + size * 0.8, y: y + size * 0.8, size: size * 0.1, color });
}

// A small scattered burst of confetti — a celebration accent for
// completion moments (the certificate, a quest-complete stamp), not a
// full-page effect. Seeded so the same booklet re-renders identically.
export function drawConfettiBurst(page: PDFPage, cx: number, cy: number, radius: number, colors: RGB[], seed: string) {
  const random = seededRandom(seed);
  const count = 12;
  for (let index = 0; index < count; index += 1) {
    const angle = random() * Math.PI * 2;
    const distance = radius * (0.45 + random() * 0.6);
    const x = cx + Math.cos(angle) * distance;
    const y = cy + Math.sin(angle) * distance;
    const color = colors[index % colors.length];
    if (index % 3 === 0) {
      page.drawRectangle({ x: x - 2, y: y - 1.2, width: 4, height: 2.4, color, rotate: degrees(random() * 360) });
    } else {
      page.drawCircle({ x, y, size: 1.3 + random() * 1.1, color });
    }
  }
}

// A five-point star outline — a slightly hand-drawn doodle mark, the
// printable counterpart to app/components/doodles.tsx's DoodleStar.
export function drawDoodleStar(page: PDFPage, cx: number, cy: number, radius: number, color: RGB, thickness = 1.4) {
  const points = 5;
  const coords: Array<[number, number]> = [];
  for (let index = 0; index < points * 2; index += 1) {
    const angle = (Math.PI / points) * index - Math.PI / 2;
    const pointRadius = index % 2 === 0 ? radius : radius * 0.42;
    coords.push([Math.cos(angle) * pointRadius, Math.sin(angle) * pointRadius]);
  }
  const path = coords.map(([px, py], index) => `${index === 0 ? "M" : "L"} ${px},${-py}`).join(" ");
  page.drawSvgPath(`${path} Z`, { x: cx, y: cy, borderColor: color, borderWidth: thickness });
}

// A small four-point sparkle — filled, not outlined, for a lighter touch
// than drawDoodleStar (a corner accent, not a badge-sized mark).
export function drawDoodleSparkle(page: PDFPage, cx: number, cy: number, radius: number, color: RGB) {
  const inner = radius * 0.22;
  const path = [
    `M 0,${-radius}`,
    `L ${inner},${-inner}`,
    `L ${radius},0`,
    `L ${inner},${inner}`,
    `L 0,${radius}`,
    `L ${-inner},${inner}`,
    `L ${-radius},0`,
    `L ${-inner},${-inner}`,
    "Z",
  ].join(" ");
  page.drawSvgPath(path, { x: cx, y: cy, color });
}

// A soft three-lobe cloud, built from overlapping filled circles rather
// than an outline (keeps it a simple flat sticker shape, no path arcs).
export function drawDoodleCloud(page: PDFPage, box: Box, color: RGB) {
  const baseY = box.y + box.height * 0.35;
  page.drawCircle({ x: box.x + box.width * 0.28, y: baseY, size: box.height * 0.34, color });
  page.drawCircle({ x: box.x + box.width * 0.55, y: baseY + box.height * 0.14, size: box.height * 0.46, color });
  page.drawCircle({ x: box.x + box.width * 0.8, y: baseY, size: box.height * 0.3, color });
  page.drawRectangle({ x: box.x + box.width * 0.28, y: box.y, width: box.width * 0.52, height: box.height * 0.35, color });
}
