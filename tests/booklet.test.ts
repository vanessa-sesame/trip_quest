import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBooklet,
  getAgeBand,
  getDestinationProfile,
  sanitizeAge,
} from "../app/booklet.ts";
import {
  applyInterestPlan,
  applySiblingPlan,
  allowedGameTypesForAge,
  balancedGameTypePlanForTrip,
  normalizeItinerary,
  validateBookletDraft,
} from "../app/booklet-ai.ts";
import {
  createCrossword,
  createMaze,
  createRoutePuzzle,
  createWordSearch,
  mazeSizeForAge,
} from "../app/puzzles.ts";
import { coloringSceneFor } from "../app/coloring.ts";

function bookletText(age: number, destination: string) {
  return JSON.stringify(buildBooklet(age, destination, 5));
}

test("named destinations produce genuinely different local content", () => {
  const tokyo = bookletText(7, "Tokyo");
  const paris = bookletText(7, "Paris");
  const singapore = bookletText(7, "Singapore");

  assert.match(tokyo, /vending machine|Tokyo Skytree|train line/i);
  assert.match(paris, /blue street sign|Eiffel Tower|croissant/i);
  assert.match(singapore, /shophouse|Marina Bay|kaya toast/i);
  assert.notEqual(tokyo, paris);
  assert.notEqual(paris, singapore);
});

test("unknown destinations still use the entered place throughout the quest", () => {
  const profile = getDestinationProfile("Reykjavik");
  const text = bookletText(10, "Reykjavik");

  assert.equal(profile.id, "discovery");
  assert.match(profile.intro, /Reykjavik/);
  assert.match(text, /Reykjavik/);
  assert.match(text, /symbol people connect|building or landscape locals recognize/i);
});

test("activity format and difficulty change across developmental age levels", () => {
  const little = bookletText(4, "Tokyo");
  const navigator = bookletText(7, "Tokyo");
  const investigator = bookletText(10, "Tokyo");
  const correspondent = bookletText(13, "Tokyo");

  assert.match(little, /A grown-up reads|grown-up writes your words/);
  assert.match(navigator, /three single-word labels|exact location of your answer/);
  assert.match(investigator, /pieces of evidence|annotated version/);
  assert.match(correspondent, /field note|fact, inference, and opinion|trade-off/);
  assert.equal(getAgeBand(4).label, "Little Explorer");
  assert.equal(getAgeBand(7).label, "Curious Navigator");
  assert.equal(getAgeBand(10).label, "Travel Investigator");
  assert.equal(getAgeBand(13).label, "Young Correspondent");
});

test("every activity in a full 14-day booklet has a distinct creative title", () => {
  const booklet = buildBooklet(7, "Tokyo", 14);
  const titles = booklet.flatMap((day) =>
    day.activities.map((activity) => activity.title),
  );
  const kinds = new Set(
    booklet.flatMap((day) => day.activities.map((activity) => activity.kind)),
  );

  assert.equal(titles.length, 28);
  assert.equal(new Set(titles).size, 28);
  assert.ok(kinds.size >= 20);
  assert.doesNotMatch(JSON.stringify(booklet), /Map the Moment|Local Detail Story/);
});

test("day mechanics change instead of repeating one create template", () => {
  const booklet = buildBooklet(7, "Paris", 6);
  const titleSets = booklet.map((day) =>
    day.activities.map((activity) => activity.title).join("|"),
  );

  assert.equal(new Set(titleSets).size, 6);
  assert.match(JSON.stringify(booklet[2]), /Flavor Detective|Menu Mash-Up|Snack Awards/);
  assert.match(JSON.stringify(booklet[3]), /Transit Codebreaker|Human Route Map|Dream Ride Lab/);
  assert.match(JSON.stringify(booklet[5]), /Pocket Bioblitz|Creature Superpower|Ranger Rescue/);
});

