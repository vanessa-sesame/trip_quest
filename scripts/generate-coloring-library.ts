// Batch-generates curated printable line art for every ColoringScene that
// currently has no imagePath in app/lib/booklet/coloring.ts's coloringIllustrationSpecs
// — the eight scenes added 2026-09-22 (canal, windmill, bicycle, machine,
// boat, statue, playground, artwork), plus "skyline", whose old asset was
// removed for actually depicting a specific real landmark (Marina Bay
// Sands, Singapore) rather than a generic city. Safe to re-run: only
// targets scenes still missing an imagePath.
//
// Each prompt explicitly asks for an INVENTED, non-landmark-specific scene,
// unlike the per-booklet illustration prompts in app/lib/generation/illustration-ai.ts
// (which intentionally depict the real named place) — these are meant to
// work as a generic fallback for any destination, so they must not
// accidentally become a new mislabeled-specific-place bug themselves.
//
// Requires OPENAI_API_KEY (and optionally OPENAI_IMAGE_MODEL) — run with:
//   node --experimental-strip-types --env-file=.env.local scripts/generate-coloring-library.ts
//
// After a successful run, add the printed imagePath back into each
// scene's entry in app/lib/booklet/coloring.ts's coloringIllustrationSpecs — this
// script does not edit that file, to avoid fragile source rewriting.

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { coloringIllustrationSpecs, coloringScenes, type ColoringScene } from "../app/lib/booklet/coloring.ts";
import { generatePng } from "../app/lib/generation/illustration-ai.ts";

const ILLUSTRATIONS_DIR = fileURLToPath(new URL("../public/illustrations/", import.meta.url));
const MANIFEST_PATH = fileURLToPath(new URL("../public/illustrations/manifest.json", import.meta.url));

type ManifestAsset = {
  scene: string;
  file: string;
  source: string;
  style: string;
  usage: string;
};

type Manifest = {
  version: number;
  sceneLibrary: string[];
  assets: ManifestAsset[];
};

function genericScenePrompt(scene: ColoringScene) {
  const spec = coloringIllustrationSpecs[scene];
  return [
    "Create a premium black-and-white printable children's coloring-book illustration.",
    `The subject is ${spec.subject}.`,
    "This must be a GENERIC, invented scene, not a real identifiable landmark, building, statue, or place anywhere in the world. Do not depict any specific named monument, city skyline, or famous structure — keep it recognizable as a category, not a place.",
    "Editorial coloring-book line art printed on pure white paper: confident dark teal-black outlines, varied line weight, elegant small details, and large closed white areas that can be colored.",
    "Absolutely no black or gray background, no dark sky, no gradient, no glow, no shadow, and no large filled areas.",
    "Portrait composition with one dominant subject and only a few contextual objects. No decorative frame.",
    "Do not include words, letters, numbers, logos, watermarks, captions, UI, bingo squares, or colored fills.",
  ].join(" ");
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    console.error(
      "OPENAI_API_KEY is missing. Run with:\n" +
      "  node --experimental-strip-types --env-file=.env.local scripts/generate-coloring-library.ts",
    );
    process.exit(1);
  }
  const model = process.env.OPENAI_IMAGE_MODEL?.trim() || "gpt-image-1-mini";

  const targets = coloringScenes.filter((scene) => !coloringIllustrationSpecs[scene].imagePath);
  if (!targets.length) {
    console.log("Every scene already has an imagePath in coloringIllustrationSpecs. Nothing to do.");
    return;
  }

  console.log(`Generating ${targets.length} scene(s): ${targets.join(", ")}\n`);
  await mkdir(ILLUSTRATIONS_DIR, { recursive: true });

  const manifest: Manifest = existsSync(MANIFEST_PATH)
    ? JSON.parse(await readFile(MANIFEST_PATH, "utf8"))
    : { version: 2, sceneLibrary: [], assets: [] };

  const succeeded: ColoringScene[] = [];
  const failed: Array<{ scene: ColoringScene; message: string }> = [];

  for (const scene of targets) {
    process.stdout.write(`  ${scene}... `);
    try {
      const png = await generatePng(apiKey, model, genericScenePrompt(scene));
      const filename = `${scene}-coloring-v1.png`;
      await writeFile(`${ILLUSTRATIONS_DIR}${filename}`, png);
      manifest.assets = manifest.assets.filter((asset) => asset.scene !== scene);
      manifest.assets.push({
        scene,
        file: filename,
        source: "OpenAI image generation",
        style: "printable editorial line art",
        usage: "TripQuest preview and printable PDF",
      });
      if (!manifest.sceneLibrary.includes(scene)) manifest.sceneLibrary.push(scene);
      succeeded.push(scene);
      console.log(`done (${png.length} bytes)`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failed.push({ scene, message });
      console.log(`FAILED: ${message}`);
    }
  }

  if (succeeded.length) {
    await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  }

  console.log(`\n${succeeded.length}/${targets.length} succeeded.`);
  if (succeeded.length) {
    console.log("\nAdd these imagePaths back into app/lib/booklet/coloring.ts's coloringIllustrationSpecs:");
    for (const scene of succeeded) {
      console.log(`  ${scene}: imagePath: "/illustrations/${scene}-coloring-v1.png"`);
    }
  }
  if (failed.length) {
    console.log("\nStill missing (re-run this script later to retry just these):");
    for (const { scene, message } of failed) {
      console.log(`  ${scene}: ${message}`);
    }
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
