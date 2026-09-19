import type { DayPlan, GameType } from "./booklet";
import type { InterestPlanItem } from "./family";
import { createCrossword } from "./puzzles.ts";

const supportedGameTypes: GameType[] = [
  "coloring",
  "drawing",
  "crossword",
  "word_search",
  "maze",
  "matching",
  "bingo",
  "spot_the_difference",
  "codebreaker",
  "map_puzzle",
  "scavenger_hunt",
  "quiz",
  "story",
];

export function allowedGameTypesForAge(age: number): GameType[] {
  if (age <= 5) {
    return [
      "coloring",
      "drawing",
      "maze",
      "matching",
      "bingo",
      "spot_the_difference",
      "scavenger_hunt",
      "story",
    ];
  }
  if (age <= 8) return [...supportedGameTypes];
  if (age <= 11) {
    return [
      "drawing",
      "crossword",
      "word_search",
      "maze",
      "codebreaker",
      "map_puzzle",
      "scavenger_hunt",
      "quiz",
      "story",
    ];
  }
  return [
    "drawing",
    "crossword",
    "word_search",
    "codebreaker",
    "map_puzzle",
    "scavenger_hunt",
    "quiz",
    "story",
  ];
}

export type GameTypePlanItem = {
  day: number;
  gameTypes: [GameType, GameType];
};

const YOUNG_GAME_PLAN: Array<[GameType, GameType]> = [
  ["coloring", "bingo"],
  ["drawing", "scavenger_hunt"],
  ["maze", "story"],
  ["matching", "spot_the_difference"],
  ["coloring", "scavenger_hunt"],
  ["drawing", "bingo"],
  ["maze", "matching"],
  ["spot_the_difference", "story"],
  ["coloring", "bingo"],
  ["drawing", "scavenger_hunt"],
  ["maze", "story"],
  ["matching", "spot_the_difference"],
  ["coloring", "scavenger_hunt"],
  ["drawing", "bingo"],
];

const EARLY_READER_GAME_PLAN: Array<[GameType, GameType]> = [
  ["drawing", "scavenger_hunt"],
  ["word_search", "bingo"],
  ["maze", "quiz"],
  ["matching", "story"],
  ["crossword", "spot_the_difference"],
  ["codebreaker", "scavenger_hunt"],
  ["coloring", "bingo"],
  ["map_puzzle", "drawing"],
  ["quiz", "maze"],
  ["story", "matching"],
  ["word_search", "spot_the_difference"],
  ["crossword", "scavenger_hunt"],
  ["codebreaker", "bingo"],
  ["coloring", "quiz"],
];

const INVESTIGATOR_GAME_PLAN: Array<[GameType, GameType]> = [
  ["drawing", "scavenger_hunt"],
  ["crossword", "quiz"],
  ["maze", "story"],
  ["codebreaker", "word_search"],
  ["map_puzzle", "drawing"],
  ["quiz", "scavenger_hunt"],
  ["crossword", "story"],
  ["word_search", "maze"],
  ["codebreaker", "quiz"],
  ["drawing", "scavenger_hunt"],
  ["crossword", "story"],
  ["word_search", "maze"],
  ["codebreaker", "quiz"],
  ["drawing", "scavenger_hunt"],
];

const TEEN_GAME_PLAN: Array<[GameType, GameType]> = [
  ["drawing", "scavenger_hunt"],
  ["crossword", "quiz"],
  ["word_search", "story"],
  ["codebreaker", "drawing"],
  ["map_puzzle", "scavenger_hunt"],
  ["quiz", "story"],
  ["crossword", "drawing"],
  ["word_search", "scavenger_hunt"],
  ["codebreaker", "quiz"],
  ["story", "drawing"],
  ["crossword", "scavenger_hunt"],
  ["word_search", "quiz"],
  ["codebreaker", "story"],
  ["drawing", "scavenger_hunt"],
];

export function balancedGameTypePlanForTrip(age: number, days: number): GameTypePlanItem[] {
  const plan = age <= 5
    ? YOUNG_GAME_PLAN
    : age <= 8
      ? EARLY_READER_GAME_PLAN
      : age <= 11
        ? INVESTIGATOR_GAME_PLAN
        : TEEN_GAME_PLAN;
  return plan.slice(0, Math.max(0, Math.min(14, days))).map((gameTypes, index) => ({
    day: index + 1,
    gameTypes,
  }));
}

