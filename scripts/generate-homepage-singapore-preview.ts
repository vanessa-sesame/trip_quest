import { mkdirSync, writeFileSync } from "node:fs";
import { copyFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { POST as generateBooklet } from "../app/api/generate/route.ts";
import { readGenerationResponse } from "../app/lib/generation/stream.ts";
import type { GeneratedBookletData } from "../app/lib/generation/booklet-ai.ts";
import { createBookletPdf } from "../app/lib/pdf/booklet-pdf.ts";

const caseName = "m51-singapore-5-5d-homepage";
const matrix = new URL("../artifacts/booklets/matrix-2026-10-04/", import.meta.url);
const jsonDirectory = new URL("json/", matrix);
const pdfDirectory = new URL("pdfs/", matrix);
const publicDirectory = new URL("../public/samples/", import.meta.url);

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

const booklet = await readGenerationResponse(response, (message) => {
  if (message) console.log(`[TripQuest homepage sample] ${message}`);
}) as GeneratedBookletData;
const pdf = await createBookletPdf(booklet);

const jsonPath = new URL(`${caseName}.json`, jsonDirectory);
const pdfPath = new URL(`${caseName}.pdf`, pdfDirectory);
const publicPath = new URL("tripquest-singapore-age-5-preview-20261004-m51.pdf", publicDirectory);
const legacyPublicPath = new URL("tripquest-singapore-age-5-preview.pdf", publicDirectory);

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
