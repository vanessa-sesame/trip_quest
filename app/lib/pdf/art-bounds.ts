import { decodeImage } from "../generation/raster.ts";

// Where the picture actually is inside an illustration. Image models paint
// a subject on a plain paper or white background and often leave a wide
// empty band around it; the cover frames the picture at this box so the
// frame hugs the art instead of a lot of blank paper. Only plain
// background outside the box is ever left out, never part of the art.

// Fractions of the image, origin top-left.
export type ArtBounds = { x: number; y: number; width: number; height: number };

const BACKGROUND_TOLERANCE = 22;

export function artContentBounds(bytes: Uint8Array): ArtBounds | undefined {
  let image: ReturnType<typeof decodeImage>;
  try {
    image = decodeImage(bytes);
  } catch {
    return undefined;
  }
  const { width, height, data } = image;
  if (width < 16 || height < 16) return undefined;
  // The background is the corners' shared tone; corners that disagree mean
  // the art runs to the edges, so there is nothing to trim.
  const corners = [data[0], data[width - 1], data[(height - 1) * width], data[height * width - 1]].sort((a, b) => a - b);
  if (corners[3] - corners[0] > 30) return undefined;
  const background = (corners[1] + corners[2]) / 2;
  const step = Math.max(1, Math.floor(Math.min(width, height) / 300));
  const rows = new Uint16Array(height);
  const columns = new Uint16Array(width);
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      if (Math.abs(data[y * width + x] - background) > BACKGROUND_TOLERANCE) {
        rows[y] += 1;
        columns[x] += 1;
      }
    }
  }
  // A row or column counts as art once two samples in it differ from the
  // paper, so single noisy pixels never stretch the box.
  const first = (counts: Uint16Array) => counts.findIndex((count) => count >= 2);
  const last = (counts: Uint16Array) => counts.length - 1 - Array.from(counts).reverse().findIndex((count) => count >= 2);
  const top = first(rows);
  const left = first(columns);
  if (top < 0 || left < 0) return undefined;
  const bottom = last(rows);
  const right = last(columns);
  // A little paper around the art, so nothing touches the frame.
  const margin = Math.round(Math.min(width, height) * 0.025);
  const x0 = Math.max(0, left - margin);
  const y0 = Math.max(0, top - margin);
  const x1 = Math.min(width, right + step + margin);
  const y1 = Math.min(height, bottom + step + margin);
  const bounds = { x: x0 / width, y: y0 / height, width: (x1 - x0) / width, height: (y1 - y0) / height };
  // Not worth trimming a picture that already fills its canvas.
  return bounds.width * bounds.height > 0.9 ? undefined : bounds;
}
