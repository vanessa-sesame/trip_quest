import assert from "node:assert/strict";
import test from "node:test";
import jpeg from "jpeg-js";
import { buildBooklet, type DifferencePictures } from "../app/lib/booklet/booklet.ts";
import { validateBookletDraft } from "../app/lib/generation/booklet-ai.ts";
import { decodeImage, encodePng, type Grey } from "../app/lib/generation/raster.ts";
import {
  addSpotTheDifference,
  applyDifferencePaths,
  buildDifferencePicture,
  chooseRegions,
} from "../app/lib/generation/spot-difference.ts";

const SIZE = 512;
const CELL = SIZE / 5;

// A busy centre (the "landmark") and empty paper around it, with the
// bottom-right corner cell deliberately filled with ink.
function scene(): Grey {
  const data = new Uint8Array(SIZE * SIZE).fill(255);
  const line = (x0: number, y0: number, x1: number, y1: number) => {
    for (let t = 0; t <= 1; t += 1 / 800) {
      const x = Math.round(x0 + (x1 - x0) * t);
      const y = Math.round(y0 + (y1 - y0) * t);
      for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) data[(y + dy) * SIZE + x + dx] = 20;
    }
  };
  for (let offset = 0; offset < CELL * 3; offset += 12) {
    line(CELL + offset, CELL, CELL + offset, CELL * 4);
    line(CELL, CELL + offset, CELL * 4, CELL + offset);
  }
  for (let offset = 4; offset < CELL; offset += 8) line(CELL * 4 + offset, CELL * 4 + 2, CELL * 4 + offset, SIZE - 3);
  return { width: SIZE, height: SIZE, data };
}

function differsOnlyInside(a: Grey, b: Grey, regions: DifferencePictures["regions"]) {
  for (let index = 0; index < a.data.length; index += 1) {
    if (a.data[index] === b.data[index]) continue;
    const x = (index % SIZE) / SIZE;
    const y = Math.floor(index / SIZE) / SIZE;
    if (!regions.some((region) => x >= region.x && x <= region.x + region.w && y >= region.y && y <= region.y + region.h)) return false;
  }
  return true;
}

function toJpeg(image: Grey) {
  const rgba = new Uint8Array(image.data.length * 4);
  image.data.forEach((value, index) => rgba.set([value, value, value, 255], index * 4));
  return new Uint8Array(jpeg.encode({ width: image.width, height: image.height, data: rgba }, 95).data);
}

// What a good edit looks like: A plus a solid drawn object in a cell.
function withObjects(a: Grey, cells: Array<{ col: number; row: number }>) {
  const data = Uint8Array.from(a.data);
  for (const cell of cells) {
    const cx = (cell.col + 0.5) * CELL;
    const cy = (cell.row + 0.5) * CELL;
    for (let y = cy - 18; y < cy + 18; y += 1) for (let x = cx - 18; x < cx + 18; x += 1) {
      if (Math.abs(x - cx) > 14 || Math.abs(y - cy) > 14) data[Math.round(y) * SIZE + Math.round(x)] = 15;
    }
  }
  return { width: SIZE, height: SIZE, data };
}

test("regions are the emptiest cells, away from the centre and each other", () => {
  const cells = chooseRegions(scene());
  assert.equal(cells.length, 3);
  for (const cell of cells) {
    assert.ok(cell.row === 0 || cell.row === 4 || cell.col === 0 || cell.col === 4, "outside the centre");
    assert.ok(!(cell.col === 4 && cell.row === 4), "not the inked corner");
  }
  for (const [index, cell] of cells.entries()) {
    for (const other of cells.slice(index + 1)) {
      assert.ok(Math.abs(cell.col - other.col) > 1 || Math.abs(cell.row - other.row) > 1, "not neighbours");
    }
  }
});

test("accepted edits change picture B only inside the three regions", async () => {
  const a = scene();
  const cells = chooseRegions(a);
  // Every edit redraws the object in all three cells and also nudges the
  // landmark's lines, which must never leak into picture B.
  const drifted = withObjects(a, cells);
  for (let index = SIZE; index < drifted.data.length; index += 1) if (a.data[index - SIZE] < 100) drifted.data[index] = Math.min(drifted.data[index], 60);
  const edit = async () => toJpeg(drifted);
  const { b, regions, edited } = await buildDifferencePicture(a, edit, "seed");
  assert.equal(edited, 3);
  assert.equal(regions.length, 3);
  assert.ok(differsOnlyInside(a, b, regions));
  assert.notDeepEqual(b.data, a.data);
});

test("regions the model cannot change get three different doodles", async () => {
  const a = scene();
  const failing = async () => null;
  const { b, regions, edited } = await buildDifferencePicture(a, failing, "seed");
  assert.equal(edited, 0);
  assert.equal(new Set(regions.map((region) => region.label)).size, 3);
  assert.ok(differsOnlyInside(a, b, regions));
  for (const region of regions) {
    let changed = 0;
    for (let y = Math.floor(region.y * SIZE); y < (region.y + region.h) * SIZE; y += 1) {
      for (let x = Math.floor(region.x * SIZE); x < (region.x + region.w) * SIZE; x += 1) if (a.data[y * SIZE + x] !== b.data[y * SIZE + x]) changed += 1;
    }
    assert.ok(changed > 200, `${region.label} is visible`);
  }
});

