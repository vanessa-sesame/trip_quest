import assert from "node:assert/strict";
import { claudeKind, claudeResponse, claudeUserText } from "./helpers/claude.ts";
import test from "node:test";
import { buildBooklet } from "../app/lib/booklet/booklet.ts";
import {
  bookletSchema,
  composeBooklet,
  composeBookletBatch,
  repeatedLandmarkDays,
  secondaryGamePlan,
  withPlaceThemes,
} from "../app/lib/generation/compose.ts";
import {
  adaptGameTypePlanForTravelDays,
  allowedGameTypesForAge,
  balancedGameTypePlanForTrip,
  travelDayGameTypes,
} from "../app/lib/generation/booklet-ai.ts";
import { withTravelDayPlanCheck } from "../app/lib/generation/research.ts";
import { interestPlanForTrip, normalizeFamilyChildren } from "../app/lib/family.ts";

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
    const name = claudeKind(init);
    requests.push(name);
    const content = name === "grounding_check"
      ? JSON.stringify({ findings: [] })
      : name === "tripquest_repair"
        ? JSON.stringify({ games: [{ day: 1, slot: "inThePlace", activity: repairedGame }] })
        : JSON.stringify(draft);
    return claudeResponse(content);
  };
  try {
    const result = await composeBookletBatch(
      "Tokyo", 7, 1, 0, [""], { notes: "Tokyo research notes.", sources: [] },
      "test-key", "claude-sonnet-5-5", "Lead explorer age 7.", false, "Day 1: spot", [], [],
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
    const name = claudeKind(init);
    const content = name === "grounding_check" ? JSON.stringify({ findings: [] }) : name === "tripquest_repair" ? "{}" : JSON.stringify(draft);
    return claudeResponse(content);
  };
  try {
    const result = await composeBookletBatch(
      "Tokyo", 7, 1, 0, [""], { notes: "Tokyo research notes.", sources: [] },
      "test-key", "claude-sonnet-5-5", "Lead explorer age 7.", false, "Day 1: spot", [], [],
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

test("flagged reveal claims are rewritten from the research instead of blanked", async () => {
  const draft = usableDraftWithFillerLabels();
  draft.dayPlans[0].slots.inThePlace = { ...draft.dayPlans[0].slots.inThePlace, items: ["Red lantern", "Paper crane", "Stone lion", "Shrine bell"].map((label) => ({ label, clue: `Look for the ${label.toLowerCase()} near the station.` })) };
  const requests: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_input, init) => {
    const name = claudeKind(init);
    requests.push(name);
    const content = name === "grounding_check"
      ? JSON.stringify({ findings: [{ day: 1, field: "questReveal.targetLabel", issue: "Belongs to another stop." }] })
      : name === "tripquest_reveal_fix"
        ? JSON.stringify({ days: [{ day: 1, targetLabel: "STONE LION", targetKind: "object", bonusQuest: "Find the lion with an open mouth!", revealText: "Here it is! The stone lions guard the shrine gate.", chatPrompts: ["Why do you think lions guard gates?", "Which lion looked friendliest?"], factCard: [] }] })
        : JSON.stringify(draft);
    return claudeResponse(content);
  };
  try {
    const result = await composeBookletBatch(
      "Tokyo", 7, 1, 0, [""], { notes: "Tokyo research notes.", sources: [] },
      "test-key", "claude-sonnet-5-5", "Lead explorer age 7.", false, "Day 1: spot", [], [],
    );
    assert.ok(requests.includes("tripquest_reveal_fix"));
    assert.equal(result.dayPlans[0].slots.questReveal?.targetLabel, "STONE LION");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a theme copied from the quest plan becomes the day's landmark", () => {
  const [day] = buildBooklet(9, "Barcelona", 1);
  const fixed = withPlaceThemes({ profile: {} as never, dayPlans: [{ ...day, theme: "draw + imagine" }] });
  assert.equal(fixed.dayPlans[0].theme, day.landmark.display);
  const kept = withPlaceThemes({ profile: {} as never, dayPlans: [{ ...day, theme: "Dragon mosaics of Park Guell" }] });
  assert.equal(kept.dayPlans[0].theme, "Dragon mosaics of Park Guell");
});

// The cleaned Ipoh plans: days 1 and 4 are only flights and hotel time.
const IPOH_PLANS = [
  "Flight: Scoot TR484 Singapore to Ipoh 12:35–13:50; Hotel: Check in at TUI BLUE The Haven Ipoh, Two-Bedroom Suite",
  "Attraction: Kek Lok Tong + gardens in the morning; Meal: Old Town for lunch; Attraction: short Old Town wander / street art",
  "Attraction: Lost World of Tambun from around 11:00am; Focus on animals, train/dry activities and suitable kids' rides",
  "Meal: Breakfast; Hotel: pack and enjoy the hotel a little; Travel: leave around 11:30am; Flight: Scoot TR485 Ipoh to Singapore 14:40–15:55",
];
const IPOH_TRAVEL_DAYS = [true, false, false, true];
const SITE_GAMES = ["bingo", "scavenger_hunt", "map_puzzle"];

function draftAt(place: string) {
  const [day] = buildBooklet(7, "Ipoh", 1);
  const four = (labels: string[]) => labels.map((label) => ({ label, clue: `Look for the ${label.toLowerCase()} today.` }));
  return {
    profile: {
      style: "Limestone hills and old shophouses",
      intro: "A family quest through Ipoh's caves, lanes and limestone hills.",
      word: "terima kasih (tuh-REE-mah KAH-see) - thank you",
      etiquette: "Keep voices low in temples and ask before taking photos.",
    },
    dayPlans: [{
      ...day,
      theme: `${place} quest`,
      landmark: { display: `${place}: Look Closely`, short: "the place", place },
      slots: {
        ...day.slots,
        inThePlace: { ...day.slots.inThePlace, title: `${place} Match`, gameType: "matching", items: four(["Window", "Wing", "Seatbelt", "Tray"]), requiresPresence: true },
        inThePlaceSecond: { ...day.slots.inThePlace, title: `${place} Maze`, gameType: "maze", items: four(["Gate", "Runway", "Cloud", "Hill"]), requiresPresence: true },
        sitDown: { ...day.slots.sitDown, title: `${place} Story`, gameType: "story", items: four(["Suitcase", "Ticket", "Passport", "Snack"]) },
      },
    }],
  };
}

test("a travel day is composed around its journey and hotel, told what the other days cover", async () => {
  const prompts: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_input, init) => {
    const name = claudeKind(init);
    if (name === "tripquest_booklet") prompts.push(claudeUserText(init));
    return claudeResponse(name === "grounding_check" ? { findings: [] } : draftAt("Sultan Azlan Shah Airport"));
  };
  try {
    const plan = balancedGameTypePlanForTrip(7, 4, [], "Ipoh");
    await composeBookletBatch(
      "Ipoh", 7, 4, 0, [IPOH_PLANS[0]], { notes: "Ipoh research notes.", sources: [] },
      "test-key", "claude-sonnet-5-5", "Lead explorer age 7.", false, "Day 1: spot", plan, [],
      undefined, { itinerary: IPOH_PLANS, travelDays: IPOH_TRAVEL_DAYS },
    );
    await composeBookletBatch(
      "Ipoh", 7, 4, 1, [IPOH_PLANS[1]], { notes: "Ipoh research notes.", sources: [] },
      "test-key", "claude-sonnet-5-5", "Lead explorer age 7.", false, "Day 2: spot", plan, [],
      undefined, { itinerary: IPOH_PLANS, travelDays: IPOH_TRAVEL_DAYS },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
  const [travel, visit] = prompts;
  assert.match(travel, /Day 1: TRAVEL DAY \(arrival; journey and hotel only, no sightseeing planned\) - Flight: Scoot TR484/);
  assert.match(travel, /\nTRAVEL DAYS\nDay 1 is a travel day/);
  assert.match(travel, /Do not invent a visit to a landmark/);
  assert.match(travel, /OTHER DAYS OF THIS TRIP[\s\S]*Day 2: Attraction: Kek Lok Tong[\s\S]*Day 4: travel day \(/);
  const schedule = travel.match(/^Day 1: inThePlace .+$/m)?.[0] ?? "";
  assert.ok(schedule, "the day has a game schedule");
  for (const gameType of SITE_GAMES) assert.doesNotMatch(schedule, new RegExp(`\\b${gameType}\\b`), schedule);

  assert.doesNotMatch(visit, /\nTRAVEL DAYS\n/);
  assert.match(visit, /Day 2: Attraction: Kek Lok Tong/);
  assert.match(visit, /OTHER DAYS OF THIS TRIP[\s\S]*Day 1: travel day \(/);
});

test("a day that repeats another day's unplanned landmark is composed again without it", async () => {
  // Live Ipoh run: both travel days came back as "Ipoh Railway Station".
  const prompts: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_input, init) => {
    const name = claudeKind(init);
    if (name === "grounding_check") return claudeResponse({ findings: [] });
    const user = claudeUserText(init);
    prompts.push(user);
    const day = Number(user.match(/^Create days (\d+) through/)?.[1]);
    const place = /must not be about/.test(user)
      ? "Sultan Azlan Shah Airport"
      : day === 2 ? "Kek Lok Tong" : "Ipoh Railway Station";
    return claudeResponse(draftAt(place));
  };
  try {
    const plans = [IPOH_PLANS[0], IPOH_PLANS[1], IPOH_PLANS[3]];
    const result = await composeBooklet(
      "Ipoh", 7, 3, plans, { notes: "Ipoh research notes.", sources: [] },
      "test-key", "claude-sonnet-5-5", "Lead explorer age 7.", false, "Day 1: spot", balancedGameTypePlanForTrip(7, 3, [], "Ipoh"), [],
    );
    const places = result.dayPlans.map((day) => day.landmark.place);
    assert.deepEqual(places, ["Ipoh Railway Station", "Kek Lok Tong", "Sultan Azlan Shah Airport"]);
    assert.equal(prompts.length, 4, "only the repeated day is composed again");
    assert.match(prompts[3], /Day 3 must not be about Ipoh Railway Station: day 1 already uses it as its main subject\. Day 3 is a travel day/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("repeated landmarks are only allowed when the family listed them on both days", () => {
  const itinerary = ["Flight to Ipoh; Hotel: check in at TUI BLUE", "Kek Lok Tong", "Kek Lok Tong again at sunset", "Flight home"];
  const travel = [true, false, false, true];
  assert.deepEqual(
    repeatedLandmarkDays([
      { day: 1, place: "Ipoh Railway Station" },
      { day: 2, place: "Kek Lok Tong" },
      { day: 3, place: "Kek Lok Tong" },
      { day: 4, place: "Ipoh Railway Station" },
    ], itinerary, travel),
    [{ day: 4, otherDay: 1, place: "Ipoh Railway Station" }],
  );
  assert.deepEqual(repeatedLandmarkDays([
    { day: 1, place: "TUI BLUE The Haven Ipoh" },
    { day: 4, place: "TUI BLUE The Haven Ipoh" },
  ], itinerary, travel), [], "two travel days may share the hotel");
  assert.deepEqual(repeatedLandmarkDays([
    { day: 1, place: "Ipoh Old Town" },
    { day: 2, place: "Kek Lok Tong Cave Temple" },
    { day: 3, place: "Old Town" },
  ], ["", "Kek Lok Tong", "Old Town murals"], []), [{ day: 1, otherDay: 3, place: "Ipoh Old Town" }]);
});

test("travel days get seated games and keep the trip's variety", () => {
  let neighbourRepeats = 0;
  let travelDayCount = 0;
  for (const age of [3, 5, 7, 9, 11, 14]) {
    for (const destination of ["Ipoh", "Kyoto", "Lima"]) {
      for (const days of [2, 4, 7]) {
        const travelDays = Array.from({ length: days }, (_, index) => index === 0 || index === days - 1);
        const base = balancedGameTypePlanForTrip(age, days, [], destination);
        const plan = adaptGameTypePlanForTravelDays(base, travelDays, age, []);
        const secondary = secondaryGamePlan(age, plan, destination, travelDays);
        plan.forEach((day, index) => {
          if (!travelDays[index]) {
            assert.deepEqual(day.gameTypes, base[index].gameTypes, "a visit day keeps its planned games");
            return;
          }
          travelDayCount += 1;
          const types = [day.gameTypes[0], secondary[index].second, day.gameTypes[1]];
          const label = `age ${age} ${destination} ${days}d day ${day.day}: ${types.join("/")} queue ${secondary[index].queue}`;
          assert.equal(new Set(types).size, 3, label);
          for (const gameType of [...types, secondary[index].queue].filter(Boolean)) {
            assert.ok(travelDayGameTypes.includes(gameType!), label);
            assert.ok(allowedGameTypesForAge(age).includes(gameType!), label);
          }
          const neighbours = [...(plan[index - 1]?.gameTypes ?? []), ...(plan[index + 1]?.gameTypes ?? [])];
          if (day.gameTypes.some((gameType) => neighbours.includes(gameType))) neighbourRepeats += 1;
          if (index > 0) assert.notEqual(secondary[index].second, secondary[index - 1].second, label);
        });
        // Adapting twice changes nothing, so every batch sees one schedule.
        assert.deepEqual(adaptGameTypePlanForTravelDays(plan, travelDays, age, []), plan);
      }
    }
  }
  assert.ok(neighbourRepeats <= Math.floor(travelDayCount / 10), `${neighbourRepeats} of ${travelDayCount} travel days repeat a neighbour's game`);
});

test("the Ipoh family's travel days swap site games for seated ones without an extra drawing page", () => {
  const family = normalizeFamilyChildren([
    { name: "Edwin", age: 5, interests: ["dinosaurs", "drawing", "trains"] },
    { name: "Chris", age: 7, interests: ["space", "science", "pokemon"] },
  ]);
  const interests = interestPlanForTrip(family, 4);
  const plan = adaptGameTypePlanForTravelDays(balancedGameTypePlanForTrip(5, 4, interests, "Ipoh"), IPOH_TRAVEL_DAYS, 5, interests);
  const secondary = secondaryGamePlan(5, plan, "Ipoh", IPOH_TRAVEL_DAYS);
  for (const index of [0, 3]) {
    for (const gameType of [...plan[index].gameTypes, secondary[index].second, secondary[index].queue].filter(Boolean)) {
      assert.ok(!SITE_GAMES.includes(gameType!), `day ${index + 1}: ${gameType}`);
    }
  }
  assert.equal(plan.flatMap((day) => day.gameTypes).filter((gameType) => gameType === "drawing").length, 1);
  assert.ok(new Set(plan.flatMap((day) => day.gameTypes)).size >= 6, JSON.stringify(plan));
});

test("a plan check that only questions a travel day's flight or hotel does not stop the booklet", () => {
  const notes = (check: string) => ({ notes: `DESTINATION_CHECK: OK\nPLAN_CHECK: ${check}\n\nIpoh notes…`, sources: [] });
  assert.match(withTravelDayPlanCheck(notes("Day 1: Scoot TR484 is a flight, not a place in Ipoh."), IPOH_PLANS).notes, /PLAN_CHECK: OK\n/);
  assert.match(withTravelDayPlanCheck(notes("Day 4 lists an airline and hotel rather than a stop."), IPOH_PLANS).notes, /PLAN_CHECK: OK\n/);
  assert.match(withTravelDayPlanCheck(notes("Scoot is an airline, not a place."), IPOH_PLANS).notes, /PLAN_CHECK: OK\n/);
  assert.match(withTravelDayPlanCheck(notes("Day 2: Kek Lok Tong is in Ipoh but Old Town is unclear."), IPOH_PLANS).notes, /PLAN_CHECK: Day 2/);
  assert.match(withTravelDayPlanCheck(notes("Day 1: Louvre is in Paris."), ["Louvre", "Kek Lok Tong"]).notes, /PLAN_CHECK: Day 1: Louvre/);
});

test("a site game the composer slips into a travel day is repaired into a seated one", async () => {
  const draft = draftAt("Sultan Azlan Shah Airport");
  const day = draft.dayPlans[0];
  day.slots.inThePlaceSecond = { ...day.slots.inThePlaceSecond!, gameType: "bingo" };
  day.slots.whileYouWait = {
    ...day.slots.whileYouWait,
    gameType: "scavenger_hunt",
    items: ["Pilot", "Suitcase", "Trolley", "Gate sign"].map((label) => ({ label, clue: `Spot the ${label.toLowerCase()}.` })),
  };
  const repairPrompts: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_input, init) => {
    const name = claudeKind(init);
    if (name === "tripquest_repair") {
      repairPrompts.push(claudeUserText(init));
      return claudeResponse({ games: [{ day: 1, slot: "inThePlaceSecond", activity: { ...day.slots.inThePlaceSecond, gameType: "codebreaker", items: ["IPOH", "Hill", "Cloud", "Wing"].map((label) => ({ label, clue: `Decode the ${label.toLowerCase()} word.` })) } }] });
    }
    return claudeResponse(name === "grounding_check" ? { findings: [] } : draft);
  };
  try {
    const result = await composeBookletBatch(
      "Ipoh", 7, 4, 3, [IPOH_PLANS[3]], { notes: "Ipoh research notes.", sources: [] },
      "test-key", "claude-sonnet-5-5", "Lead explorer age 7.", false, "Day 4: spot", balancedGameTypePlanForTrip(7, 4, [], "Ipoh"), [],
      undefined, { itinerary: IPOH_PLANS, travelDays: IPOH_TRAVEL_DAYS },
    );
    assert.equal(repairPrompts.length, 1);
    const choices = repairPrompts[0].match(/Use gameType: (.+)\./)?.[1] ?? "";
    for (const gameType of SITE_GAMES) assert.doesNotMatch(choices, new RegExp(`\\b${gameType}\\b`), choices);
    assert.equal(result.dayPlans[0].slots.inThePlaceSecond?.gameType, "codebreaker");
    assert.equal(result.dayPlans[0].slots.whileYouWait.gameType, undefined, "the queue hunt is dropped");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