export type BookletSource = {
  title: string;
  url: string;
};

export type GeneratedBookletProfile = {
  style: string;
  intro: string;
  word: string;
  etiquette: string;
};

export type BookletDraft = {
  profile: GeneratedBookletProfile;
  dayPlans: DayPlan[];
};

function dayUsesInterest(day: DayPlan, interest: string) {
  const visibleText = [
    day.mission,
    day.interestHook,
    ...day.activities.flatMap((activity) => [
      activity.title,
      ...(activity.items || []).flatMap((item) => [item.label, item.clue]),
    ]),
  ].join(" ").toLocaleLowerCase();
  return visibleText.includes(interest.toLocaleLowerCase());
}

const protectedInterestLabels: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bpokemon\b/i, label: "a creature-collecting adventure" },
  { pattern: /\bdisney\b/i, label: "an animated fairy-tale adventure" },
  { pattern: /\bmarvel\b/i, label: "an original hero mission" },
  { pattern: /\blego\b/i, label: "a colorful building challenge" },
  { pattern: /\bbarbie\b/i, label: "a fashion-and-design adventure" },
  { pattern: /\bminecraft\b/i, label: "a block-building survival adventure" },
  { pattern: /\bstar\s+wars\b/i, label: "an original space-opera adventure" },
  { pattern: /\bharry\s+potter\b/i, label: "an original wizard-school mystery" },
  { pattern: /\bpeppa\s+pig\b/i, label: "a friendly animal-family story" },
  { pattern: /\bpaw\s+patrol\b/i, label: "a teamwork rescue mission" },
];

function outputInterestLabel(interest: string) {
  return protectedInterestLabels.find(({ pattern }) => pattern.test(interest))?.label || interest.trim();
}

function interestHookFor(interest: string) {
  const safeInterest = outputInterestLabel(interest);
  const normalized = interest.toLocaleLowerCase();
  if (/dinosaur|dino/.test(normalized)) {
    return `Dinosaur lens: compare one local shape, texture, scale, or habitat clue with how a dinosaur detective might notice tracks and survival clues.`;
  }
  if (/draw|art|paint|craft/.test(normalized)) {
    return `Drawing lens: study one real local shape or pattern, then turn its lines, textures, and colors into an original sketch.`;
  }
  if (/train|transport|car|vehicle|rocket/.test(normalized)) {
    return `Movement lens: follow one local route or machine detail and explain how its shape, sequence, or job helps people get somewhere.`;
  }
  if (/animal|bird|insect|nature|space|science/.test(normalized)) {
    return `Discovery lens: look for one real local clue connected to ${safeInterest}, then record what you observed and what you can reasonably infer.`;
  }
  return `Interest lens: use ${safeInterest} as a creative comparison for one real local detail, then explain what matches and what is different.`;
}

function addInterestLens(mission: string, interest: string) {
  const safeInterest = outputInterestLabel(interest);
  const lens = safeInterest === interest.trim()
    ? `Find one shape, sound, or movement that reminds you of ${interest}.`
    : `Find one shape, sound, or movement that fits ${safeInterest}.`;
  const maximumBaseLength = Math.max(20, 360 - lens.length - 1);
  const base = mission
    .slice(0, maximumBaseLength)
    .trim()
    .replace(/[\s,;:-]+$/g, "")
    .replace(/[.!?]+$/g, "");
  return `${base}. ${lens}`;
}

export function applyInterestPlan(
  draft: BookletDraft,
  interestPlan: InterestPlanItem[],
  dayOffset = 0,
): BookletDraft {
  return {
    ...draft,
    dayPlans: draft.dayPlans.map((day, localDayIndex) => {
      const globalDay = dayOffset + localDayIndex + 1;
      const interests = interestPlan.filter((item) => item.day === globalDay);
      let mission = day.mission;
      let interestHook = day.interestHook;
      for (const item of interests) {
        const candidate = { ...day, mission };
        if (!dayUsesInterest(candidate, item.interest)) {
          mission = addInterestLens(mission, item.interest);
        }
        if (!interestHook || !interestHook.toLocaleLowerCase().includes(item.interest.toLocaleLowerCase())) {
          interestHook = interestHookFor(item.interest);
        }
      }
      return mission === day.mission && interestHook === day.interestHook
        ? day
        : { ...day, mission, interestHook };
    }),
  };
}

