import { mkdirSync, writeFileSync } from "node:fs";
import { createBookletPdf } from "../app/lib/pdf/booklet-pdf.ts";
import { buildBooklet } from "../app/lib/booklet/booklet.ts";
import { defaultFamilyWorkspace, familyPackFor } from "../app/lib/family.ts";
import { enrichOfflinePreviewGameplay, type GeneratedBookletData } from "../app/lib/generation/booklet-ai.ts";
import { sampleGeneratedBooklet } from "../tests/fixtures/generated-booklet.ts";

const outputDirectory = new URL("../artifacts/booklets/samples/", import.meta.url);
mkdirSync(outputDirectory, { recursive: true });
const output = new URL("TripQuest-Singapore-Age-7.pdf", outputDirectory);
const pdf = await createBookletPdf(sampleGeneratedBooklet());
writeFileSync(output, pdf);
console.log(output.pathname);

const publicSampleDirectory = new URL("../public/samples/", import.meta.url);
mkdirSync(publicSampleDirectory, { recursive: true });
const sampleChildren = defaultFamilyWorkspace().children;
const singaporePreview: GeneratedBookletData = {
  destination: "Singapore",
  age: 5,
  days: 5,
  itinerary: Array(5).fill(""),
  profile: sampleGeneratedBooklet().profile,
  dayPlans: enrichOfflinePreviewGameplay(buildBooklet(5, "Singapore", 5), 5, "Singapore"),
  sources: sampleGeneratedBooklet().sources,
  generatedAt: "2026-10-04T00:00:00.000Z",
  family: sampleChildren,
};
const previewOutput = new URL("tripquest-singapore-age-5-preview.pdf", publicSampleDirectory);
const previewPdf = await createBookletPdf(singaporePreview, familyPackFor(sampleChildren, [], 5));
writeFileSync(previewOutput, previewPdf);
console.log(previewOutput.pathname);
