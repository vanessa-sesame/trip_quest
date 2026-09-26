import assert from "node:assert/strict";
import test from "node:test";
import { buildBooklet } from "../app/lib/booklet/booklet.ts";
import { bookletSchema, composeBookletBatch, secondaryGamePlan } from "../app/lib/generation/compose.ts";
import { balancedGameTypePlanForTrip } from "../app/lib/generation/booklet-ai.ts";

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

test("a draft with a filler-label game is fixed by rewriting only that game", async () => {
  const draft = usableDraftWithFillerLabels();
  const repairedGame = {
    ...draft.dayPlans[0].slots.inThePlace,
    items: ["Red lantern", "Paper crane", "Stone lion", "Shrine bell"].map((label) => ({ label, clue: `Look for the ${label.toLowerCase()} near the station.` })),
  };
  const requests: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body));
    const name = body.response_format?.json_schema?.name;
    requests.push(name);
    const content = name === "grounding_check"
      ? JSON.stringify({ findings: [] })
      : name === "tripquest_repair"
        ? JSON.stringify({ games: [{ day: 1, slot: "inThePlace", activity: repairedGame }] })
        : JSON.stringify(draft);
    return Response.json({ choices: [{ message: { content } }] });
  };
  try {
    const result = await composeBookletBatch(
      "Tokyo", 7, 1, 0, [""], { notes: "Tokyo research notes.", sources: [] },
      "test-key", "kimi-k2.6", "Lead explorer age 7.", false, "Day 1: spot", [], [],
    );
    assert.deepEqual(requests.filter((name) => name === "tripquest_booklet").length, 1, "the day is composed once");
    assert.ok(requests.includes("tripquest_repair"), "the bad game is repaired on its own");
    assert.equal(result.dayPlans[0].slots.inThePlace.items?.[0].label, "Red lantern");
    assert.equal(result.dayPlans[0].slots.inThePlace.title, draft.dayPlans[0].slots.inThePlace.title, "the title is kept");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a failed repair keeps the composed draft instead of failing the day", async () => {
  const draft = usableDraftWithFillerLabels();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_input, init) => {
    const name = JSON.parse(String(init?.body)).response_format?.json_schema?.name;
    const content = name === "grounding_check" ? JSON.stringify({ findings: [] }) : name === "tripquest_repair" ? "{}" : JSON.stringify(draft);
    return Response.json({ choices: [{ message: { content } }] });
  };
  try {
    const result = await composeBookletBatch(
      "Tokyo", 7, 1, 0, [""], { notes: "Tokyo research notes.", sources: [] },
      "test-key", "kimi-k2.6", "Lead explorer age 7.", false, "Day 1: spot", [], [],
    );
    assert.equal(result.dayPlans[0].slots.inThePlace.items?.[0].label, "First red lantern");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("second in-place and queue games are varied across the trip", () => {
  let consecutiveQueueRepeats = 0;
  for (const age of [3, 5, 7, 9, 11, 14]) {
    for (const destination of ["Barcelona", "Kyoto", "Lima"]) {
      const plan = balancedGameTypePlanForTrip(age, 7, [], destination);
      const secondary = secondaryGamePlan(age, plan, destination);
      secondary.forEach((day, index) => {
        const types = [plan[index].gameTypes[0], day.second, plan[index].gameTypes[1]];
        assert.equal(new Set(types).size, 3, `age ${age} ${destination} day ${day.day}: ${types.join("/")}`);
        if (day.queue) assert.ok(!types.includes(day.queue), `queue game repeats a day game on day ${day.day}`);
        if (index > 0) {
          assert.notEqual(day.second, secondary[index - 1].second, `second game repeats on day ${day.day}`);
          // Young ages have only four queue-friendly types, so a repeat is
          // occasionally unavoidable; it must stay rare.
          if (day.queue && day.queue === secondary[index - 1].queue) consecutiveQueueRepeats += 1;
        }
      });
    }
  }
  assert.ok(consecutiveQueueRepeats <= 4, `${consecutiveQueueRepeats} consecutive queue repeats across 18 week-long trips`);
});
