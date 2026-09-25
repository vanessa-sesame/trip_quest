import assert from "node:assert/strict";
import test from "node:test";
import { coloringPageSpec, coloringSceneFor, coloringVariantFor, curatedColoringImagePath } from "../app/lib/booklet/coloring.ts";

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
  assert.equal(coloringSceneFor(activity("Merlion Color Bingo", "TOWER", "A round tower shape."), "garden skyline"), "merlion");
  assert.equal(coloringSceneFor(activity("Temple Guardian Coloring", "TOWER", "Color the tower guardians."), "temple tower"), "guardian");
  assert.equal(coloringSceneFor(activity("Peranakan Tile Pattern Drawing", "SHOPHOUSE", "Draw the repeating nyonya motif."), "Katong-Joo Chiat shophouses"), "tile");
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

test("the neutral skyline fallback has no curated image (it is not a real landmark)", () => {
  // skyline-coloring-v1.png was removed: it depicted a specific real
  // landmark (Marina Bay Sands, Singapore), not a generic city, and was
  // being shown for every unmatched subject worldwide via this fallback.
  assert.equal(curatedColoringImagePath(activity("Mystery Shape Studio", "OBJECT")), undefined);
});

test("newer scene keywords route to their own scene, not the generic fallback", () => {
  assert.equal(coloringSceneFor(activity("Draw the Secret Cycle Path"), "a bicycle path through the museum"), "bicycle");
  assert.equal(coloringSceneFor(activity("Canal House Sketch")), "canal");
  assert.equal(coloringSceneFor(activity("Windmill Studio")), "windmill");
  assert.equal(coloringSceneFor(activity("Draw Your Chain Reaction"), "an invented machine with gears"), "machine");
  assert.equal(coloringSceneFor(activity("Harbor Boat Sketch"), "a small sailboat"), "boat");
  assert.equal(coloringSceneFor(activity("Playground Studio")), "playground");
  assert.equal(coloringSceneFor(activity("Gallery Sketch"), "a painting in the gallery"), "artwork");
});

test("a generic statue no longer borrows the Asian temple-guardian image", () => {
  // "statue"/"sculpture"/"idol" alone used to match "guardian" (a specific
  // Southeast/East Asian temple-guardian lion) regardless of context.
  assert.equal(coloringSceneFor(activity("Bronze Statue Sketch"), "a European statue"), "statue");
  assert.equal(coloringSceneFor(activity("Museum Sculpture Studio")), "statue");
  // Genuine temple-guardian phrasing still matches guardian.
  assert.equal(coloringSceneFor(activity("Guardian Statue Studio"), "temple guardian statue"), "guardian");
});

test("a generic mosaic or old town no longer borrows Singapore-specific art", () => {
  // "mosaic"/"ceramic"/"geometric pattern" alone used to match "tile" (a
  // specific Peranakan/Singapore motif) — confirmed live: a Barcelona
  // Gaudí-mosaic activity got routed here via a sibling activity's
  // unrelated "Mosaic" title and was labeled "PERANAKAN TILE MOTIF".
  assert.equal(coloringSceneFor(activity("Mosaic Pattern Studio"), "Gaudí trencadís mosaic tilework"), "skyline");
  assert.equal(coloringSceneFor(activity("Ceramic Pattern Studio")), "skyline");
  // Genuine Peranakan/Nyonya phrasing still matches tile.
  assert.equal(coloringSceneFor(activity("Peranakan Tile Studio")), "tile");
  // "old town"/"lantern"/"street shop" alone used to match "shophouse" (a
  // specific Singapore/Malaysia architecture style).
  assert.equal(coloringSceneFor(activity("Lantern Festival Sketch"), "the old town street shops"), "skyline");
  // Genuine shophouse phrasing still matches shophouse.
  assert.equal(coloringSceneFor(activity("Shophouse Facade Studio")), "shophouse");
});

test("activity subjects take precedence over mixed day context", () => {
  assert.equal(coloringSceneFor(activity("Market Observation Drawing"), "railway station and market"), "market");
  assert.equal(coloringSceneFor(activity("Mountain Observation Drawing"), "historic temple and mountain trail"), "mountain");
  assert.equal(coloringSceneFor(activity("Skyline Observation Drawing"), "Gardens by the Bay Supertrees"), "supertree");
});

test("specific title subjects outrank generic item and context subjects", () => {
  assert.equal(
    coloringSceneFor(activity("Merlion Color Bingo", "GARDEN", "Find the tower."), "Singapore garden tower"),
    "merlion",
  );
  assert.equal(
    coloringSceneFor(activity("Temple Guardian Coloring", "TOWER", "Find the garden."), "tower garden"),
    "guardian",
  );
  assert.equal(
    coloringSceneFor(activity("Peranakan Tile Pattern Drawing", "SHOPHOUSE", "Look at the shophouse wall."), "shophouse street"),
    "tile",
  );
});

test("same subject can use distinct stable picture compositions", () => {
  const variants = new Set([
    coloringVariantFor(activity("Supertree coloring page", "TREE"), "Gardens by the Bay"),
    coloringVariantFor(activity("Supertree detail hunt", "CANOPY"), "Gardens by the Bay"),
    coloringVariantFor(activity("Supertree skyway sketch", "SKYWAY"), "Gardens by the Bay"),
  ]);
  assert.ok(variants.size >= 2);
  assert.equal(
    coloringVariantFor(activity("Supertree coloring page", "TREE"), "Gardens by the Bay"),
    coloringVariantFor(activity("Supertree coloring page", "TREE"), "Gardens by the Bay"),
  );
});

test("same landmark cycles picture compositions across repeated trip days", () => {
  const subject = activity("Supertree coloring page", "TREE");
  assert.deepEqual(
    [1, 2, 3].map((day) => coloringVariantFor(subject, `Gardens by the Bay - day ${day} - game 1`)),
    [0, 1, 2],
  );
});

test("coloring pages use four activity items plus destination challenges and a free cell", () => {
  const page = coloringPageSpec(
    activity("Merlion Color Bingo", "MANE", "Find the lion mane."),
    "Merlion Park - day 1 - game 1",
  );
  assert.equal(page.scene, "merlion");
  assert.equal(page.cells.length, 9);
  assert.equal(page.cells[4].kind, "free");
  assert.equal(page.cells.filter((cell) => cell.kind === "item").length, 4);
  assert.equal(page.cells.filter((cell) => cell.kind === "challenge").length, 4);
  assert.equal(page.traceWord, "MERLION");
  assert.equal(page.localClue, "Find the lion mane.");
  assert.equal(page.illustration.imagePath, "/illustrations/merlion-coloring-v1.png");
});

test("tile title wins over shophouse context in the shared page spec", () => {
  const page = coloringPageSpec(
    activity("Peranakan Tile Pattern Drawing", "SHOPHOUSE", "Look at the shophouse wall."),
    "Katong-Joo Chiat shophouses",
  );
  assert.equal(page.scene, "tile");
  assert.equal(page.illustration.label, "Peranakan tile motif");
  assert.match(page.illustration.subject, /repeating geometric tile pattern/i);
});

test("Paris activities use the curated Eiffel Tower artwork instead of the generic tower", () => {
  const eiffel = activity("Color the Three Levels", "LEVEL 1", "Find the broad lower platform.");
  const context = "Eiffel Tower Iron Giant, Paris";
  assert.equal(curatedColoringImagePath(eiffel, context), "/illustrations/eiffel-tower-coloring-v1.png");
  assert.equal(coloringPageSpec(eiffel, context).illustration.imagePath, "/illustrations/eiffel-tower-coloring-v1.png");
});
