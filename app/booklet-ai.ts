import type { DayPlan, GameType } from "./booklet";

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
      return "Connect the four stops in order, then add one symbol that makes the route easier to follow.";
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
      return "Best route clue: __________";
    case "scavenger_hunt":
      return "The hardest detail to find: __________";
    case "quiz":
      return "My answer: ____  Evidence: __________";
    default:
      return original;
  }
}

export function validateBookletDraft(
  value: unknown,
  expectedDays: number,
  expectedAge?: number,
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
      const title = requireText(
        activity.title,
        `Activity title on day ${dayIndex + 1}`,
        3,
        70,
      );
      const normalizedTitle = title.toLocaleLowerCase();
      if (usedTitles.has(normalizedTitle)) {
        throw new Error(`The activity title “${title}” was repeated.`);
      }
      usedTitles.add(normalizedTitle);
      const rawBody = requireText(
        activity.body,
        `Activity instructions on day ${dayIndex + 1}`,
        15,
        700,
      );
      const body = rawBody
        .replace(/\s+(?:prompt|response line):[\s\S]*$/i, "")
        .trim();
      const gameType = activity.gameType;
      if (
        typeof gameType !== "string" ||
        !supportedGameTypes.includes(gameType as GameType)
      ) {
        throw new Error(`Activity ${activityIndex + 1} on day ${dayIndex + 1} has an invalid game type.`);
      }
      if (
        expectedAge !== undefined &&
        !allowedGameTypesForAge(expectedAge).includes(gameType as GameType)
      ) {
        throw new Error(
          `${gameType} is not an age-${expectedAge} game type.`,
        );
      }
      if (!Array.isArray(activity.items) || activity.items.length !== 4) {
        throw new Error(
          `Activity ${activityIndex + 1} on day ${dayIndex + 1} must contain exactly four game items.`,
        );
      }
      const items = activity.items.map((itemValue, itemIndex) => {
        if (!itemValue || typeof itemValue !== "object") {
          throw new Error(`Game item ${itemIndex + 1} on day ${dayIndex + 1} is missing.`);
        }
        const item = itemValue as Record<string, unknown>;
        return {
          label: requireText(
            item.label,
            `Game item label on day ${dayIndex + 1}`,
            2,
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

      return {
        title,
        kind: requireText(
          activity.kind,
          `Activity type on day ${dayIndex + 1}`,
          2,
          32,
        ),
        body: requireText(
          gameInstructions(gameType as GameType, items, body),
          `Activity instructions on day ${dayIndex + 1}`,
          15,
          360,
        ),
        prompt: requireText(
          gamePrompt(
            gameType as GameType,
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

    return {
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