test("trip length controls the number of tailored day pages", () => {
  assert.equal(buildBooklet(7, "Paris", 1).length, 1);
  assert.equal(buildBooklet(7, "Paris", 6).length, 6);
  assert.equal(buildBooklet(7, "Paris", 99).length, 14);
});

test("every age from 3 through 14 can be selected", () => {
  for (let age = 3; age <= 14; age += 1) {
    assert.equal(sanitizeAge(age), age);
  }

  assert.equal(sanitizeAge(1), 3);
  assert.equal(sanitizeAge(18), 14);
});

test("AI booklet validation requires the requested day count and unique activities", () => {
  const draft = {
    profile: {
      style: "Harbour stories and tiled streets",
      intro: "A bright family quest through a real city and its living culture.",
      word: "obrigado — thank you",
      etiquette: "Use a quiet voice in churches and ask before photographing people.",
    },
    dayPlans: [
      {
        day: 8,
        theme: "Belém Tower Lookout",
        focusLabel: "River history",
        mission: "Spot the carved details that connect this tower to Portugal's sea journeys.",
        activities: [
          {
            title: "Stone Sailor Search",
            kind: "Observation hunt",
            body: "Eight words hide in the grid, including several answers that are not printed in the game items.",
            prompt: "My seaworthy shape is…",
            gameType: "word_search",
            items: [
              { label: "Tower", clue: "A stone lookout beside the Tagus." },
              { label: "Caravel", clue: "A ship linked to Portuguese sea journeys." },
              { label: "Rope", clue: "A carved maritime detail." },
              { label: "Tagus", clue: "The river beside Belém." },
            ],
          },
          {
            title: "Tagus Tide Map",
            kind: "Map play",
            body: "Trace the river edge with one line, then mark the tower and the direction a boat travels.",
            prompt: "Tower / boat / river bend",
            gameType: "map_puzzle",
            items: [
              { label: "Belém Tower", clue: "Start beside the riverside tower." },
              { label: "Tagus", clue: "Follow the broad river." },
              { label: "Monument", clue: "Mark the monument to sea journeys." },
              { label: "Garden", clue: "Finish in a nearby green space." },
            ],
          },
        ],
      },
    ],
  };

  const valid = validateBookletDraft(draft, 1);
  assert.equal(valid.dayPlans[0].day, 1);
  assert.equal(valid.dayPlans[0].activities.length, 2);
  assert.match(valid.dayPlans[0].activities[0].body, /these four local words/i);
  assert.doesNotMatch(valid.dayPlans[0].activities[0].body, /eight words/i);
  const personalized = applyInterestPlan(valid, [{
    day: 1,
    childNumber: 1,
    interest: "dinosaurs",
  }]);
  assert.match(personalized.dayPlans[0].mission, /reminds you of dinosaurs/i);
  assert.match(personalized.dayPlans[0].interestHook || "", /Dinosaur lens/i);
  const withSiblingMission = applySiblingPlan(personalized, true);
  assert.match(withSiblingMission.dayPlans[0].siblingMission || "", /Swap roles/i);
  assert.ok(personalized.dayPlans[0].mission.length <= 360);

  const repeatedDays = {
    ...valid,
    dayPlans: Array.from({ length: 3 }, (_, index) => ({
      ...valid.dayPlans[0],
      day: index + 1,
      siblingMission: "Family relay: do the same thing again.",
      interestHook: "Copied interest lens",
    })),
  };
  const variedRoles = applySiblingPlan(repeatedDays, true);
  assert.equal(new Set(variedRoles.dayPlans.map((day) => day.siblingMission)).size, 3);
  const namedFamily = applySiblingPlan(repeatedDays, [
    { id: "a", name: "Mia", age: 5, readingLevel: "pre-reader", interests: [], avoid: [], preferredMechanics: [] },
    { id: "b", name: "Leo", age: 8, readingLevel: "early-reader", interests: [], avoid: [], preferredMechanics: [] },
    { id: "c", name: "Sam", age: 10, readingLevel: "independent-reader", interests: [], avoid: [], preferredMechanics: [] },
  ]);
  assert.match(namedFamily.dayPlans[0].siblingMission || "", /Mia|Leo|Sam/);
  assert.doesNotMatch(JSON.stringify(namedFamily), /younger sibling|older sibling/i);
  const clearedLens = applyInterestPlan(repeatedDays, []);
  assert.equal(clearedLens.dayPlans[0].interestHook, undefined);

  const branded = applyInterestPlan(valid, [{
    day: 1,
    childNumber: 1,
    interest: "Pokemon",
  }]);
  assert.doesNotMatch(branded.dayPlans[0].mission, /Pokemon/i);
  assert.match(branded.dayPlans[0].interestHook || "", /creature-collecting/i);
  assert.doesNotThrow(() => validateBookletDraft(draft, 1, 7));
  assert.throws(() => validateBookletDraft(draft, 1, 4), /not an age-4 game/i);
  assert.throws(() => validateBookletDraft(draft, 2), /exactly 2 day pages/i);

  const repeated = structuredClone(draft);
  repeated.dayPlans[0].activities[1].title = "Stone Sailor Search";
  assert.throws(() => validateBookletDraft(repeated, 1), /repeated/i);

  const missingGame = structuredClone(draft);
  delete (missingGame.dayPlans[0].activities[0] as Partial<typeof draft.dayPlans[0]["activities"][0]>).gameType;
  assert.throws(() => validateBookletDraft(missingGame, 1), /game type/i);

  const disconnectedCrossword = structuredClone(draft);
  disconnectedCrossword.dayPlans[0].activities[0] = {
    title: "Penguin Sound Crossword",
    kind: "Mini crossword",
    body: "Solve four local clues in the crossword.",
    prompt: "My answer is...",
    gameType: "crossword",
    items: [
      { label: "JACKASS", clue: "An old nickname for the local penguin." },
      { label: "LOW", clue: "The tide level that exposes more shore." },
      { label: "SANPARKS", clue: "The national parks organization." },
      { label: "GRANITE", clue: "The rock forming the beach boulders." },
    ],
  };
  const repairedCrossword = validateBookletDraft(disconnectedCrossword, 1, 10);
  assert.equal(repairedCrossword.dayPlans[0].activities[0].gameType, "word_search");
  assert.match(repairedCrossword.dayPlans[0].activities[0].title, /word search/i);
  assert.match(repairedCrossword.dayPlans[0].activities[0].body, /find and circle/i);

  const repeatedMap = structuredClone(draft);
  repeatedMap.dayPlans[0].activities[1].title = "Souk Sector Sudoku";
  repeatedMap.dayPlans.push(structuredClone(repeatedMap.dayPlans[0]));
  repeatedMap.dayPlans[1].activities[0].title = "Second Stone Search";
  repeatedMap.dayPlans[1].activities[1].title = "Second Route Mapper";
  const repairedMaps = validateBookletDraft(repeatedMap, 2, 10);
  assert.equal(repairedMaps.dayPlans[0].activities[1].gameType, "map_puzzle");
  assert.match(repairedMaps.dayPlans[0].activities[1].title, /route challenge/i);
  assert.equal(repairedMaps.dayPlans[1].activities[1].gameType, "scavenger_hunt");
  assert.match(repairedMaps.dayPlans[1].activities[1].body, /tick each box/i);

  const oneLetterLabels = structuredClone(draft);
  oneLetterLabels.dayPlans[0].activities[1].items[0].label = "A";
  assert.doesNotThrow(() => validateBookletDraft(oneLetterLabels, 1, 7));
});

