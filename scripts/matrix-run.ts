// The 50-booklet matrix run (scenarios in scripts/scenarios-50.ts) against a
// local dev server: generates each booklet through /api/generate the way
// the website does (pasted itineraries go through the same importer),
// downloads the free booklet PDF and sticker sheets through /api/pdf, runs
// the print and content checks, and writes a variety report.
//
// Usage:
//   node --experimental-strip-types scripts/matrix-run.ts [name-filter] [--concurrency=2]
// Writes artifacts/booklets/matrix-<date>/{pdfs,stickers,json,results.jsonl,report.md}.
// Needs the dev server on http://localhost:3000 (override with TRIPQUEST_URL).
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { composedContentIssues } from "../app/lib/booklet/qa.ts";
import { queueGameActivity } from "../app/lib/booklet/pages.ts";
import type { GeneratedBookletData } from "../app/lib/generation/booklet-ai.ts";
import { travelDayGameTypes } from "../app/lib/generation/booklet-ai.ts";
import { readGenerationResponse } from "../app/lib/generation/stream.ts";
import { eventsToDailyPlans, isTravelOnlyPlan, mergeDailyPlans, parseItineraryText } from "../app/lib/itinerary.ts";
import { stickersForBooklet } from "../app/lib/booklet/stickers.ts";
import { matrixScenarios, type MatrixScenario } from "./scenarios-50.ts";

const baseUrl = process.env.TRIPQUEST_URL || "http://localhost:3000";
const args = process.argv.slice(2);
const filter = args.find((arg) => !arg.startsWith("--"));
const concurrency = Number(args.find((arg) => arg.startsWith("--concurrency="))?.split("=")[1] || 2);
const runDir = `artifacts/booklets/matrix-${new Date().toISOString().slice(0, 10)}`;
for (const folder of ["pdfs", "stickers", "json"]) await mkdir(`${runDir}/${folder}`, { recursive: true });

type Result = {
  scenario: string;
  ok: boolean;
  error?: string;
  age?: number;
  days?: number;
  generatedMs?: number;
  pageCount?: number;
  stickerPages?: number;
  stickers?: number;
  problems?: string[];
  dayGames?: string[][];
  travelDays?: number[];
  dayPlaces?: string[];
};

function requestPlans(scenario: MatrixScenario) {
  if (!scenario.pastedItinerary) {
    return { itinerary: scenario.itinerary ?? Array.from({ length: scenario.days }, () => ""), events: [] as unknown[] };
  }
  // The website's "Build trip timeline" button.
  const events = parseItineraryText(scenario.pastedItinerary, scenario.days);
  const imported = eventsToDailyPlans(events, scenario.days);
  return { itinerary: Array.from({ length: scenario.days }, (_, index) => mergeDailyPlans("", imported[index] || "")), events };
}

function checks(booklet: GeneratedBookletData, itinerary: string[]) {
  const problems = [...composedContentIssues(booklet)];
  const dayGames = booklet.dayPlans.map((day) => {
    const queue = queueGameActivity(day);
    return [
      day.slots.inThePlace.gameType,
      day.slots.inThePlaceSecond?.gameType,
      day.slots.sitDown.gameType,
      queue ? `queue:${queue.gameType}` : undefined,
    ].filter((value): value is string => Boolean(value));
  });
  dayGames.forEach((games, index) => {
    const main = games.filter((game) => !game.startsWith("queue:"));
    if (new Set(main).size < main.length) problems.push(`day ${index + 1} repeats a game type: ${main.join(", ")}`);
    if (index > 0 && games[0] === dayGames[index - 1][0]) problems.push(`days ${index} and ${index + 1} open with the same game (${games[0]})`);
  });
  const travelDays = itinerary.map((plan, index) => (plan && isTravelOnlyPlan(plan) ? index + 1 : 0)).filter(Boolean);
  for (const day of travelDays) {
    const games = dayGames[day - 1].map((game) => game.replace("queue:", ""));
    const siteGames = games.filter((game) => !travelDayGameTypes.includes(game as never));
    if (siteGames.length) problems.push(`travel day ${day} has site games: ${siteGames.join(", ")}`);
  }
  const places = booklet.dayPlans.map((day) => day.landmark.place);
  const repeated = places.filter((place, index) => places.indexOf(place) !== index && !travelDays.includes(index + 1));
  if (repeated.length) problems.push(`repeated main place: ${repeated.join(", ")}`);
  return { problems, dayGames, travelDays, dayPlaces: places };
}

async function download(booklet: GeneratedBookletData & { editionFingerprint?: string }, kind: "booklet" | "stickers") {
  const response = await fetch(`${baseUrl}/api/pdf`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: baseUrl },
    body: JSON.stringify({
      destination: booklet.destination,
      age: booklet.age,
      days: booklet.days,
      itinerary: booklet.itinerary,
      family: booklet.family,
      events: booklet.events,
      editionFingerprint: booklet.editionFingerprint,
      kind,
    }),
  });
  if (!response.ok) throw new Error(`${kind} PDF ${response.status}: ${(await response.text()).slice(0, 200)}`);
  return new Uint8Array(await response.arrayBuffer());
}

