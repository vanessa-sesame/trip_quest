import UPNGModule from "@pdf-lib/upng";
import jpeg from "jpeg-js";

// Minimal greyscale raster tools for spot-the-difference, in pure JS so
// they run inside the Worker (no canvas, no native image library).

// The CommonJS build exposes the API on `default`; the ESM build is the API.
const UPNG = (UPNGModule as unknown as { default?: typeof UPNGModule }).default ?? UPNGModule;

export type Grey = { width: number; height: number; data: Uint8Array };

function toArrayBuffer(bytes: Uint8Array) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

// RGBA to grey, flattening transparency onto white paper.
function rgbaToGrey(rgba: Uint8Array, width: number, height: number): Grey {
  const data = new Uint8Array(width * height);
  for (let i = 0; i < data.length; i += 1) {
    const r = rgba[i * 4];
    const g = rgba[i * 4 + 1];
    const b = rgba[i * 4 + 2];
    const alpha = rgba[i * 4 + 3] / 255;
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    data[i] = Math.round(luma * alpha + 255 * (1 - alpha));
  }
  return { width, height, data };
}

export function decodeImage(bytes: Uint8Array): Grey {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    const image = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true, maxResolutionInMP: 16 });
    return rgbaToGrey(image.data, image.width, image.height);
  }
  const image = UPNG.decode(toArrayBuffer(bytes));
  return rgbaToGrey(new Uint8Array(UPNG.toRGBA8(image)[0]), image.width, image.height);
}

export function encodePng(image: Grey) {
  // UPNG.encode with 0 colours is lossless and picks the smallest PNG
  // colour type itself (grey here). Its encodeLL shortcut is broken in the
  // @pdf-lib fork (it references an undefined UZIP), so avoid it.
  const rgba = new Uint8Array(image.data.length * 4);
  for (let i = 0; i < image.data.length; i += 1) {
    rgba[i * 4] = image.data[i];
    rgba[i * 4 + 1] = image.data[i];
    rgba[i * 4 + 2] = image.data[i];
    rgba[i * 4 + 3] = 255;
  }
  return new Uint8Array(UPNG.encode([rgba.buffer], image.width, image.height, 0));
}

// Box-filtered resize into a size x size square, contain-fit on white.
export function squareGrey(image: Grey, size: number): Grey {
  const out = new Uint8Array(size * size).fill(255);
  const scale = Math.max(image.width, image.height) / size;
  const drawnWidth = Math.round(image.width / scale);
  const drawnHeight = Math.round(image.height / scale);
  const offsetX = Math.floor((size - drawnWidth) / 2);
  const offsetY = Math.floor((size - drawnHeight) / 2);
  for (let y = 0; y < drawnHeight; y += 1) {
    const y0 = Math.floor(y * scale);
    const y1 = Math.max(y0 + 1, Math.min(image.height, Math.floor((y + 1) * scale)));
    for (let x = 0; x < drawnWidth; x += 1) {
      const x0 = Math.floor(x * scale);
      const x1 = Math.max(x0 + 1, Math.min(image.width, Math.floor((x + 1) * scale)));
      let sum = 0;
      for (let sy = y0; sy < y1; sy += 1) for (let sx = x0; sx < x1; sx += 1) sum += image.data[sy * image.width + sx];
      out[(y + offsetY) * size + x + offsetX] = Math.round(sum / ((y1 - y0) * (x1 - x0)));
    }
  }
  return { width: size, height: size, data: out };
}

export function inkMask(image: Grey, threshold: number) {
  const mask = new Uint8Array(image.data.length);
  for (let i = 0; i < mask.length; i += 1) mask[i] = image.data[i] < threshold ? 1 : 0;
  return mask;
}

// Square dilation, done as two separable passes.
export function dilate(mask: Uint8Array, width: number, height: number, radius: number) {
  const across = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    let last = -Infinity;
    for (let x = 0; x < width; x += 1) {
      if (mask[y * width + x]) last = x;
      if (x - last <= radius) across[y * width + x] = 1;
    }
    last = Infinity;
    for (let x = width - 1; x >= 0; x -= 1) {
      if (mask[y * width + x]) last = x;
      if (last - x <= radius) across[y * width + x] = 1;
    }
  }
  const out = new Uint8Array(mask.length);
  for (let x = 0; x < width; x += 1) {
    let last = -Infinity;
    for (let y = 0; y < height; y += 1) {
      if (across[y * width + x]) last = y;
      if (y - last <= radius) out[y * width + x] = 1;
    }
    last = Infinity;
    for (let y = height - 1; y >= 0; y -= 1) {
      if (across[y * width + x]) last = y;
      if (last - y <= radius) out[y * width + x] = 1;
    }
  }
  return out;
}