test("AI booklet validation repairs optional queue presentation labels", () => {
  const raw = {
    profile: {
      style: "Garden city discoveries",
      intro: "Explore a garden city through real places, local details, and family-friendly observation games.",
      word: "hello - a friendly greeting",
      etiquette: "Stay with your grown-up and leave every planted detail where it belongs.",
    },
    dayPlans: structuredClone(buildBooklet(7, "Singapore", 1)),
  };
  raw.dayPlans[0].slots.inThePlace.gameType = "word_search";
  raw.dayPlans[0].slots.sitDown.gameType = "bingo";
  raw.dayPlans[0].slots.inThePlace.items = [
    { label: "GARDEN", clue: "A planted place in the city." },
    { label: "RIVER", clue: "Water flowing through the landscape." },
    { label: "TOWER", clue: "A tall structure visible nearby." },
    { label: "MARKET", clue: "A place where local goods are sold." },
  ];
  raw.dayPlans[0].slots.sitDown.items = structuredClone(raw.dayPlans[0].slots.inThePlace.items);
  delete raw.dayPlans[0].slots.inThePlaceSecond;
  delete raw.dayPlans[0].slots.whileYouWait.title;
  delete raw.dayPlans[0].slots.whileYouWait.instruction;
  delete raw.dayPlans[0].slots.whileYouWait.countLabel;

  const result = validateBookletDraft(raw, 1, 7);
  assert.equal(result.dayPlans[0].slots.whileYouWait.title, "Count While You Wait");
  assert.match(result.dayPlans[0].slots.whileYouWait.instruction, /Count one repeated detail/i);
  assert.equal(result.dayPlans[0].slots.whileYouWait.countLabel, "I counted");
});

