import type { Activity, DayPlan, DifferencePictures, DifferenceRegion } from "../booklet/booklet.ts";
import {
  generateIllustrationPng,
  resolveImageProvider,
  type IllustrationRuntime,
} from "./illustration-ai.ts";
import {
  decodeImage,
  dilate,
  doodleKinds,
  drawDoodle,
  dropSpeckles,
  encodePng,
  inkMask,
  squareGrey,
  type Grey,
} from "./raster.ts";

// Spot-the-difference pictures. Picture A is a generated line-art scene;
// picture B is A plus exactly three small changes, each in one of the
// emptiest regions of A. An image-editing model draws each change; only the
// strokes it added are copied into B, so everything else in B is A pixel
// for pixel. Any region the model could not change cleanly gets a drawn
// doodle instead, so every game always has exactly three differences.

const VERSION = "spot-v1";
const SIZE = 512;
const GRID = 5;
const MAX_GAMES = 2;
const DEFAULT_EDIT_MODEL = "@cf/black-forest-labs/flux-2-klein-9b";
// Tuned on real FLUX.2 output at 512 px (artifacts/qa/spot-spike2 at 2x).
const A_INK = 150;
const B_INK = 110;
const NEAR_EXISTING_INK = 2;
const MIN_NEW_INK = 90;

export type SpotRuntime = IllustrationRuntime & { CLOUDFLARE_AI_EDIT_MODEL?: string };
export type SpotSlot = "inThePlace" | "inThePlaceSecond" | "sitDown";
export type SpotAssignment = { dayIndex: number; slot: SpotSlot; differencePaths: DifferencePictures };
export type Cell = { col: number; row: number; ink: number };
type EditFn = (prompt: string) => Promise<Uint8Array | null>;

const objectsByBand = {
  top: [
    { prompt: "a small bird flying", label: "a bird" },
    { prompt: "a small round cloud", label: "a cloud" },
    { prompt: "a small kite on a string", label: "a kite" },
    { prompt: "a small hot-air balloon", label: "a hot-air balloon" },
  ],
  middle: [
    { prompt: "a small butterfly", label: "a butterfly" },
    { prompt: "a small flag on a short pole", label: "a flag" },
    { prompt: "a small round lantern", label: "a lantern" },
    { prompt: "a small bird sitting", label: "a bird" },
  ],
  bottom: [
    { prompt: "a small potted flower", label: "a flower pot" },
    { prompt: "a small ball", label: "a ball" },
    { prompt: "a small bucket", label: "a bucket" },
    { prompt: "a small sleeping cat", label: "a cat" },
  ],
};

