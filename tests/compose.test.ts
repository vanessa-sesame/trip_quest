import assert from "node:assert/strict";
import test from "node:test";
import { buildBooklet } from "../app/lib/booklet/booklet.ts";
import { bookletSchema, composeBookletBatch } from "../app/lib/generation/compose.ts";

function propertyNames(schema: unknown, path = "$"): Array<{ path: string; name: string }> {
  if (!schema || typeof schema !== "object") return [];
  const node = schema as Record<string, unknown>;
  const found: Array<{ path: string; name: string }> = [];
  if (node.properties && typeof node.properties === "object") {
    for (const [name, child] of Object.entries(node.properties as Record<string, unknown>)) {
      found.push({ path, name });
      found.push(...propertyNames(child, `${path}.${name}`));
    }
  }
  if (node.items) found.push(...propertyNames(node.items, `${path}[]`));
  return found;
}

test("no booklet schema object has a data property named like the JSON-Schema required keyword", () => {
  // Regression: whileYouWait had a boolean property literally named
  // "required" next to the schema's own "required" array, and Kimi returned
  // the whole object empty on every attempt, so every queue page printed
  // the "Count one repeated detail near…" placeholder instead of real content.
  for (const age of [3, 7, 12]) {
    const collisions = propertyNames(bookletSchema(3, age)).filter((entry) => entry.name === "required");
    assert.deepEqual(collisions, [], `age ${age}: ${JSON.stringify(collisions)}`);
  }
});


function usableDraftWithFillerLabels() {
  const [day] = buildBooklet(7, "Tokyo", 1);
  const four = (labels: string[]) => labels.map((label) => ({ label, clue: `Look for the ${label.toLowerCase()} near the station.` }));
  return {
    profile: {
      style: "Neon streets and quiet shrines",
      intro: "A family quest through Tokyo's busiest crossings and calmest gardens.",
      word: "arigatou (ah-ree-GAH-toh) - thank you",
      etiquette: "Stand on the left of escalators and keep voices low on trains.",
    },
    dayPlans: [{
      ...day,
      slots: {
        ...day.slots,
        inThePlace: { ...day.slots.inThePlace, gameType: "bingo", items: four(["First red lantern", "Second red lantern", "Third red lantern", "Fourth red lantern"]), requiresPresence: true },
        inThePlaceSecond: { ...day.slots.inThePlace, title: "Crossing Match", gameType: "matching", items: four(["Crossing", "Signal", "Crowd", "Screen"]), requiresPresence: true },
        sitDown: { ...day.slots.sitDown, gameType: "drawing", items: four(["Lantern", "Gate", "Crow", "Tower"]) },
      },
    }],
  };
}

test("an unusable final attempt falls back to the last draft that passed validation", async () => {
  const composeReplies = [JSON.stringify(usableDraftWithFillerLabels()), "{}", "{}"];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body));
    const isGrounding = body.response_format?.json_schema?.name === "grounding_check";
    const content = isGrounding ? JSON.stringify({ findings: [] }) : composeReplies.shift();
    return Response.json({ choices: [{ message: { content } }] });
  };
  try {
    const draft = await composeBookletBatch(
      "Tokyo", 7, 1, 0, [""], { notes: "Tokyo research notes.", sources: [] },
      "test-key", "kimi-k2.6", "Lead explorer age 7.", false, "Day 1: spot", [], [],
    );
    assert.equal(composeReplies.length, 0, "all three attempts were made");
    assert.equal(draft.dayPlans[0].slots.inThePlace.items?.[0].label, "First red lantern");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
