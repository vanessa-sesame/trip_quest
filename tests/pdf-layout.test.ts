import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as fontkit from "fontkit";
import { PDFDocument, PDFPage, StandardFonts } from "pdf-lib";
import { normalizeFamilyChildren } from "../app/lib/family.ts";
import { createBookletPdf } from "../app/lib/pdf/booklet-pdf.ts";
import { drawBulletList, Flow, type BulletMarker, type Fonts } from "../app/lib/pdf/layout.ts";
import { CONTENT_BOTTOM, minReadableSize, typeScale, writingLinePitch } from "../app/lib/pdf/theme.ts";
import { drawWriteArea, measureWriteArea, parseWritePrompt } from "../app/lib/pdf/writing.ts";
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

// A booklet of `days` days whose slots cycle through every game type the
// age allows, so each renderer is exercised.
function everyGameBooklet(age: number, days: number): GeneratedBookletData {
  const dayPlans = buildBooklet(age, "Paris", days);
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
  return {
    destination: "Paris",
    age,
    days,
    itinerary: dayPlans.map(() => ""),
    profile: getDestinationProfile("Paris"),
    dayPlans,
    sources: [],
    generatedAt: "2026-09-26T00:00:00.000Z",
  };
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
      await createBookletPdf(everyGameBooklet(age, 5), undefined, publicFile, publicFile);
    }
  } finally {
    PDFPage.prototype.drawText = original;
  }
  const tooSmall = sizes.filter((entry) => entry.size < minReadableSize - 0.001);
  assert.deepEqual(tooSmall.slice(0, 5), [], `${tooSmall.length} strings below ${minReadableSize}pt`);
});

test("writing lines are spaced for the child's age, from one place", () => {
  const mm = 72 / 25.4;
  for (let age = 3; age <= 14; age += 1) {
    const pitch = writingLinePitch(age);
    const minimum = age <= 6 ? 11 : age <= 9 ? 9 : 7.5;
    assert.ok(pitch >= minimum * mm - 0.01, `age ${age}: ${(pitch / mm).toFixed(1)}mm between writing lines`);
    assert.equal(typeScale(age).writeLine, pitch);
  }
  assert.ok(writingLinePitch(5) > writingLinePitch(8) && writingLinePitch(8) > writingLinePitch(12));
});

test("inline blanks in a prompt become labelled writing rows", () => {
  assert.deepEqual(parseWritePrompt("My answer: ____  Evidence: __________"), {
    intro: "", choices: [], fields: [{ label: "My answer:", slots: [""] }, { label: "Evidence:", slots: [""] }],
  });
  assert.deepEqual(parseWritePrompt("My matches: 1-__  2-__  3-__  4-__").fields, [{ label: "My matches:", slots: ["1-", "2-", "3-", "4-"] }]);
  assert.deepEqual(parseWritePrompt("My stop order: __ - __ - __ - __   Streets used: ____").fields, [
    { label: "My stop order:", slots: ["", "-", "-", "-"] },
    { label: "Streets used:", slots: [""] },
  ]);
  assert.deepEqual(parseWritePrompt("My route score: easy / twisty / super tricky"), { intro: "My route score:", fields: [], choices: ["easy", "twisty", "super tricky"] });
  assert.deepEqual(parseWritePrompt("What did you notice first?"), { intro: "What did you notice first?", fields: [], choices: [] });
});

test("a write area gives every blank a full row at the writing pitch and grows to fill its box", async () => {
  const { document, fonts } = await loadFonts();
  const page = document.addPage();
  for (const age of [4, 8, 12]) {
    const pitch = writingLinePitch(age);
    const options = { pitch, size: typeScale(age).small, minLines: 2 };
    for (const prompt of ["My answer: ____  Evidence: ____", "The hardest detail to find: ____", "My matches: 1-__ 2-__ 3-__ 4-__", "What did you notice?"]) {
      const minimum = measureWriteArea(fonts, prompt, 300, options);
      assert.ok(minimum >= 2 * pitch, `${prompt} @ age ${age}: at least two writing rows`);
      const small = drawWriteArea(page, fonts, prompt, { x: 40, y: 100, width: 300, height: minimum }, options);
      assert.ok(small.lines >= 2 && small.bottom >= 100 - 0.01, `${prompt} @ age ${age}: fits its minimum box`);
      const tall = drawWriteArea(page, fonts, prompt, { x: 40, y: 100, width: 300, height: minimum + pitch * 3 + 1 }, options);
      assert.equal(tall.lines, small.lines + 3, `${prompt} @ age ${age}: spare height becomes writing rows`);
      assert.ok(tall.bottom >= 100 - 0.01);
    }
  }
});

test("booklet pages keep every word and shape inside the content area, without overlapping text", async () => {
  type Mark = { page: unknown; text?: string; x: number; y: number; size: number; width: number; bottom: number };
  const marks: Mark[] = [];
  const originalText = PDFPage.prototype.drawText;
  const originalCircle = PDFPage.prototype.drawCircle;
  PDFPage.prototype.drawText = function drawText(text, options) {
    const size = options?.size ?? 24;
    const width = options?.font ? options.font.widthOfTextAtSize(text, size) : 0;
    marks.push({ page: this, text, x: options?.x ?? 0, y: options?.y ?? 0, size, width, bottom: (options?.y ?? 0) - size * 0.22 });
    return originalText.call(this, text, options);
  };
  PDFPage.prototype.drawCircle = function drawCircle(options) {
    const radius = Number(options?.size ?? 0);
    marks.push({ page: this, x: Number(options?.x ?? 0), y: Number(options?.y ?? 0), size: radius, width: 0, bottom: Number(options?.y ?? 0) - radius });
    return originalCircle.call(this, options);
  };
  const problems: string[] = [];
  try {
    const pack = { children: normalizeFamilyChildren([{ name: "Mia", age: 5 }, { name: "Leo", age: 9 }]), events: [], mechanicsByDay: [] };
    for (const [age, days] of [[4, 1], [5, 4], [7, 5], [9, 3], [12, 14], [14, 7]]) {
      marks.length = 0;
      const booklet = everyGameBooklet(age, days);
      await createBookletPdf(booklet, days % 2 ? pack : undefined, publicFile, publicFile);
      const pages = [...new Set(marks.map((mark) => mark.page))];
      pages.forEach((page, index) => {
        const onPage = marks.filter((mark) => mark.page === page);
        for (const mark of onPage) {
          // The footer (text and page-number badge) sits below the content area.
          const footer = mark.y > 10 && mark.y < 26 && mark.y - mark.size > 8;
          if (!footer && mark.bottom < CONTENT_BOTTOM - 2) problems.push(`age ${age}, ${days}d, page ${index + 1}: "${mark.text ?? "circle"}" reaches ${mark.bottom.toFixed(1)}`);
        }
        const words = onPage.filter((mark) => mark.text);
        words.forEach((a, i) => words.slice(i + 1).forEach((b) => {
          const across = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
          const down = Math.min(a.y + a.size * 0.72, b.y + b.size * 0.72) - Math.max(a.bottom, b.bottom);
          if (across > 1 && down > 1) problems.push(`age ${age}, ${days}d, page ${index + 1}: "${a.text}" overlaps "${b.text}"`);
        }));
      });
    }
  } finally {
    PDFPage.prototype.drawText = originalText;
    PDFPage.prototype.drawCircle = originalCircle;
  }
  assert.deepEqual(problems.slice(0, 8), []);
});