test("coloring scenes vary deterministically instead of repeating one drawing", () => {
  const scenes = new Set(
    ["Harbour", "Garden", "Bridge", "Market", "Mountain", "Temple", "Lantern"].map((title) =>
      coloringSceneFor({ title, items: [{ label: "local", clue: "A local detail." }] }),
    ),
  );
  assert.ok(scenes.size >= 4);
});

test("daily plans are normalized, padded, and length checked", () => {
  assert.deepEqual(
    normalizeItinerary(["  Louvre   morning ", "Seine cruise"], 3),
    ["Louvre morning", "Seine cruise", ""],
  );
  assert.deepEqual(normalizeItinerary(undefined, 2), ["", ""]);
  assert.throws(() => normalizeItinerary("Louvre", 1), /list/i);
  assert.throws(() => normalizeItinerary(["x".repeat(141)], 1), /140/i);
});

test("game mechanics are constrained by the child's age", () => {
  assert.ok(allowedGameTypesForAge(4).includes("coloring"));
  assert.ok(allowedGameTypesForAge(4).includes("maze"));
  assert.ok(!allowedGameTypesForAge(4).includes("crossword"));
  assert.ok(!allowedGameTypesForAge(4).includes("word_search"));
  assert.ok(allowedGameTypesForAge(7).includes("word_search"));
  assert.ok(!allowedGameTypesForAge(13).includes("coloring"));
});

test("AI game schedules maximize variety and never repeat the four-stop map", () => {
  for (const age of [3, 5, 7, 10, 14]) {
    const plan = balancedGameTypePlanForTrip(age, 14);
    const firstFiveDays = plan.slice(0, 5).flatMap((day) => day.gameTypes);
    const allGames = plan.flatMap((day) => day.gameTypes);
    assert.equal(plan.length, 14);
    assert.ok(new Set(firstFiveDays).size >= (age <= 5 ? 8 : 8));
    assert.ok(allGames.every((game) => allowedGameTypesForAge(age).includes(game)));
    assert.ok(allGames.every((game, index) => index === 0 || game !== allGames[index - 1]));
    assert.ok(allGames.filter((game) => game === "map_puzzle").length <= 1);
  }
});