test("an edit that only redraws existing lines is rejected", async () => {
  const a = scene();
  const redrawn = { width: SIZE, height: SIZE, data: Uint8Array.from(a.data, (value) => (value < 100 ? 0 : value)) };
  const { edited, regions, b } = await buildDifferencePicture(a, async () => toJpeg(redrawn), "seed");
  assert.equal(edited, 0, "no region accepted a redraw as a difference");
  assert.ok(differsOnlyInside(a, b, regions));
});

test("difference pictures survive validation of a stored booklet", () => {
  const dayPlans = buildBooklet(7, "Kyoto", 1);
  const items = [
    { label: "Lantern", clue: "What glows above the gate?" },
    { label: "Bridge", clue: "What crosses the pond?" },
    { label: "Gate", clue: "What is painted bright red?" },
    { label: "Koi", clue: "What swims under the bridge?" },
  ];
  const path = (letter: string) => `/api/illustration?key=${encodeURIComponent(`illustrations/v2/${letter.repeat(64)}/artwork.png`)}`;
  const differencePaths: DifferencePictures = {
    a: path("a"),
    b: path("b"),
    regions: [
      { x: 0.1, y: 0.02, w: 0.18, h: 0.16, label: "a bird" },
      { x: 0.7, y: 0.03, w: 0.2, h: 0.15, label: "a cloud" },
      { x: 0.05, y: 0.8, w: 0.2, h: 0.18, label: "a star" },
    ],
  };
  const slots = dayPlans[0].slots;
  slots.inThePlace = { ...slots.inThePlace, gameType: "spot_the_difference", items, differencePaths };
  slots.sitDown = { ...slots.sitDown, gameType: "story", items };
  delete slots.inThePlaceSecond;
  dayPlans[0].activities = [slots.inThePlace, slots.sitDown];
  const draft = { profile: { style: "Temple gardens", intro: "Quiet gardens and bright gates.", word: "arigatou - thank you", etiquette: "Bow gently at the gate." }, dayPlans };

  const once = validateBookletDraft(draft, 1, 7);
  assert.deepEqual(once.dayPlans[0].slots.inThePlace.differencePaths, differencePaths);
  assert.deepEqual(validateBookletDraft({ ...once }, 1, 7), once);

  const tampered = structuredClone(draft);
  tampered.dayPlans[0].slots.inThePlace.differencePaths = { ...differencePaths, b: "https://example.com/b.png" };
  assert.equal(validateBookletDraft(tampered, 1, 7).dayPlans[0].slots.inThePlace.differencePaths, undefined);
});

test("the pipeline stores both pictures, reuses them, and assigns them to the right slot", async () => {
  const objects = new Map<string, { bytes: Uint8Array; meta?: Record<string, string> }>();
  const storage = {
    async get(key: string) {
      const stored = objects.get(key);
      return stored ? { text: async () => "", customMetadata: stored.meta } : null;
    },
    async put(key: string, value: Uint8Array, options?: { customMetadata?: Record<string, string> }) {
      objects.set(key, { bytes: value, meta: options?.customMetadata });
    },
    async delete(key: string) {
      objects.delete(key);
    },
  };
  const a = scene();
  let calls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_input, init) => {
    calls += 1;
    // Picture A is a text-to-image call; edits send picture A along.
    const isEdit = init?.body instanceof FormData && init.body.has("input_image_0");
    const image = isEdit ? toJpeg(withObjects(a, chooseRegions(a))) : encodePng(a);
    return Response.json({ result: { image: Buffer.from(image).toString("base64") } });
  };
  try {
    const dayPlans = buildBooklet(7, "Kyoto", 1);
    dayPlans[0].slots.sitDown = { ...dayPlans[0].slots.sitDown, gameType: "spot_the_difference", title: "Garden Differences" };
    const runtime = { BOOKLET_FILES: storage, CLOUDFLARE_ACCOUNT_ID: "test", CLOUDFLARE_API_TOKEN: "test" };
    const assignments = await addSpotTheDifference(runtime, { destination: "Kyoto", dayPlans });
    assert.equal(assignments.length, 1);
    assert.equal(assignments[0].slot, "sitDown");
    assert.equal(calls, 4, "one picture plus one edit per region");
    const pictures = assignments[0].differencePaths;
    const keyOf = (path: string) => decodeURIComponent(path.split("key=")[1]);
    const storedA = decodeImage(objects.get(keyOf(pictures.a))!.bytes);
    const storedB = decodeImage(objects.get(keyOf(pictures.b))!.bytes);
    assert.equal(storedA.width, SIZE);
    assert.ok(differsOnlyInside(storedA, storedB, pictures.regions));

    const again = await addSpotTheDifference(runtime, { destination: "Kyoto", dayPlans });
    assert.equal(calls, 4, "the second run reuses the stored pair");
    assert.deepEqual(again, assignments);

    const applied = applyDifferencePaths(dayPlans, assignments);
    assert.deepEqual(applied[0].slots.sitDown.differencePaths, pictures);
    assert.deepEqual(applied[0].activities[1].differencePaths, pictures);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