const encoder = new TextEncoder();
async function digest(value: string) {
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function seededIndex(seed: string, modulo: number) {
  let hash = 17;
  for (const character of seed) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return hash % modulo;
}

function band(cell: Cell) {
  return cell.row === 0 ? "top" : cell.row === GRID - 1 ? "bottom" : "middle";
}

function placeWords(cell: Cell) {
  const vertical = cell.row === 0 ? "top" : cell.row === GRID - 1 ? "bottom" : cell.row < GRID / 2 ? "upper" : "lower";
  const horizontal = cell.col === 0 ? "left" : cell.col === GRID - 1 ? "right" : cell.col < GRID / 2 ? "left-centre" : "right-centre";
  return `${vertical} ${horizontal}`;
}

// The three emptiest cells of a 5x5 grid, outside the centre (where the
// subject is) and never next to each other.
export function chooseRegions(a: Grey): Cell[] {
  const cellSize = a.width / GRID;
  const cells: Cell[] = [];
  for (let row = 0; row < GRID; row += 1) {
    for (let col = 0; col < GRID; col += 1) {
      if (row > 0 && row < GRID - 1 && col > 0 && col < GRID - 1) continue;
      let ink = 0;
      for (let y = Math.floor(row * cellSize); y < Math.floor((row + 1) * cellSize); y += 1) {
        for (let x = Math.floor(col * cellSize); x < Math.floor((col + 1) * cellSize); x += 1) {
          if (a.data[y * a.width + x] < A_INK) ink += 1;
        }
      }
      cells.push({ col, row, ink: ink / (cellSize * cellSize) });
    }
  }
  const chosen: Cell[] = [];
  for (const cell of cells.sort((first, second) => first.ink - second.ink || first.row - second.row || first.col - second.col)) {
    if (chosen.some((other) => Math.abs(other.col - cell.col) <= 1 && Math.abs(other.row - cell.row) <= 1)) continue;
    chosen.push(cell);
    if (chosen.length === 3) break;
  }
  return chosen;
}

function cellBounds(cell: Cell, size: number) {
  const cellSize = size / GRID;
  const margin = cellSize * 0.2;
  return {
    x0: Math.max(0, cell.col * cellSize - margin),
    y0: Math.max(0, cell.row * cellSize - margin),
    x1: Math.min(size, (cell.col + 1) * cellSize + margin),
    y1: Math.min(size, (cell.row + 1) * cellSize + margin),
  };
}

// Strokes that are dark in B but have no ink anywhere near them in A,
// limited to one cell: what the edit added there, and nothing else.
export function newInkInCell(a: Grey, b: Grey, cell: Cell) {
  const size = a.width;
  const nearA = dilate(inkMask(a, A_INK), size, size, NEAR_EXISTING_INK);
  const bounds = cellBounds(cell, size);
  const mask = new Uint8Array(a.data.length);
  for (let y = Math.floor(bounds.y0); y < Math.ceil(bounds.y1); y += 1) {
    for (let x = Math.floor(bounds.x0); x < Math.ceil(bounds.x1); x += 1) {
      const index = y * size + x;
      if (b.data[index] < B_INK && !nearA[index]) mask[index] = 1;
    }
  }
  dropSpeckles(mask, size, 12);
  let count = 0;
  let minX = size;
  let minY = size;
  let maxX = 0;
  let maxY = 0;
  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index]) continue;
    count += 1;
    const x = index % size;
    const y = Math.floor(index / size);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { mask, count, box: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 } };
}

function regionFromBox(box: { x: number; y: number; w: number; h: number }, size: number, label: string): DifferenceRegion {
  const pad = size * 0.03;
  const x = Math.max(0, box.x - pad);
  const y = Math.max(0, box.y - pad);
  const round = (value: number) => Math.round(value * 1000) / 1000;
  return {
    x: round(x / size),
    y: round(y / size),
    w: round(Math.min(size - x, box.w + pad * 2) / size),
    h: round(Math.min(size - y, box.h + pad * 2) / size),
    label,
  };
}

function editPrompt(object: string, cell: Cell) {
  return [
    "Edit this black-and-white coloring-book line drawing. Keep the exact same drawing, composition, line style and every existing object unchanged.",
    `Add one new object: ${object}, drawn in the ${placeWords(cell)} area of the picture, fully inside the picture and not touching its edge, in empty space where it does not overlap other lines.`,
    "Clean dark outlines on white paper, no shading, no color, no text.",
  ].join(" ");
}

