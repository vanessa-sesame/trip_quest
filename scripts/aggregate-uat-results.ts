import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type Result = {
  id: number;
  status: "passed" | "failed";
  destination: string;
  age: number;
  days: number;
  placeScale: string;
  totalSeconds: number;
  retries: number;
  calculatedCostUsd: number;
  pdfPages: number;
  qualityWarnings: string[];
  error?: string;
};

const root = join(process.cwd(), "tmp", "pdfs");
const batchNames = ["tripquest-parent-50-uat", "uat-batch-01", "uat-batch-02", "uat-batch-03", "uat-batch-04", "uat-batch-05"];
const results = batchNames.flatMap((batch) => {
  const path = join(root, batch, "results.json");
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) as Result[] : [];
}).sort((left, right) => left.id - right.id);
const passed = results.filter((result) => result.status === "passed");
const failed = results.filter((result) => result.status === "failed");
const totalSeconds = results.reduce((sum, result) => sum + result.totalSeconds, 0);
const calculatedCostUsd = results.reduce((sum, result) => sum + result.calculatedCostUsd, 0);
const rows = results.map((result) => {
  const notes = result.status === "passed"
    ? result.qualityWarnings.join("; ") || "All quality checks passed"
    : result.error || result.qualityWarnings.join("; ") || "Unknown failure";
  return "| " + result.id + " | " + result.destination.replaceAll("|", "\\|") + " | " +
    result.age + " | " + result.days + " | " + result.placeScale + " | " +
    result.status + " | " + result.totalSeconds.toFixed(1) + " | " +
    result.calculatedCostUsd.toFixed(6) + " | " + result.retries + " | " +
    (result.pdfPages || "-") + " | " + notes.replaceAll("|", "\\|") + " |";
});
const markdown = [
  "# TripQuest Parent UAT: 50 Destinations",
  "",
  "Run date: " + new Date().toISOString(),
  "",
  "Summary: " + passed.length + "/50 passed, " + failed.length + " failed, " +
    Math.round(totalSeconds / Math.max(results.length, 1)) + "s average case runtime, $" +
    calculatedCostUsd.toFixed(6) + " calculated API cost.",
  "",
  "| # | Destination | Age | Days | Scale | Status | Seconds | Cost (USD) | Retries | PDF pages | Notes |",
  "|---:|---|---:|---:|---|---|---:|---:|---:|---:|---|",
  ...rows,
  "",
  "Failure categories",
  "",
  "- Research/provider failures: " + failed.filter((result) => /research|source|aborted|operation/i.test(result.error || "")).length,
  "- Model content-shape failures: " + failed.filter((result) => /label|length|game/i.test(result.error || "")).length,
].join("\n");
writeFileSync(join(root, "tripquest-parent-50-uat.md"), markdown + "\n");
writeFileSync(join(root, "tripquest-parent-50-uat.json"), JSON.stringify({
  generatedAt: new Date().toISOString(),
  cases: results.length,
  passed: passed.length,
  failed: failed.length,
  averageSeconds: results.length ? totalSeconds / results.length : 0,
  calculatedCostUsd,
  results,
}, null, 2) + "\n");
console.log("Wrote " + results.length + " results: " + passed.length + " passed, " + failed.length + " failed.");