export function applySiblingPlan(draft: BookletDraft, hasSiblings: boolean): BookletDraft {
  return {
    ...draft,
    dayPlans: draft.dayPlans.map((day) => day.siblingMission?.trim()
      ? day
      : {
          ...day,
          siblingMission: hasSiblings
            ? "Family relay: one explorer spots, counts, or draws a detail while the other reads the clue or explains why it matters. Swap roles and combine both answers into one family discovery."
            : "Family relay: show a grown-up one detail, hear their observation, then add one new idea of your own to make a shared trip discovery.",
        }),
  };
}

export type GeneratedBookletData = BookletDraft & {
  destination: string;
  age: number;
  days: number;
  itinerary: string[];
  sources: BookletSource[];
  generatedAt: string;
};

export function normalizeItinerary(value: unknown, expectedDays: number) {
  if (value !== undefined && !Array.isArray(value)) {
    throw new Error("Daily plans must be a list.");
  }

  const values = Array.isArray(value) ? value : [];
  return Array.from({ length: expectedDays }, (_, index) => {
    const item = values[index];
    if (item === undefined || item === null || item === "") return "";
    if (typeof item !== "string") {
      throw new Error(`Day ${index + 1} plan must be text.`);
    }

    const plan = item.replace(/\s+/g, " ").trim();
    if (plan.length > 140) {
      throw new Error(`Day ${index + 1} plan must be 140 characters or fewer.`);
    }
    return plan;
  });
}

function requireText(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
) {
  if (typeof value !== "string") {
    throw new Error(`${label} must be text.`);
  }

  const text = value.trim();
  if (text.length < minimum) {
    throw new Error(`${label} has an unexpected length.`);
  }

  if (text.length <= maximum) {
    return text;
  }

  const candidate = text.slice(0, maximum - 1);
  const sentenceEnd = Math.max(
    candidate.lastIndexOf("."),
    candidate.lastIndexOf("!"),
    candidate.lastIndexOf("?"),
  );
  if (sentenceEnd >= Math.floor(maximum * 0.6)) {
    return candidate.slice(0, sentenceEnd + 1);
  }

  const wordEnd = candidate.lastIndexOf(" ");
  return `${candidate.slice(0, wordEnd > 0 ? wordEnd : candidate.length)}…`;
}

function gameInstructions(
  gameType: GameType,
  items: Array<{ label: string; clue: string }>,
  original: string,
) {
  const labels = items.map((item) => item.label);
  switch (gameType) {
    case "word_search":
      return `Find and circle these four local words: ${labels.join(", ")}. They can run across, down, or diagonally.`;
    case "crossword":
      return "Solve the four clues, then write each local answer in its numbered spaces.";
    case "maze":
      return `Draw a route through the maze from ${labels[0]} to ${labels[3]} without crossing a wall.`;
    case "matching":
      return "Draw a line from each numbered local detail to its matching lettered clue.";
    case "bingo":
      return "Explore with your family and mark each square when you spot its real local detail.";
    case "spot_the_difference":
      return `Circle three changes between the two ${labels[0]}-inspired pictures.`;
    case "codebreaker":
      return "Use the starter key to crack the coded local word, then complete the missing letter matches.";
    case "map_puzzle":
      return "Trace one continuous route from START to FINISH that visits all four local stops. Avoid the closed roads, try not to use the same street twice, and see how few streets you can use.";
    case "scavenger_hunt":
      return "Explore with your family and tick each box when you find its real local detail. Look closely and leave every object where it belongs.";
    case "quiz":
      return "Read the local clue and circle the best answer. Use what you notice at the place as evidence.";
    default:
      return original;
  }
}

