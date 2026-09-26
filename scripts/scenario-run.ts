// End-to-end booklet run against a local dev server: generates each
// scenario through /api/generate, downloads its PDF through /api/pdf, runs
// the automatic print and content checks, and records how long each
// generation stage took.
//
// Usage:
//   node --experimental-strip-types scripts/scenario-run.ts [name-filter]
// Writes artifacts/booklets/scenario-run-<date>/{pdfs,json,results.jsonl,summary.md}.
// Needs `npm run dev` on http://localhost:3000 (override with TRIPQUEST_URL).
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import { composedContentIssues } from "../app/lib/booklet/qa.ts";
import { dayGameActivities, queueGameActivity } from "../app/lib/booklet/pages.ts";
import type { GeneratedBookletData } from "../app/lib/generation/booklet-ai.ts";
import { readGenerationResponse } from "../app/lib/generation/stream.ts";

type Scenario = {
  name: string;
  destination: string;
  age: number;
  days: number;
  itinerary?: string[];
  family?: Array<{ name: string; age: number; interests?: string[] }>;
};

const scenarios: Scenario[] = [
  { name: "singapore-age3-1d", destination: "Singapore", age: 3, days: 1 },
  { name: "paris-age5-2d", destination: "Paris", age: 5, days: 2 },
  { name: "kyoto-age6-3d-trains", destination: "Kyoto", age: 6, days: 3, family: [{ name: "Mia", age: 6, interests: ["trains"] }] },
  { name: "rome-age7-2d-custom", destination: "Rome", age: 7, days: 2, itinerary: ["Colosseum and Roman Forum", "Trevi Fountain and Pantheon"] },
  { name: "hoi-an-age8-3d-siblings", destination: "Hoi An", age: 8, days: 3, family: [{ name: "Leo", age: 8 }, { name: "Ava", age: 5 }] },
  { name: "sydney-age9-1d", destination: "Sydney", age: 9, days: 1 },
  { name: "london-age10-4d-custom", destination: "London", age: 10, days: 4, itinerary: ["Tower of London", "British Museum", "Kew Gardens", "Borough Market and the Thames"] },
  { name: "barcelona-age11-2d", destination: "Barcelona", age: 11, days: 2 },
  { name: "new-york-age12-5d-siblings", destination: "New York", age: 12, days: 5, family: [{ name: "Sam", age: 12 }, { name: "Jo", age: 9 }] },
  { name: "istanbul-age14-3d", destination: "Istanbul", age: 14, days: 3 },
  { name: "bangkok-age4-2d", destination: "Bangkok", age: 4, days: 2 },
  { name: "reykjavik-age13-7d", destination: "Reykjavik", age: 13, days: 7 },
  { name: "lisbon-age8-3d", destination: "Lisbon", age: 8, days: 3 },
  { name: "seoul-age11-5d", destination: "Seoul", age: 11, days: 5 },
  { name: "marrakech-age6-2d", destination: "Marrakech", age: 6, days: 2 },
];

const baseUrl = process.env.TRIPQUEST_URL || "http://localhost:3000";
const filter = process.argv[2];
const runDir = `artifacts/booklets/scenario-run-${new Date().toISOString().slice(0, 10)}`;
await mkdir(`${runDir}/pdfs`, { recursive: true });
await mkdir(`${runDir}/json`, { recursive: true });

const ENUM_LIKE = /\b(?:[a-z]+_[a-z_]+|[A-Z]{2,}_[A-Z_]+)\b/;

function visibleStrings(booklet: GeneratedBookletData) {
  return booklet.dayPlans.flatMap((day) => [
    day.theme,
    day.mission,
    day.slots.beforeYouGo,
    day.slots.whileYouWait.title,
    day.slots.whileYouWait.instruction,
    ...dayGameActivities(day).flatMap((activity) => [
      activity.title,
      activity.body,
      activity.prompt,
      ...(activity.items ?? []).flatMap((item) => [item.label, item.clue]),
    ]),
    ...day.slots.factCard,
  ]);
}