// Clears connected blobs smaller than `minimum` pixels (redraw speckle).
export function dropSpeckles(mask: Uint8Array, width: number, minimum: number) {
  const seen = new Uint8Array(mask.length);
  const stack: number[] = [];
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || seen[start]) continue;
    const blob: number[] = [];
    stack.push(start);
    seen[start] = 1;
    while (stack.length) {
      const p = stack.pop()!;
      blob.push(p);
      const x = p % width;
      const neighbours = [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, p - width, p + width];
      for (const q of neighbours) {
        if (q < 0 || q >= mask.length || seen[q] || !mask[q]) continue;
        seen[q] = 1;
        stack.push(q);
      }
    }
    if (blob.length < minimum) for (const p of blob) mask[p] = 0;
  }
}

// ---------------------------------------------------------------------------
// Doodles: deterministic line drawings stamped into a picture when the image
// model could not add a clean object there.
// ---------------------------------------------------------------------------

function stampDisc(image: Grey, cx: number, cy: number, radius: number, ink: number) {
  for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y += 1) {
    for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x += 1) {
      if (x < 0 || y < 0 || x >= image.width || y >= image.height) continue;
      if ((x - cx) ** 2 + (y - cy) ** 2 <= radius * radius) {
        const index = y * image.width + x;
        image.data[index] = Math.min(image.data[index], ink);
      }
    }
  }
}

function clearDisc(image: Grey, cx: number, cy: number, radius: number) {
  for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y += 1) {
    for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x += 1) {
      if (x < 0 || y < 0 || x >= image.width || y >= image.height) continue;
      if ((x - cx) ** 2 + (y - cy) ** 2 <= radius * radius) image.data[y * image.width + x] = 255;
    }
  }
}

function strokeLine(image: Grey, x0: number, y0: number, x1: number, y1: number, width: number) {
  const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2));
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    stampDisc(image, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, width / 2, 40);
  }
}

function strokePath(image: Grey, points: Array<[number, number]>, width: number, closed = false) {
  for (let index = 0; index < points.length - 1; index += 1) {
    strokeLine(image, ...points[index], ...points[index + 1], width);
  }
  if (closed && points.length > 2) strokeLine(image, ...points[points.length - 1], ...points[0], width);
}

function circlePoints(cx: number, cy: number, radius: number, count = 48): Array<[number, number]> {
  return Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2;
    return [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius];
  });
}

export const doodleKinds = ["star", "balloon", "sun"] as const;
export type DoodleKind = (typeof doodleKinds)[number];

// Draws a doodle centred at (cx, cy) with the given radius; returns its
// bounding box in pixels.
export function drawDoodle(image: Grey, kind: DoodleKind, cx: number, cy: number, radius: number) {
  const line = Math.max(2, radius * 0.09);
  // Clear a white backing first, so the doodle reads as clearly in a busy
  // corner of the picture as in an empty one.
  clearDisc(image, cx, cy, radius * 1.12);
  if (kind === "star") {
    const points: Array<[number, number]> = Array.from({ length: 10 }, (_, index) => {
      const angle = (Math.PI / 5) * index - Math.PI / 2;
      const r = index % 2 === 0 ? radius : radius * 0.45;
      return [cx + Math.cos(angle) * r, cy + Math.sin(angle) * r];
    });
    strokePath(image, points, line, true);
    return { x: cx - radius, y: cy - radius, w: radius * 2, h: radius * 2 };
  }
  if (kind === "balloon") {
    const r = radius * 0.62;
    const top = cy - radius * 0.35;
    strokePath(image, circlePoints(cx, top, r), line, true);
    strokePath(image, [[cx - r * 0.18, top + r + r * 0.18], [cx, top + r], [cx + r * 0.18, top + r + r * 0.18]], line, true);
    strokePath(image, [[cx, top + r + r * 0.18], [cx - radius * 0.12, cy + radius * 0.6], [cx + radius * 0.08, cy + radius]], line);
    return { x: cx - r, y: top - r, w: r * 2, h: cy + radius - (top - r) };
  }
  const r = radius * 0.48;
  strokePath(image, circlePoints(cx, cy, r), line, true);
  for (let ray = 0; ray < 8; ray += 1) {
    const angle = (ray / 8) * Math.PI * 2;
    strokeLine(image, cx + Math.cos(angle) * r * 1.3, cy + Math.sin(angle) * r * 1.3, cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius, line);
  }
  return { x: cx - radius, y: cy - radius, w: radius * 2, h: radius * 2 };
}
