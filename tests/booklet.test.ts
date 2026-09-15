import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBooklet,
  getAgeBand,
  getDestinationProfile,
  sanitizeAge,
} from "../app/booklet.ts";
import {
  allowedGameTypesForAge,
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

  assert.match(little, /A grown-up reads|grown-up writes your exact words/);
  assert.match(navigator, /7-point challenge|five-star scorecard/);
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

  assert.equal(titles.length, 42);
  assert.equal(new Set(titles).size, 42);
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