function checks(booklet: GeneratedBookletData, pageCount: number) {
  const problems: string[] = [];
  if (pageCount % 4 !== 0) problems.push(`page count ${pageCount} is not a multiple of 4`);
  problems.push(...composedContentIssues(booklet));
  const enums = visibleStrings(booklet).filter((text) => ENUM_LIKE.test(text));
  if (enums.length) problems.push(`raw enum-like text: ${enums[0]}`);
  if (booklet.dayPlans.some((day) => /Count one repeated detail/i.test(day.slots.whileYouWait.instruction))) {
    problems.push("placeholder queue instruction");
  }
  const games = booklet.dayPlans.flatMap((day) => dayGameActivities(day));
  const spot = games.filter((activity) => activity.gameType === "spot_the_difference");
  return {
    problems,
    games: games.length,
    queueGames: booklet.dayPlans.filter((day) => queueGameActivity(day)).length,
    spotGames: spot.length,
    spotWithPictures: spot.filter((activity) => activity.differencePaths).length,
    spotRegions: spot.flatMap((activity) => activity.differencePaths?.regions.map((region) => region.label) ?? []),
    quizzes: games.filter((activity) => activity.gameType === "quiz").length,
  };
}

const summary: string[] = [];
for (const scenario of scenarios.filter((entry) => !filter || entry.name.includes(filter))) {
  const started = Date.now();
  const progress: Array<{ at: number; message: string }> = [];
  console.log(`\n▶ ${scenario.name}`);
  try {
    const response = await fetch(`${baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        destination: scenario.destination,
        age: scenario.age,
        days: scenario.days,
        itinerary: scenario.itinerary ?? Array.from({ length: scenario.days }, () => ""),
        family: scenario.family ?? [{ name: "Explorer 1", age: scenario.age }],
      }),
    });
    const booklet = await readGenerationResponse(response, (message) => {
      const at = Date.now() - started;
      progress.push({ at, message });
      console.log(`  ${(at / 1000).toFixed(0).padStart(4)}s  ${message}`);
    }) as GeneratedBookletData & { editionFingerprint?: string };
    const generatedMs = Date.now() - started;
    const pdfStarted = Date.now();
    const pdfResponse = await fetch(`${baseUrl}/api/pdf`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        destination: booklet.destination,
        age: booklet.age,
        days: booklet.days,
        itinerary: booklet.itinerary,
        family: booklet.family,
        events: booklet.events,
        editionFingerprint: booklet.editionFingerprint,
      }),
    });
    if (!pdfResponse.ok) throw new Error(`PDF ${pdfResponse.status}: ${(await pdfResponse.text()).slice(0, 200)}`);
    const bytes = new Uint8Array(await pdfResponse.arrayBuffer());
    const pdfMs = Date.now() - pdfStarted;
    await writeFile(`${runDir}/pdfs/${scenario.name}.pdf`, bytes);
    await writeFile(`${runDir}/json/${scenario.name}.json`, JSON.stringify(booklet, null, 2));
    const pageCount = (await PDFDocument.load(bytes)).getPageCount();
    const result = { scenario: scenario.name, ok: true, generatedMs, pdfMs, pageCount, progress, ...checks(booklet, pageCount) };
    await appendFile(`${runDir}/results.jsonl`, `${JSON.stringify(result)}\n`);
    const line = `${scenario.name}: ${(generatedMs / 1000).toFixed(0)}s + PDF ${(pdfMs / 1000).toFixed(1)}s, ${pageCount} pages, `
      + `queue games ${result.queueGames}, spot ${result.spotWithPictures}/${result.spotGames}, quizzes ${result.quizzes}`
      + (result.problems.length ? `, PROBLEMS: ${result.problems.join("; ")}` : ", checks passed");
    console.log(`  ✔ ${line}`);
    summary.push(`- ${line}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await appendFile(`${runDir}/results.jsonl`, `${JSON.stringify({ scenario: scenario.name, ok: false, error: message, progress })}\n`);
    console.log(`  ✖ ${scenario.name}: ${message}`);
    summary.push(`- ${scenario.name}: FAILED ${message}`);
  }
}
await writeFile(`${runDir}/summary.md`, `# Scenario run\n\n${summary.join("\n")}\n`);
console.log(`\nDone. ${runDir}/summary.md`);
