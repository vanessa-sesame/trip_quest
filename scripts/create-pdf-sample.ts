import { mkdirSync, writeFileSync } from "node:fs";
import { createBookletPdf } from "../app/lib/pdf/booklet-pdf.ts";
import { sampleGeneratedBooklet } from "../tests/fixtures/generated-booklet.ts";

const outputDirectory = new URL("../artifacts/booklets/samples/", import.meta.url);
mkdirSync(outputDirectory, { recursive: true });
const output = new URL("TripQuest-Singapore-Age-7.pdf", outputDirectory);
const pdf = await createBookletPdf(sampleGeneratedBooklet());
writeFileSync(output, pdf);
console.log(output.pathname);