function gamePrompt(
  gameType: GameType,
  items: Array<{ label: string; clue: string }>,
  original: string,
) {
  switch (gameType) {
    case "word_search":
      return `The ${items[0].label} clue I will remember: __________`;
    case "crossword":
      return "The answer I checked at the real place: __________";
    case "maze":
      return "My route score: easy / twisty / super tricky";
    case "matching":
      return "My matches: 1-__  2-__  3-__  4-__";
    case "bingo":
      return "My first square: __________  My last square: __________";
    case "spot_the_difference":
      return "The sneakiest change was: __________";
    case "codebreaker":
      return "Decoded word: __________";
    case "map_puzzle":
      return "My stop order: __ - __ - __ - __   Streets used: ____";
    case "scavenger_hunt":
      return "The hardest detail to find: __________";
    case "quiz":
      return "My answer: ____  Evidence: __________";
    default:
      return original;
  }
}

function renameActivityForMechanic(value: string, replacement: string) {
  const cleaned = value
    .replace(/\bmini\s+crossword\b|\bcrossword\b|\bsudoku\b|\bmap\s+puzzle\b|\broute\s+mapper\b/gi, "")
    .replace(/\s+/g, " ")
    .replace(/[\s:|-]+$/g, "")
    .trim();
  return `${cleaned || "Local"} ${replacement}`.slice(0, 70);
}

