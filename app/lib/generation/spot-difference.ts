import type { Activity, DayPlan, DifferencePictures, DifferenceRegion } from "../booklet/booklet.ts";
import { canGenerateImageExtras, canReadCachedImages } from "./cost-controls.ts";
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
// klein-4b bills per 512 px tile (about 31 neurons per edit at 512 px);
// klein-9b bills a full megapixel minimum (about 1,400), roughly 45x more.
// Only the new strokes are kept, so 4b's extra line drift costs nothing.
const DEFAULT_EDIT_MODEL = "@cf/black-forest-labs/flux-2-klein-4b";
// Tuned on real FLUX.2 output at 512 px (artifacts/qa/spot-spike2 at 2x).
const A_INK = 150;
const B_INK = 110;
const B_EDGE = 200;
const NEAR_EXISTING_INK = 2;
const MIN_NEW_INK = 90;
// Time limits, so picture pairs never become the slowest part of a booklet.
const PICTURE_TIMEOUT_MS = 30_000;
const EDIT_TIMEOUT_MS = 20_000;
const EDIT_BUDGET_MS = 30_000;

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
    // Spread the three changes out: at most two share a row.
    if (chosen.filter((other) => other.row === cell.row).length >= 2) continue;
    chosen.push(cell);
    if (chosen.length === 3) break;
  }
  return chosen;
}