async function run(scenario: MatrixScenario): Promise<Result> {
  const started = Date.now();
  const { itinerary, events } = requestPlans(scenario);
  try {
    const response = await fetch(`${baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: baseUrl },
      body: JSON.stringify({
        destination: scenario.destination,
        age: scenario.age,
        days: scenario.days,
        itinerary,
        events,
        family: scenario.family ?? [{ name: "Explorer 1", age: scenario.age }],
      }),
    });
    const booklet = await readGenerationResponse(response, () => undefined) as GeneratedBookletData & { editionFingerprint?: string };
    const generatedMs = Date.now() - started;
    await writeFile(`${runDir}/json/${scenario.name}.json`, JSON.stringify(booklet, null, 2));
    const bytes = await download(booklet, "booklet");
    await writeFile(`${runDir}/pdfs/${scenario.name}.pdf`, bytes);
    const stickerBytes = await download(booklet, "stickers");
    await writeFile(`${runDir}/stickers/${scenario.name}-stickers.pdf`, stickerBytes);
    const pageCount = (await PDFDocument.load(bytes)).getPageCount();
    const stickerPages = (await PDFDocument.load(stickerBytes)).getPageCount();
    const found = checks(booklet, itinerary);
    if (pageCount % 4 !== 0) found.problems.push(`page count ${pageCount} is not a multiple of 4`);
    const familyPack = booklet.family?.length ? { children: booklet.family } : undefined;
    return {
      scenario: scenario.name, ok: true, age: scenario.age, days: scenario.days, generatedMs, pageCount, stickerPages,
      stickers: stickersForBooklet(booklet, familyPack).length, ...found,
    };
  } catch (error) {
    return { scenario: scenario.name, ok: false, age: scenario.age, days: scenario.days, error: error instanceof Error ? error.message : String(error) };
  }
}

// Results from an earlier, interrupted run of the same day are kept and
// those scenarios skipped, so the run can be resumed.
const done = new Map<string, Result>();
if (existsSync(`${runDir}/results.jsonl`)) {
  for (const line of (await readFile(`${runDir}/results.jsonl`, "utf8")).split("\n").filter(Boolean)) {
    const result = JSON.parse(line) as Result;
    if (result.ok) done.set(result.scenario, result);
  }
}
const queue = matrixScenarios.filter((scenario) => (!filter || scenario.name.includes(filter)) && !done.has(scenario.name));
console.log(`${queue.length} to run, ${done.size} already done, concurrency ${concurrency}`);
const results: Result[] = [...done.values()];
await Promise.all(Array.from({ length: concurrency }, async () => {
  for (let scenario = queue.shift(); scenario; scenario = queue.shift()) {
    const result = await run(scenario);
    results.push(result);
    await appendFile(`${runDir}/results.jsonl`, `${JSON.stringify(result)}\n`);
    console.log(result.ok
      ? `✔ ${result.scenario}: ${((result.generatedMs ?? 0) / 1000).toFixed(0)}s, ${result.pageCount} pages, ${result.stickerPages} sticker sheets${result.problems?.length ? `, PROBLEMS: ${result.problems.join("; ")}` : ""}`
      : `✖ ${result.scenario}: ${result.error}`);
  }
}));

// Report: failures, problems, timing and game variety.
const ok = results.filter((result) => result.ok);
const games = ok.flatMap((result) => result.dayGames ?? []).flat().map((game) => game.replace("queue:", ""));
const counts = [...games.reduce((map, game) => map.set(game, (map.get(game) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1]);
const byBand = new Map<string, Map<string, number>>();
for (const result of ok) {
  const band = (result.age ?? 0) <= 4 ? "3-4" : (result.age ?? 0) <= 6 ? "5-6" : (result.age ?? 0) <= 9 ? "7-9" : (result.age ?? 0) <= 11 ? "10-11" : "12-14";
  const bandCounts = byBand.get(band) ?? new Map<string, number>();
  for (const game of (result.dayGames ?? []).flat().map((value) => value.replace("queue:", ""))) bandCounts.set(game, (bandCounts.get(game) ?? 0) + 1);
  byBand.set(band, bandCounts);
}
const times = ok.map((result) => result.generatedMs ?? 0).sort((a, b) => a - b);
const median = times.length ? times[Math.floor(times.length / 2)] / 1000 : 0;
const report = [
  `# Matrix run ${new Date().toISOString().slice(0, 16)}`,
  "",
  `- Booklets: ${ok.length} of ${results.length} generated; ${results.length - ok.length} failed.`,
  `- With problems: ${ok.filter((result) => result.problems?.length).length}.`,
  `- Generation time: median ${median.toFixed(0)}s, slowest ${(times.at(-1) ?? 0) / 1000}s.`,
  `- Pages: ${Math.min(...ok.map((result) => result.pageCount ?? 0))}–${Math.max(...ok.map((result) => result.pageCount ?? 0))}; sticker sheets per kit: ${[...new Set(ok.map((result) => result.stickerPages))].sort().join(", ")}.`,
  "",
  "## Game types (all booklets)",
  ...counts.map(([game, count]) => `- ${game}: ${count}`),
  "",
  "## Game types by age band",
  ...[...byBand].sort().map(([band, map]) => `- ${band}: ${[...map].sort((a, b) => b[1] - a[1]).map(([game, count]) => `${game} ${count}`).join(", ")}`),
  "",
  "## Booklets",
  ...results.sort((a, b) => a.scenario.localeCompare(b.scenario)).map((result) => result.ok
    ? `- ${result.scenario}: ${((result.generatedMs ?? 0) / 1000).toFixed(0)}s, ${result.pageCount} pages, ${result.stickers} stickers on ${result.stickerPages} sheets; travel days ${result.travelDays?.join(", ") || "none"}; places ${result.dayPlaces?.join(" / ")}; games ${result.dayGames?.map((day) => day.join("+")).join(" | ")}${result.problems?.length ? `\n  - PROBLEMS: ${result.problems.join("; ")}` : ""}`
    : `- ${result.scenario}: FAILED ${result.error}`),
].join("\n");
await writeFile(`${runDir}/report.md`, `${report}\n`);
console.log(`\nDone. ${runDir}/report.md`);
