import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { copyFile, readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { readGenerationResponse } from "../app/lib/generation/stream.ts";
import type { GeneratedBookletData } from "../app/lib/generation/booklet-ai.ts";
import { createBookletPdf } from "../app/lib/pdf/booklet-pdf.ts";

const caseName = "m51-singapore-5-5d-homepage";
const matrix = new URL("../artifacts/booklets/matrix-2026-10-04/", import.meta.url);
const jsonDirectory = new URL("json/", matrix);
const pdfDirectory = new URL("pdfs/", matrix);
const publicDirectory = new URL("../public/samples/", import.meta.url);
const approvedCoverPath = "/illustrations/singapore-cover-line-art-v1.jpg";
const approvedCoverSource = new URL(`../public${approvedCoverPath}`, import.meta.url);
const renderExisting = process.argv.includes("--render-existing");
// --via-server generates through a running dev server (npm run dev), which
// has picture storage, so the reveal photos, page art and spot-the-
// difference pictures are made and read back from it. Without it the
// route runs in-process with no storage and those pictures are missing.
const viaServer = process.argv.includes("--via-server");
const serverUrl = process.env.TRIPQUEST_URL || "http://localhost:3000";

mkdirSync(jsonDirectory, { recursive: true });
mkdirSync(pdfDirectory, { recursive: true });
mkdirSync(publicDirectory, { recursive: true });

const started = performance.now();
const body = {
  destination: "Singapore",
  age: 5,
  days: 5,
  itinerary: ["", "", "", "", ""],
  family: [{
    id: "child-1",
    name: "Your child",
    age: 5,
    readingLevel: "pre-reader",
    interests: [],
    avoid: [],
    preferredMechanics: [],
  }],
};

const jsonPath = new URL(`${caseName}.json`, jsonDirectory);
const pdfPath = new URL(`${caseName}.pdf`, pdfDirectory);
const publicPath = new URL("tripquest-singapore-age-5-preview-20261004-m51.pdf", publicDirectory);
const legacyPublicPath = new URL("tripquest-singapore-age-5-preview.pdf", publicDirectory);

let booklet: GeneratedBookletData;
if (renderExisting) {
  booklet = JSON.parse(readFileSync(jsonPath, "utf8")) as GeneratedBookletData;
} else if (viaServer) {
  const response = await fetch(`${serverUrl}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: serverUrl },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(payload.error || `Generation returned HTTP ${response.status}.`);
  }
  booklet = await readGenerationResponse(response, (message) => {
    if (message) console.log(`[TripQuest homepage sample] ${message}`);
  }) as GeneratedBookletData;
} else {
  // Loaded only here: the route's own imports need the app's bundler.
  const { POST: generateBooklet } = await import("../app/api/generate/route.ts");
  const response = await generateBooklet(new Request("http://tripquest.local/api/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "cf-connecting-ip": "198.51.100.51",
    },
    body: JSON.stringify(body),
  }));

  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(payload.error || `Generation returned HTTP ${response.status}.`);
  }

  booklet = await readGenerationResponse(response, (message) => {
    if (message) console.log(`[TripQuest homepage sample] ${message}`);
  }) as GeneratedBookletData;
}

// Direct route invocation has no Cloudflare R2 binding. Pin the homepage to
// the approved Singapore sketch recovered from the reviewed matrix booklet
// instead of silently publishing the generic vector fallback.
if (!existsSync(approvedCoverSource)) throw new Error("Approved Singapore cover artwork is missing.");
booklet.coverIllustrationPath = approvedCoverPath;

const resolveAsset = async (path: string) => {
  if (!path.startsWith("/") || path.startsWith("//")) return null;
  if (path.startsWith("/api/illustration")) {
    const response = await fetch(new URL(path, viaServer ? serverUrl : "https://tripquestkids.com"));
    if (!response.ok) throw new Error(`Could not load stored artwork (${response.status}).`);
    return new Uint8Array(await response.arrayBuffer());
  }
  return new Uint8Array(await readFile(new URL(`../public${path}`, import.meta.url)));
};

const pdf = await createBookletPdf(booklet, undefined, resolveAsset, resolveAsset);

writeFileSync(jsonPath, `${JSON.stringify(booklet, null, 2)}\n`);
writeFileSync(pdfPath, pdf);
await copyFile(pdfPath, publicPath);
await copyFile(pdfPath, legacyPublicPath);

console.log(JSON.stringify({
  caseName,
  seconds: Math.round((performance.now() - started) / 1000),
  pages: booklet.dayPlans.length,
  json: jsonPath.pathname,
  pdf: pdfPath.pathname,
  publicPreview: publicPath.pathname,
  legacyPublicPreview: legacyPublicPath.pathname,
}, null, 2));
