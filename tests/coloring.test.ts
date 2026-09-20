import assert from "node:assert/strict";
import test from "node:test";
import { coloringSceneFor } from "../app/coloring.ts";

const activity = (title: string, label = "DETAIL", clue = "A local detail to notice.") => ({
  title,
  items: [
    { label, clue },
    { label: "SHAPE", clue: "Compare the outline." },
    { label: "PATTERN", clue: "Find a repeated pattern." },
    { label: "COLOR", clue: "Notice a local color." },
  ],
});

test("landmark-aware coloring scenes recognize distinctive subjects", () => {
  assert.equal(coloringSceneFor(activity("Observation drawing"), "Gardens by the Bay Supertrees"), "supertree");
  assert.equal(coloringSceneFor(activity("Golden Dome Drawing Lab"), "Kampong Gelam"), "mosque");
  assert.equal(coloringSceneFor(activity("Railway Window Hunt"), "Kyoto Station"), "train");
  assert.equal(coloringSceneFor(activity("Colony Color Page", "PENGUIN"), "Boulders Beach"), "penguin");
  assert.equal(coloringSceneFor(activity("Fossil Shape Studio", "DINOSAUR")), "dinosaur");
});

test("unknown drawing subjects use a stable neutral skyline", () => {
  assert.equal(coloringSceneFor(activity("Mystery Shape Studio", "OBJECT")), "skyline");
  assert.equal(coloringSceneFor(activity("Another Unclassified Prompt", "THING")), "skyline");
});

test("activity subjects take precedence over mixed day context", () => {
  assert.equal(coloringSceneFor(activity("Market Observation Drawing"), "railway station and market"), "market");
  assert.equal(coloringSceneFor(activity("Mountain Observation Drawing"), "historic temple and mountain trail"), "mountain");
  assert.equal(coloringSceneFor(activity("Skyline Observation Drawing"), "Gardens by the Bay Supertrees"), "supertree");
});
