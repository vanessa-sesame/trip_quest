import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as fontkit from "fontkit";
import { PDFDocument, PDFPage, StandardFonts } from "pdf-lib";
import { normalizeFamilyChildren } from "../app/lib/family.ts";
import { createBookletPdf } from "../app/lib/pdf/booklet-pdf.ts";
import { drawBulletList, Flow, type BulletMarker, type Fonts } from "../app/lib/pdf/layout.ts";
import { minReadableSize, typeScale } from "../app/lib/pdf/theme.ts";
import {
  buildBooklet,
  getDestinationProfile,
  pairEligibleGameTypes,
  queueEligibleGameTypes,
  type GameType,
} from "../app/lib/booklet/booklet.ts";
import { allowedGameTypesForAge } from "../app/lib/generation/booklet-ai.ts";
import type { GeneratedBookletData } from "../app/lib/generation/booklet-ai.ts";
import { sampleGeneratedBooklet } from "./fixtures/generated-booklet.ts";

const publicFile = async (path: string) => new Uint8Array(await readFile(`public${path}`));

async function loadFonts() {
  const document = await PDFDocument.create();
  document.registerFontkit(fontkit);
  const fonts: Fonts = {
    regular: await document.embedFont(await publicFile("/fonts/NunitoSans-Regular.ttf")),
    bold: await document.embedFont(await publicFile("/fonts/NunitoSans-Bold.ttf")),
    mono: await document.embedFont(StandardFonts.Courier),
    monoBold: await document.embedFont(StandardFonts.CourierBold),
    display: await document.embedFont(await publicFile("/fonts/ShortStack-Regular.ttf")),
  };
  return { document, fonts };
}

// The x-height read straight from the font file, independent of layout.ts.
async function xHeightRatio(path: string) {
  const font = fontkit.create(Buffer.from(await publicFile(path)));
  return font.xHeight / font.unitsPerEm;
}

test("bullet markers sit on the optical middle of their first line", async () => {
  const { document, fonts } = await loadFonts();
  const page = document.addPage();
  const regular = await xHeightRatio("/fonts/NunitoSans-Regular.ttf");
  const bold = await xHeightRatio("/fonts/NunitoSans-Bold.ttf");
  const items = [
    "A short item.",
    "A much longer item that has to wrap onto a second and maybe a third line in a narrow column.",
    { title: "Titled item", text: "With a smaller explanation underneath it that also wraps." },
  ];
  for (const size of [8.5, 9.5, 11, 12.5]) {
    for (const marker of ["dot", "number", "letter", "check"] as BulletMarker[]) {
      const { rows } = drawBulletList(page, fonts, items, { x: 40, top: 700, width: 180, size, marker });
      rows.forEach((row, index) => {
        const ratio = typeof items[index] === "string" ? regular : bold;
        const midline = row.firstBaseline + (size * ratio) / 2;
        assert.ok(
          Math.abs(row.markerCenter.y - midline) < 0.5,
          `${marker} @ ${size}pt row ${index}: marker ${row.markerCenter.y.toFixed(2)} vs midline ${midline.toFixed(2)}`,
        );
        assert.ok(row.textX > row.markerCenter.x, "text starts after its marker");
        if (index > 0) assert.ok(rows[index - 1].bottom > row.top, "rows never overlap");
      });
    }
  }
});

test("the flow cursor stacks blocks without overlap as type grows", async () => {
  const { document, fonts } = await loadFonts();
  const page = document.addPage();
  for (const size of [9.5, 11, 12.5, 20]) {
    const flow = new Flow(page, fonts, { x: 40, top: 800, width: 200, bottom: 40 });
    const first = flow.text("One two three four five six seven eight nine ten eleven twelve.", { size });
    const second = flow.text("Next block.", { size });
    assert.ok(first.bottom <= first.baselines[first.baselines.length - 1] - size * 0.2, "block bottom is below its descenders");
    assert.ok(second.baselines[0] + size * 0.8 <= first.bottom + 0.01, "the next block starts below the previous one");
  }
});

test("the type scale never goes below the print floor", () => {
  for (let age = 3; age <= 14; age += 1) {
    const scale = typeScale(age);
    for (const [name, value] of Object.entries(scale)) {
      if (name === "lineHeight") continue;
      assert.ok(value >= minReadableSize, `age ${age} ${name} is ${value}pt`);
    }
  }
});

test("no text in a complete booklet is printed below 8pt", async () => {
  const sizes: Array<{ size: number; text: string }> = [];
  const original = PDFPage.prototype.drawText;
  PDFPage.prototype.drawText = function drawText(text, options) {
    sizes.push({ size: options?.size ?? 24, text });
    return original.call(this, text, options);
  };
  try {
    const booklet = sampleGeneratedBooklet();
    await createBookletPdf(booklet, {
      children: normalizeFamilyChildren([{ name: "Mia", age: 5 }, { name: "Leo", age: 9 }]),
      events: [{ id: "e1", day: 1, type: "attraction", title: "Gardens by the Bay" }],
      mechanicsByDay: [{ day: 1, mechanics: ["spot", "cooperate"] }],
    }, publicFile, publicFile);
    // Every game type, at both ends of the age range.
    for (const age of [4, 7, 12]) {
      const dayPlans = buildBooklet(age, "Paris", 5);
      const items = [
        { label: "Lantern", clue: "What glows above the door at night?" },
        { label: "Bridge", clue: "What crosses the river near the market?" },
        { label: "Fountain", clue: "Where does the water splash in the square?" },
        { label: "Bakery", clue: "Which shop smells of warm bread?" },
      ];
      const allowed = allowedGameTypesForAge(age);
      const pick = (pool: GameType[], index: number) => {
        const usable = pool.filter((type) => allowed.includes(type));
        return usable[index % usable.length];
      };
      dayPlans.forEach((day, index) => {
        day.slots.inThePlace = { ...day.slots.inThePlace, gameType: pick(allowed, index * 3), items };
        day.slots.inThePlaceSecond = { ...day.slots.inThePlace, title: `Second look ${index + 1}`, gameType: pick(pairEligibleGameTypes, index * 3 + 1), items };
        day.slots.sitDown = { ...day.slots.sitDown, gameType: pick(allowed, index * 3 + 2), items };
        day.slots.whileYouWait = { ...day.slots.whileYouWait, gameType: pick(queueEligibleGameTypes, index), items };
        day.activities = [day.slots.inThePlace, day.slots.sitDown];
      });
      const young: GeneratedBookletData = {
        destination: "Paris",
        age,
        days: 5,
        itinerary: ["", "", "", "", ""],
        profile: getDestinationProfile("Paris"),
        dayPlans,
        sources: [],
        generatedAt: "2026-09-26T00:00:00.000Z",
      };
      await createBookletPdf(young, undefined, publicFile, publicFile);
    }
  } finally {
    PDFPage.prototype.drawText = original;
  }
  const tooSmall = sizes.filter((entry) => entry.size < minReadableSize - 0.001);
  assert.deepEqual(tooSmall.slice(0, 5), [], `${tooSmall.length} strings below ${minReadableSize}pt`);
});