// Strokes that are dark in B but have no ink anywhere near them in A: what
// the edit added. Dark cores seed each stroke and grow into its lighter,
// anti-aliased edges, so thin lines stay whole. A stroke counts for a cell
// when it touches the cell, and it is kept whole (never cropped), unless it
// reaches into the picture's centre, where the subject is.
export function newInkInCell(a: Grey, b: Grey, cell: Cell) {
  const size = a.width;
  const cellSize = size / GRID;
  const nearA = dilate(inkMask(a, A_INK), size, size, NEAR_EXISTING_INK);
  const candidate = new Uint8Array(a.data.length);
  for (let index = 0; index < candidate.length; index += 1) {
    if (!nearA[index] && b.data[index] < B_EDGE) candidate[index] = b.data[index] < B_INK ? 2 : 1;
  }
  const mask = new Uint8Array(a.data.length);
  const seen = new Uint8Array(a.data.length);
  const inCell = (x: number, y: number) =>
    x >= cell.col * cellSize && x < (cell.col + 1) * cellSize && y >= cell.row * cellSize && y < (cell.row + 1) * cellSize;
  const inCentre = (x: number, y: number) =>
    x >= cellSize * 1.5 && x < cellSize * 3.5 && y >= cellSize * 1.5 && y < cellSize * 3.5;
  const stack: number[] = [];
  for (let start = 0; start < candidate.length; start += 1) {
    if (candidate[start] !== 2 || seen[start]) continue;
    const blob: number[] = [];
    let touchesCell = false;
    let touchesCentre = false;
    let cores = 0;
    let minBlobX = size;
    let minBlobY = size;
    let maxBlobX = 0;
    let maxBlobY = 0;
    stack.push(start);
    seen[start] = 1;
    while (stack.length) {
      const p = stack.pop()!;
      blob.push(p);
      const x = p % size;
      const y = Math.floor(p / size);
      if (candidate[p] === 2) cores += 1;
      minBlobX = Math.min(minBlobX, x);
      maxBlobX = Math.max(maxBlobX, x);
      minBlobY = Math.min(minBlobY, y);
      maxBlobY = Math.max(maxBlobY, y);
      if (inCell(x, y)) touchesCell = true;
      if (inCentre(x, y)) touchesCentre = true;
      const neighbours = [x > 0 ? p - 1 : -1, x < size - 1 ? p + 1 : -1, p - size, p + size];
      for (const q of neighbours) {
        if (q < 0 || q >= candidate.length || seen[q] || !candidate[q]) continue;
        seen[q] = 1;
        stack.push(q);
      }
    }
    // A real added object fits in about two cells; anything longer is a
    // redrawn line (a horizon, a frame) that merely moved.
    const compact = maxBlobX - minBlobX <= cellSize * 2 && maxBlobY - minBlobY <= cellSize * 2;
    if (touchesCell && !touchesCentre && compact && cores >= 12) for (const p of blob) mask[p] = 1;
  }
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
// Retries stop at `deadline` so a slow provider cannot hold up the booklet;
// regions still unchanged by then get doodles.
export async function buildDifferencePicture(a: Grey, edit: EditFn | null, seed: string, deadline = Date.now() + EDIT_BUDGET_MS) {
  const size = a.width;
  const cells = chooseRegions(a);
  const b: Grey = { width: size, height: size, data: Uint8Array.from(a.data) };
  // Each region gets its own two objects to try (first choice, retry), never
  // shared with another region, so no picture has two of the same change.
  const taken = new Set<string>();
  const plans = cells.map((cell, index) => {
    const options = objectsByBand[band(cell)];
    const start = seededIndex(`${seed}|${index}`, options.length);
    const picks = options
      .map((_, offset) => options[(start + offset) % options.length])
      .filter((object) => !taken.has(object.label))
      .slice(0, 2);
    picks.forEach((object) => taken.add(object.label));
    return { cell, picks };
  });
  const outcomes = await Promise.all(plans.map(async ({ cell, picks }) => {
    if (edit) {
      for (const [attempt, object] of picks.entries()) {
        if (attempt > 0 && Date.now() > deadline) break;
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
  // Doodles never repeat each other or echo an edited object's name
  // ("a balloon" next to "a hot-air balloon" would confuse the answer key).
  const editedLabels = outcomes.flatMap((outcome) => (outcome.kind === "edit" ? [outcome.label] : []));
  const doodleOrder = [0, 1, 2]
    .map((offset) => doodleKinds[(seededIndex(seed, doodleKinds.length) + offset) % doodleKinds.length])
    .filter((kind) => !editedLabels.some((label) => label.includes(kind)));
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
      const doodle = doodleOrder[doodles % doodleOrder.length];
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
  // Never pass the game's title: image models print it as lettering.
  const details = (activity.items ?? []).map((item) => item.label).slice(0, 3).join(", ");
  return [
    `A black-and-white coloring-book line drawing of ${day.landmark?.place || day.theme} in ${destination}.`,
    details ? `Include a few real local details such as ${details}.` : "",
    "The landmark is recognizable and sits in the middle of a square picture, with a little scenery around it.",
    "Leave open, empty sky across the top and open, empty ground along the bottom, and keep all four corners empty.",
    "Clean dark outlines on pure white paper, medium detail. Every shape is left white inside: no shading, no filled or gray areas, no black areas.",
    "No text of any kind: no letters, words, inscriptions, carved or painted lettering, signs, numbers or logos.",
    "The drawing runs edge to edge with no border, frame or outline around the picture.",
  ].filter(Boolean).join(" ");
}

// One FLUX.2 call: text-to-image without `input`, an edit of `input` with it.
function cloudflareFlux(runtime: SpotRuntime) {
  const accountId = runtime.CLOUDFLARE_ACCOUNT_ID?.trim();
  const apiToken = runtime.CLOUDFLARE_API_TOKEN?.trim();
  if (!accountId || !apiToken) return null;
  const model = runtime.CLOUDFLARE_AI_EDIT_MODEL?.trim() || DEFAULT_EDIT_MODEL;
  return async (prompt: string, size: number, input?: Uint8Array, timeoutMs = EDIT_TIMEOUT_MS) => {
    const form = new FormData();
    form.append("prompt", prompt);
    if (input) form.append("input_image_0", new Blob([input as Uint8Array<ArrayBuffer>], { type: "image/png" }), "picture-a.png");
    form.append("width", String(size));
    form.append("height", String(size));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
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
        console.info(`[TripQuest spot-the-difference] FLUX returned ${response.status}`);
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
  if (!storage || !canReadCachedImages(runtime)) return null;
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

  if (!provider || !canGenerateImageExtras(runtime)) return null;

  // FLUX.2 klein follows "no fills, no text" far better than the default
  // illustration model, for about the same cost; other providers still work.
  const flux = cloudflareFlux(runtime);
  const prompt = spotPicturePrompt(destination, candidate.day, candidate.activity);
  const source = (flux && await flux(prompt, 1024, undefined, PICTURE_TIMEOUT_MS).catch(() => null))
    || await generateIllustrationPng(provider, prompt, "1024x1024");
  const a = squareGrey(decodeImage(source), SIZE);
  const aPng = encodePng(a);
  const edit: EditFn | null = flux ? (editPromptText) => flux(editPromptText, SIZE, aPng) : null;
  const { b, regions, edited } = await buildDifferencePicture(a, edit, identity);
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
  if (!candidates.length || !runtime.BOOKLET_FILES || !canReadCachedImages(runtime)) return [];
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