// Builds picture B from picture A. `edit` returns an edited image (or null
// on failure); regions it cannot change cleanly after two tries get a doodle.
export async function buildDifferencePicture(a: Grey, edit: EditFn | null, seed: string) {
  const size = a.width;
  const cells = chooseRegions(a);
  const b: Grey = { width: size, height: size, data: Uint8Array.from(a.data) };
  const outcomes = await Promise.all(cells.map(async (cell, index) => {
    const options = objectsByBand[band(cell)];
    const start = seededIndex(`${seed}|${index}`, options.length);
    if (edit) {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const object = options[(start + attempt) % options.length];
        try {
          const bytes = await edit(editPrompt(object.prompt, cell));
          if (!bytes) continue;
          const edited = squareGrey(decodeImage(bytes), size);
          const added = newInkInCell(a, edited, cell);
          if (added.count >= MIN_NEW_INK) return { cell, kind: "edit" as const, edited, added, label: object.label };
        } catch (error) {
          console.error("[TripQuest spot-the-difference] edit", error);
        }
      }
    }
    return { cell, kind: "doodle" as const };
  }));

  const regions: DifferenceRegion[] = [];
  // Doodles never repeat within one picture.
  let doodles = 0;
  for (const outcome of outcomes) {
    if (outcome.kind === "edit") {
      const paste = dilate(outcome.added.mask, size, size, 1);
      for (let index = 0; index < paste.length; index += 1) {
        if (paste[index]) b.data[index] = Math.min(b.data[index], outcome.edited.data[index] < 235 ? outcome.edited.data[index] : 255);
      }
      regions.push(regionFromBox(outcome.added.box, size, outcome.label));
    } else {
      const cellSize = size / GRID;
      const doodle = doodleKinds[(seededIndex(seed, doodleKinds.length) + doodles) % doodleKinds.length];
      doodles += 1;
      const radius = cellSize * 0.3;
      drawDoodle(b, doodle, (outcome.cell.col + 0.5) * cellSize, (outcome.cell.row + 0.5) * cellSize, radius);
      const box = { x: (outcome.cell.col + 0.5) * cellSize - radius * 1.12, y: (outcome.cell.row + 0.5) * cellSize - radius * 1.12, w: radius * 2.24, h: radius * 2.24 };
      regions.push(regionFromBox(box, size, `a ${doodle}`));
    }
  }
  return { b, regions, edited: outcomes.filter((outcome) => outcome.kind === "edit").length };
}

function spotPicturePrompt(destination: string, day: DayPlan, activity: Activity) {
  return [
    "Create a black-and-white coloring-book line drawing for a children's spot-the-difference puzzle.",
    `The exact place is ${day.landmark?.place || day.theme}, in ${destination}. The puzzle is called ${activity.title}.`,
    "The real landmark or local subject must be recognizable. Square composition with the subject in the middle.",
    "Leave open, empty sky across the top and open, empty ground along the bottom, and keep all four corners empty.",
    "Clean dark outlines on pure white paper, medium detail, no shading, no filled areas, no gray, no text, no frame.",
  ].join(" ");
}