export function validateBookletDraft(
  value: unknown,
  expectedDays: number,
  expectedAge?: number,
  expectedGameTypes?: GameTypePlanItem[],
): BookletDraft {
  if (!value || typeof value !== "object") {
    throw new Error("The generated booklet is not an object.");
  }

  const draft = value as Record<string, unknown>;
  const profileValue = draft.profile;
  if (!profileValue || typeof profileValue !== "object") {
    throw new Error("The generated destination profile is missing.");
  }

  const profileRecord = profileValue as Record<string, unknown>;
  const profile: GeneratedBookletProfile = {
    style: requireText(profileRecord.style, "Profile style", 8, 90),
    intro: requireText(profileRecord.intro, "Profile introduction", 30, 420),
    word: requireText(profileRecord.word, "Local word", 2, 120),
    etiquette: requireText(profileRecord.etiquette, "Etiquette note", 10, 320),
  };

  if (!Array.isArray(draft.dayPlans) || draft.dayPlans.length !== expectedDays) {
    throw new Error(`The booklet must contain exactly ${expectedDays} day pages.`);
  }

  const usedTitles = new Set<string>();
  let mapPuzzleCount = 0;
  const dayPlans = draft.dayPlans.map((dayValue, dayIndex): DayPlan => {
    if (!dayValue || typeof dayValue !== "object") {
      throw new Error(`Day ${dayIndex + 1} is missing.`);
    }

    const day = dayValue as Record<string, unknown>;
    if (!Array.isArray(day.activities) || day.activities.length !== 2) {
      throw new Error(`Day ${dayIndex + 1} must contain exactly two activities.`);
    }

    const activities = day.activities.map((activityValue, activityIndex) => {
      if (!activityValue || typeof activityValue !== "object") {
        throw new Error(
          `Activity ${activityIndex + 1} on day ${dayIndex + 1} is missing.`,
        );
      }

      const activity = activityValue as Record<string, unknown>;
      let title = requireText(
        activity.title,
        `Activity title on day ${dayIndex + 1}`,
        3,
        70,
      );
      let kind = requireText(
        activity.kind,
        `Activity type on day ${dayIndex + 1}`,
        2,
        32,
      );
      const rawBody = requireText(
        activity.body,
        `Activity instructions on day ${dayIndex + 1}`,
        15,
        700,
      );
      const body = rawBody
        .replace(/\s+(?:prompt|response line):[\s\S]*$/i, "")
        .trim();
      const declaredGameType = activity.gameType;
      if (
        typeof declaredGameType !== "string" ||
        !supportedGameTypes.includes(declaredGameType as GameType)
      ) {
        throw new Error(`Activity ${activityIndex + 1} on day ${dayIndex + 1} has an invalid game type.`);
      }
      if (
        expectedAge !== undefined &&
        !allowedGameTypesForAge(expectedAge).includes(declaredGameType as GameType)
      ) {
        throw new Error(
          `${declaredGameType} is not an age-${expectedAge} game type.`,
        );
      }
      if (!Array.isArray(activity.items) || activity.items.length !== 4) {
        throw new Error(
          `Activity ${activityIndex + 1} on day ${dayIndex + 1} must contain exactly four game items.`,
        );
      }
      let items = activity.items.map((itemValue, itemIndex) => {
        if (!itemValue || typeof itemValue !== "object") {
          throw new Error(`Game item ${itemIndex + 1} on day ${dayIndex + 1} is missing.`);
        }
        const item = itemValue as Record<string, unknown>;
        return {
          label: requireText(
            item.label,
            `Game item label on day ${dayIndex + 1}`,
            1,
            36,
          ),
          clue: requireText(
            item.clue,
            `Game item clue on day ${dayIndex + 1}`,
            4,
            120,
          ),
        };
      });

      let gameType = declaredGameType as GameType;
      if (
        gameType === "crossword"
        && !createCrossword(items.map((item) => item.label)).complete
      ) {
        gameType = "word_search";
        title = renameActivityForMechanic(title, "Word Search");
        kind = "Connected word search";
      }
      if (gameType === "crossword") {
        items = items.map((item) => ({
          ...item,
          clue: item.clue.replace(/^\s*(?:across|down)\s*[:.-]\s*/i, ""),
        }));
      }
      if (gameType === "map_puzzle") {
        if (mapPuzzleCount > 0) {
          gameType = "scavenger_hunt";
          title = renameActivityForMechanic(title, "Field Hunt");
          kind = "On-location field hunt";
        } else {
          mapPuzzleCount += 1;
          if (/\bsudoku\b/i.test(title)) title = renameActivityForMechanic(title, "Route Challenge");
          if (/\bsudoku\b/i.test(kind)) kind = "Route-planning logic";
        }
      }

      const plannedGameType = expectedGameTypes?.[dayIndex]?.gameTypes[activityIndex];
      if (plannedGameType && gameType !== plannedGameType) {
        throw new Error(
          `Activity ${activityIndex + 1} on day ${dayIndex + 1} must use ${plannedGameType}, not ${gameType}.`,
        );
      }

      const normalizedTitle = title.toLocaleLowerCase();
      if (usedTitles.has(normalizedTitle)) {
        throw new Error(`The activity title “${title}” was repeated.`);
      }
      usedTitles.add(normalizedTitle);

      return {
        title,
        kind,
        body: requireText(
          gameInstructions(gameType, items, body),
          `Activity instructions on day ${dayIndex + 1}`,
          15,
          360,
        ),
        prompt: requireText(
          gamePrompt(
            gameType,
            items,
            requireText(
              activity.prompt,
              `Activity prompt on day ${dayIndex + 1}`,
              2,
              180,
            ),
          ),
          `Activity prompt on day ${dayIndex + 1}`,
          2,
          180,
        ),
        gameType,
        items,
      };
    });

    const normalizedDay: DayPlan = {
      day: dayIndex + 1,
      theme: requireText(day.theme, `Day ${dayIndex + 1} theme`, 4, 80),
      focusLabel: requireText(
        day.focusLabel,
        `Day ${dayIndex + 1} focus`,
        3,
        55,
      ),
      mission: requireText(
        day.mission,
        `Day ${dayIndex + 1} mission`,
        20,
        360,
      ),
      activities,
    };
    if (typeof day.interestHook === "string") {
      normalizedDay.interestHook = requireText(
        day.interestHook,
        `Day ${dayIndex + 1} interest lens`,
        12,
        260,
      );
    }
    if (typeof day.siblingMission === "string") {
      normalizedDay.siblingMission = requireText(
        day.siblingMission,
        `Day ${dayIndex + 1} family relay`,
        12,
        280,
      );
    }
    return normalizedDay;
  });

  return { profile, dayPlans };
}

export function isGeneratedBookletData(
  value: unknown,
): value is GeneratedBookletData {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<GeneratedBookletData>;
  return (
    typeof candidate.destination === "string" &&
    typeof candidate.age === "number" &&
    typeof candidate.days === "number" &&
    Array.isArray(candidate.itinerary) &&
    typeof candidate.generatedAt === "string" &&
    Array.isArray(candidate.sources) &&
    Array.isArray(candidate.dayPlans) &&
    Boolean(candidate.profile)
  );
}