test("family interests decide whether drawing is included and where it lands", () => {
  const noDrawing = balancedGameTypePlanForTrip(5, 6, [{ day: 1, childNumber: 1, interest: "dinosaurs" }]);
  assert.equal(noDrawing.some((day) => day.gameTypes.includes("drawing")), false);

  const withDrawing = balancedGameTypePlanForTrip(5, 6, [
    { day: 1, childNumber: 1, interest: "dinosaurs" },
    { day: 4, childNumber: 2, interest: "drawing" },
  ]);
  assert.equal(withDrawing[3].gameTypes.includes("drawing"), true);
  assert.equal(withDrawing.filter((day) => day.gameTypes.includes("drawing")).length, 1);
});

test("named sibling missions use richer roles and match sketch work to the interested child", () => {
  const missions = applySiblingPlan({
    profile: { style: "Local", intro: "A local trip.", word: "hello", etiquette: "Be kind." },
    dayPlans: Array.from({ length: 3 }, (_, index) => ({
      day: index + 1,
      theme: "A local place",
      focusLabel: "Notice",
      mission: "Find one useful local clue and share what it means.",
      activities: [],
    })),
  }, [
    { id: "a", name: "Edwin", age: 5, readingLevel: "pre-reader", interests: ["dinosaurs"], avoid: [], preferredMechanics: [] },
    { id: "b", name: "Chris", age: 7, readingLevel: "early-reader", interests: ["drawing"], avoid: [], preferredMechanics: [] },
    { id: "c", name: "Vanessa", age: 12, readingLevel: "confident-reader", interests: [], avoid: [], preferredMechanics: [] },
  ]);
  assert.match(missions.dayPlans[0].siblingMission || "", /Counter|Comparer|Estimator/);
  assert.match(missions.dayPlans[0].siblingMission || "", /Edwin|Chris|Vanessa/);
  assert.match(missions.dayPlans[1].siblingMission || "", /Chris \/ Sketcher/);
  assert.doesNotMatch(JSON.stringify(missions), /younger sibling|older sibling/i);
});

test("printable puzzle builders use supplied place vocabulary", () => {
  const search = createWordSearch(["Merlion", "Orchid", "Hawker", "MRT"], "Singapore");
  const containsWord = (word: string) => {
    const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];
    return search.grid.some((row, rowIndex) => row.some((_, columnIndex) =>
      directions.some(([rowStep, columnStep]) => Array.from(word).every((letter, letterIndex) =>
        search.grid[rowIndex + rowStep * letterIndex]?.[columnIndex + columnStep * letterIndex] === letter,
      )),
    ));
  };
  assert.deepEqual(search.words, ["MERLION", "ORCHID", "HAWKER", "MRT"]);
  assert.ok(search.words.every(containsWord));

  const crossword = createCrossword(["Merlion", "Orchid", "Hawker", "MRT"]);
  assert.deepEqual(crossword.answers, ["MERLION", "ORCHID", "HAWKER", "MRT"]);
  assert.equal(crossword.complete, true);
  assert.equal(crossword.entries.length, 4);
  assert.ok(crossword.grid.flat().filter(Boolean).length >= 10);
  assert.equal(
    createCrossword(["JACKASS", "LOW", "SANPARKS", "GRANITE"]).complete,
    false,
  );

  const maze = createMaze("Gardens by the Bay");
  assert.equal(maze.length, 10);
  assert.equal(maze[0].length, 10);
  assert.equal(maze[0][0].walls[0], false);
  assert.equal(maze[9][9].walls[2], false);
  assert.ok(maze.flat().some((cell) => cell.walls.some((wall) => !wall)));
  assert.deepEqual(
    [4, 5, 7, 10, 13].map(mazeSizeForAge),
    [6, 8, 12, 16, 20],
  );

  for (const age of [7, 10, 13]) {
    const route = createRoutePuzzle("Gardens route", age);
    assert.equal(route.stops.length, 4);
    assert.equal(route.solutionStopOrder.length, 4);
    assert.ok(route.closedStreets.length >= 4);
    assert.ok(route.minimumStreets > 0);
  }
});