function cloudflareEdit(runtime: SpotRuntime, a: Uint8Array): EditFn | null {
  const accountId = runtime.CLOUDFLARE_ACCOUNT_ID?.trim();
  const apiToken = runtime.CLOUDFLARE_API_TOKEN?.trim();
  if (!accountId || !apiToken) return null;
  const model = runtime.CLOUDFLARE_AI_EDIT_MODEL?.trim() || DEFAULT_EDIT_MODEL;
  return async (prompt) => {
    const form = new FormData();
    form.append("prompt", prompt);
    form.append("input_image_0", new Blob([a as Uint8Array<ArrayBuffer>], { type: "image/png" }), "picture-a.png");
    form.append("width", String(SIZE));
    form.append("height", String(SIZE));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
    try {
      const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiToken}` },
        body: form,
        signal: controller.signal,
      });
      if (!response.ok) {
        // A 400 here is usually the provider's content filter misfiring on
        // a landmark; the doodle fallback covers it.
        console.info(`[TripQuest spot-the-difference] edit returned ${response.status}`);
        return null;
      }
      const body = await response.json() as { result?: { image?: string } };
      if (!body.result?.image) return null;
      const decoded = atob(body.result.image);
      return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
    } finally {
      clearTimeout(timeout);
    }
  };
}

type Candidate = { dayIndex: number; slot: SpotSlot; day: DayPlan; activity: Activity };

function spotCandidates(dayPlans: DayPlan[]): Candidate[] {
  return dayPlans.flatMap((day, dayIndex) =>
    (["inThePlace", "inThePlaceSecond", "sitDown"] as const).flatMap((slot) => {
      const activity = day.slots?.[slot];
      return activity?.gameType === "spot_the_difference" ? [{ dayIndex, slot, day, activity }] : [];
    }),
  ).slice(0, MAX_GAMES);
}

const illustrationPath = (key: string) => `/api/illustration?key=${encodeURIComponent(key)}`;

async function pictureFor(runtime: SpotRuntime, destination: string, candidate: Candidate): Promise<DifferencePictures | null> {
  const storage = runtime.BOOKLET_FILES;
  const provider = resolveImageProvider(runtime);
  if (!storage || !provider) return null;
  const identity = JSON.stringify({
    version: VERSION,
    destination: destination.toLocaleLowerCase(),
    landmark: candidate.day.landmark?.place,
    title: candidate.activity.title,
    items: candidate.activity.items,
  });
  const keyA = `illustrations/v2/${await digest(`${identity}|a`)}/artwork.png`;
  const keyB = `illustrations/v2/${await digest(`${identity}|b`)}/artwork.png`;

  try {
    const [cachedA, cachedB] = await Promise.all([storage.get(keyA), storage.get(keyB)]);
    const cachedRegions = cachedB?.customMetadata?.regions;
    if (cachedA && cachedRegions) {
      const regions = JSON.parse(cachedRegions) as DifferenceRegion[];
      if (Array.isArray(regions) && regions.length === 3) return { a: illustrationPath(keyA), b: illustrationPath(keyB), regions };
    }
  } catch (error) {
    console.error("[TripQuest spot-the-difference cache]", error);
  }

  const source = await generateIllustrationPng(provider, spotPicturePrompt(destination, candidate.day, candidate.activity), "1024x1024");
  const a = squareGrey(decodeImage(source), SIZE);
  const aPng = encodePng(a);
  const { b, regions, edited } = await buildDifferencePicture(a, cloudflareEdit(runtime, aPng), identity);
  const metadata = { cacheControl: "public, max-age=31536000, immutable", contentType: "image/png" };
  await storage.put(keyA, aPng, { httpMetadata: metadata, customMetadata: { destination, title: `${candidate.activity.title} (A)` } });
  await storage.put(keyB, encodePng(b), {
    httpMetadata: metadata,
    customMetadata: { destination, title: `${candidate.activity.title} (B)`, regions: JSON.stringify(regions), edited: String(edited) },
  });
  return { a: illustrationPath(keyA), b: illustrationPath(keyB), regions };
}

// Makes the picture pair for up to two spot-the-difference games. Games
// without pictures stay playable as look-and-find, so failures only log.
export async function addSpotTheDifference(
  runtime: SpotRuntime,
  input: { destination: string; dayPlans: DayPlan[] },
  publish?: (message: string) => void,
): Promise<SpotAssignment[]> {
  const candidates = spotCandidates(input.dayPlans);
  if (!candidates.length || !runtime.BOOKLET_FILES || !resolveImageProvider(runtime)) return [];
  publish?.(`Drawing ${candidates.length === 1 ? "a spot-the-difference puzzle" : "spot-the-difference puzzles"}…`);
  const results = await Promise.all(candidates.map(async (candidate) => {
    try {
      const differencePaths = await pictureFor(runtime, input.destination, candidate);
      return differencePaths ? { dayIndex: candidate.dayIndex, slot: candidate.slot, differencePaths } : null;
    } catch (error) {
      console.error(`[TripQuest spot-the-difference] ${candidate.activity.title}`, error);
      return null;
    }
  }));
  return results.filter((result): result is SpotAssignment => Boolean(result));
}

export function applyDifferencePaths(dayPlans: DayPlan[], assignments: SpotAssignment[]): DayPlan[] {
  if (!assignments.length) return dayPlans;
  return dayPlans.map((day, dayIndex) => {
    const mine = assignments.filter((assignment) => assignment.dayIndex === dayIndex);
    if (!mine.length) return day;
    const slots = { ...day.slots };
    for (const assignment of mine) {
      const activity = slots[assignment.slot];
      if (activity) slots[assignment.slot] = { ...activity, differencePaths: assignment.differencePaths };
    }
    return { ...day, slots, activities: [slots.inThePlace, slots.sitDown] };
  });
}
