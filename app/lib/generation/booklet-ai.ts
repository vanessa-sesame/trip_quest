import {
  pairEligibleGameTypes,
  queueEligibleGameTypes,
  type Activity,
  type DayPlan,
  type GameItem,
  type GameType,
  type QueueTargetKind,
} from "../booklet/booklet.ts";
import {
  familyChildDisplayName,
  type FamilyChild,
  type InterestPlanItem,
  type ItineraryEvent,
} from "../family.ts";
import { createCrossword } from "../booklet/puzzles.ts";

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

const supportedQueueTargetKinds: QueueTargetKind[] = ["shape", "colour", "object", "sound", "person"];

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

function drawingInterestPresent(interestPlan: InterestPlanItem[]) {
  return interestPlan.some((item) => /draw|art|paint|craft|sketch/i.test(item.interest));
}

function replaceUnwantedDrawing(gameTypes: [GameType, GameType], age: number, previous: GameType | undefined) {
  const replacements = age <= 5
    ? ["matching", "story", "scavenger_hunt", "bingo", "spot_the_difference", "maze"] as GameType[]
    : age <= 8
      ? ["matching", "quiz", "scavenger_hunt", "bingo", "spot_the_difference", "story"] as GameType[]
      : ["quiz", "scavenger_hunt", "story", "codebreaker", "word_search", "crossword"] as GameType[];
  const replacement = replacements.find((candidate) => candidate !== previous && allowedGameTypesForAge(age).includes(candidate));
  return replacement || replacements.find((candidate) => allowedGameTypesForAge(age).includes(candidate)) || gameTypes[0];
}

// Every one of these per-age tables is fixed and always sliced from index 0
// (see below), so without a rotation, every single booklet for a given
// age band starts on the exact same day-1 game pair, forever — a 5-year-old's
// 1-day Barcelona trip and a 5-year-old's 1-day Tokyo trip both always land
// on ["coloring", "bingo"], and short trips (well under 14 days, the
// overwhelming majority of real bookings) can never reach the later,
// otherwise-unused entries. rotationKey lets a caller (the destination, in
// practice) shift which slice of the table a given trip starts from, so
// variety exists both across different bookings and within what a short
// trip can surface — while staying a pure function of that key, not
// Math.random(), so the same request still deterministically regenerates
// the same booklet (required for the preview/purchase cache).
function rotationOffset(key: string, length: number) {
  let hash = 0;
  for (const character of key) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return hash % length;
}

export function balancedGameTypePlanForTrip(
  age: number,
  days: number,
  interestPlan?: InterestPlanItem[],
  rotationKey?: string,
): GameTypePlanItem[] {
  const plan = age <= 5
    ? YOUNG_GAME_PLAN
    : age <= 8
      ? EARLY_READER_GAME_PLAN
      : age <= 11
        ? INVESTIGATOR_GAME_PLAN
        : TEEN_GAME_PLAN;
  const offset = rotationKey ? rotationOffset(rotationKey, plan.length) : 0;
  const rotatedPlan = offset ? [...plan.slice(offset), ...plan.slice(0, offset)] : plan;
  const selected = rotatedPlan.slice(0, Math.max(0, Math.min(14, days))).map((gameTypes) => [...gameTypes] as [GameType, GameType]);
  // The default helper remains age-balanced for older callers. Generated family
  // editions pass the interest plan so a drawing page is intentional, not filler.
  if (interestPlan) {
    const hasDrawingInterest = drawingInterestPresent(interestPlan);
    let previous: GameType | undefined;
    selected.forEach((gameTypes) => {
      for (let index = 0; index < gameTypes.length; index += 1) {
        if (gameTypes[index] === "drawing" && !hasDrawingInterest) {
          gameTypes[index] = replaceUnwantedDrawing(gameTypes, age, previous);
        }
        previous = gameTypes[index];
      }
    });

    if (hasDrawingInterest) {
      const targetDay = interestPlan.find((item) => /draw|art|paint|craft|sketch/i.test(item.interest))?.day;
      if (targetDay && selected[targetDay - 1]) {
        const existingDrawingDay = selected.findIndex((gameTypes) => gameTypes.includes("drawing"));
        if (existingDrawingDay >= 0 && existingDrawingDay !== targetDay - 1) {
          const targetIndex = selected[targetDay - 1].findIndex((gameType) => gameType !== "drawing");
          const sourceIndex = selected[existingDrawingDay].findIndex((gameType) => gameType === "drawing");
          if (targetIndex >= 0 && sourceIndex >= 0) {
            [selected[targetDay - 1][targetIndex], selected[existingDrawingDay][sourceIndex]] = [
              selected[existingDrawingDay][sourceIndex],
              selected[targetDay - 1][targetIndex],
            ];
          }
        }
        selected.forEach((gameTypes, index) => {
          if (index === targetDay - 1) return;
          for (let slot = 0; slot < gameTypes.length; slot += 1) {
            if (gameTypes[slot] === "drawing") gameTypes[slot] = replaceUnwantedDrawing(gameTypes, age, gameTypes[slot - 1]);
          }
        });
        if (!selected[targetDay - 1].includes("drawing")) {
          selected[targetDay - 1][0] = "drawing";
        }
      }
    }
  }

  return selected.map((gameTypes, index) => ({
    day: index + 1,
    gameTypes,
  }));
}

// Generic clue items for a preview activity that doesn't have real,
// researched ones yet — only ever used by enrichOfflinePreviewGameplay
// below, the same role app/components/activity-game.tsx's own fallbackItems plays for
// the web board renderer, kept here too so the PDF path (which has no such
// fallback and expects real items on any gameType that needs them) gets
// something sane as well.
const previewFallbackItems: GameItem[] = [
  { label: "Look", clue: "Spot one real detail nearby." },
  { label: "Listen", clue: "Notice one local sound." },
  { label: "Compare", clue: "Find two things that look alike." },
  { label: "Share", clue: "Tell your family what surprised you." },
];

function seededPick<T>(options: T[], seed: string): T {
  let hash = 0;
  for (const character of seed) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return options[hash % options.length];
}

// buildBooklet's offline generator (app/lib/booklet/booklet.ts) — the deterministic
// fallback used for the web preview before a real booklet has been
// generated — varies each day's theme, landmark, and activity titles, but
// never assigns inThePlace/inThePlaceSecond/sitDown a gameType or items at
// all (every test that renders one through createBookletPdf has to patch
// this in by hand first). Left as-is, every activity falls back to the
// same "story" board (see activity-game.tsx's `activity.gameType ||
// "story"), so the pre-generation preview shows no game variety
// whatsoever regardless of how varied the surrounding titles/themes are.
// This stamps the same destination-rotated variety a real generation gets
// (balancedGameTypePlanForTrip) onto that offline output, so the preview
// actually demonstrates the range of games a real booklet would use.
export function enrichOfflinePreviewGameplay(
  dayPlans: DayPlan[],
  age: number,
  destination: string,
): DayPlan[] {
  const gameTypePlan = balancedGameTypePlanForTrip(age, dayPlans.length, undefined, destination);
  const allowed = allowedGameTypesForAge(age);
  return dayPlans.map((day, index) => {
    const [inPlaceType, sitDownType] = gameTypePlan[index]?.gameTypes || ["story", "story"];
    const withGameplay = (activity: Activity, gameType: GameType): Activity => ({
      ...activity,
      gameType,
      items: activity.items?.length ? activity.items : previewFallbackItems.map((item) => ({ ...item })),
    });
    const inThePlace = withGameplay(day.slots.inThePlace, inPlaceType);
    const sitDown = withGameplay(day.slots.sitDown, sitDownType);
    let inThePlaceSecond: Activity | undefined;
    if (day.slots.inThePlaceSecond) {
      const secondCandidates = pairEligibleGameTypes.filter(
        (type) => allowed.includes(type) && type !== inPlaceType && type !== sitDownType,
      );
      const secondType = secondCandidates.length
        ? seededPick(secondCandidates, `${destination}-${day.day}-second`)
        : inPlaceType;
      inThePlaceSecond = withGameplay(day.slots.inThePlaceSecond, secondType);
    }
    return {
      ...day,
      slots: {
        ...day.slots,
        inThePlace,
        ...(inThePlaceSecond ? { inThePlaceSecond } : {}),
        sitDown,
      },
      activities: [inThePlace, sitDown],
    };
  });
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

export function applyInterestPlan<T extends BookletDraft>(
  draft: T,
  interestPlan: InterestPlanItem[],
  dayOffset = 0,
): T {
  return {
    ...draft,
    dayPlans: draft.dayPlans.map((day, localDayIndex) => {
      const globalDay = dayOffset + localDayIndex + 1;
      const interests = interestPlan.filter((item) => item.day === globalDay);
      let mission = day.mission;
      // Models sometimes copy a valid lens onto every day. Only scheduled
      // interest days should carry one into the child-facing layout.
      let interestHook: string | undefined;
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

const namedSiblingRolePatterns = [
  {
    roles: [
      ["Scout", "spots one local detail"],
      ["Storyteller", "explains its clue"],
      ["Question maker", "asks why it matters"],
      ["Evidence keeper", "saves the proof"],
      ["Route keeper", "chooses the next safe stop"],
      ["Presenter", "shares the family answer"],
    ],
    handoff: "Swap roles at the next stop and combine your clues.",
  },
  {
    roles: [
      ["Sketcher", "turns one local shape into an original line"],
      ["Decoder", "reads the clue and finds its evidence"],
      ["Counter", "counts four useful details"],
      ["Comparer", "checks what is alike and different"],
      ["Question maker", "asks one curious why question"],
      ["Presenter", "explains the final answer"],
    ],
    handoff: "Trade jobs for the last clue and share one result.",
  },
  {
    roles: [
      ["Collector", "gathers four tiny observations"],
      ["Sorter", "groups the clues by pattern"],
      ["Checker", "tests the answer against the place"],
      ["Map keeper", "marks where the clue was found"],
      ["Reporter", "records the strongest evidence"],
      ["Presenter", "tells the trip story"],
    ],
    handoff: "Compare everyone’s evidence before choosing one family answer.",
  },
  {
    roles: [
      ["Route keeper", "chooses the next safe family stop"],
      ["Lookout", "watches for the named local clue"],
      ["Landmark finder", "points to the useful marker"],
      ["Time keeper", "calls the quiet swap"],
      ["Question maker", "asks what the route reveals"],
      ["Guide", "leads the family explanation"],
    ],
    handoff: "Swap who leads the check before moving on.",
  },
  {
    roles: [
      ["Question maker", "asks a why-or-how question"],
      ["Evidence keeper", "finds a detail that helps answer it"],
      ["Pattern finder", "spots a connection"],
      ["Illustrator", "marks the clue with a symbol"],
      ["Fact checker", "separates noticing from guessing"],
      ["Presenter", "builds one shared conclusion"],
    ],
    handoff: "Join the question and evidence into one family conclusion.",
  },
  {
    roles: [
      ["Collector", "gathers four observations"],
      ["Selector", "chooses the strongest clue"],
      ["Label maker", "gives it a clear name"],
      ["Verifier", "checks it against the real place"],
      ["Memory keeper", "remembers the best moment"],
      ["Presenter", "explains why it matters"],
    ],
    handoff: "Switch roles for the last clue and make one family memory.",
  },
];

function namedSiblingMission(children: FamilyChild[], dayIndex: number) {
  const names = children.map((child, index) => familyChildDisplayName(child, index).slice(0, 24));
  const pattern = namedSiblingRolePatterns[dayIndex % namedSiblingRolePatterns.length];
  const available = names.map((_, index) => index);
  const assignments = pattern.roles.slice(0, names.length).map(([label, action], roleIndex) => {
    const preferred = /sketch|illustrat/i.test(label)
      ? children.findIndex((child) => child.interests.some((interest) => /draw|art|paint|craft|sketch/i.test(interest)) || child.preferredMechanics.includes("draw"))
      : -1;
    const selected = preferred >= 0 && available.includes(preferred)
      ? preferred
      : available[roleIndex % Math.max(1, available.length)];
    const availableIndex = available.indexOf(selected);
    if (availableIndex >= 0) available.splice(availableIndex, 1);
    return `${names[selected]} / ${label}: ${action}`;
  });
  return `${assignments.join("; ")}. ${pattern.handoff}`.slice(0, 280);
}

function familyMission(children: FamilyChild[], day: DayPlan, dayIndex: number) {
  const place = day.landmark?.short || "the place";
  if (children.length === 1) {
    const name = familyChildDisplayName(children[0], 0);
    const childJob = children[0].age <= 6
      ? `points and counts one repeated detail at ${place}`
      : children[0].age <= 9
        ? `finds the real clue at ${place}`
        : `records the strongest evidence at ${place}`;
    return `${name}: ${childJob}. Grown-up: tally or read the prompt. Swap who explains the result.`;
  }
  const ages = children.map((child) => child.age);
  if (Math.max(...ages) - Math.min(...ages) <= 2) return namedSiblingMission(children, dayIndex);
  const tasks = children.map((child, index) => {
    const name = familyChildDisplayName(child, index);
    if (child.interests.some((interest) => /draw|art|paint|craft|sketch/i.test(interest)) || child.preferredMechanics.includes("draw")) {
      return `${name} / Sketcher: draw one real shape and label where it appears`;
    }
    if (child.age <= 6) return `${name} / Counter: count or point to the repeated detail`;
    if (child.age <= 9) return `${name} / Comparer: compare two clues and label the difference`;
    return `${name} / Estimator: estimate the total and explain the evidence`;
  });
  return `${tasks.join("; ")}. Combine the answers at ${place}.`.slice(0, 280);
}

export function applySiblingPlan<T extends BookletDraft>(
  draft: T,
  familyOrHasSiblings: FamilyChild[] | boolean,
): T {
  const family = Array.isArray(familyOrHasSiblings) ? familyOrHasSiblings : null;
  const hasSiblings = family ? family.length > 1 : familyOrHasSiblings;
  const siblingMissionPatterns = [
    {
      withSiblings: "Scout and storyteller: one explorer spots the local detail while the other explains the clue. Swap roles before the next stop and combine both observations.",
      solo: "Scout and storyteller: show a grown-up one local detail, hear their question, then add one observation of your own to make a shared discovery.",
    },
    {
      withSiblings: "Sketcher and decoder: one explorer draws the shape or pattern while the other reads the clue and finds its local evidence. Trade jobs for the final answer.",
      solo: "Sketcher and decoder: draw one local shape or pattern, then explain to a grown-up which clue it helps you solve.",
    },
    {
      withSiblings: "Counter and comparer: one explorer counts or sorts what you see while the other compares the result with the page clue. Check the evidence together.",
      solo: "Counter and comparer: count or sort four local details, then compare your result with the page clue with a grown-up.",
    },
    {
      withSiblings: "Route keeper and lookout: one explorer chooses the next safe stop with a grown-up while the other watches for the named local clue. Swap who leads the check.",
      solo: "Route keeper and lookout: choose the next safe stop with a grown-up, then watch for the named local clue and explain why it helped.",
    },
    {
      withSiblings: "Question maker and evidence keeper: one explorer asks a why-or-how question while the other records a drawing, word, or detail that helps answer it. Build one shared conclusion.",
      solo: "Question maker and evidence keeper: ask a why-or-how question, then record a drawing, word, or detail that helps answer it with a grown-up.",
    },
    {
      withSiblings: "Collector and presenter: one explorer gathers four tiny observations while the other chooses the strongest and explains why it matters. Switch roles for the last clue.",
      solo: "Collector and presenter: gather four tiny observations, then choose the strongest one and explain to a grown-up why it matters.",
    },
  ];
  const seen = new Set<string>();
  return {
    ...draft,
    dayPlans: draft.dayPlans.map((day, index) => {
      if (family?.length) {
        return { ...day, siblingMission: familyMission(family, day, index) };
      }
      const existing = day.siblingMission?.trim();
      const normalized = existing?.toLocaleLowerCase();
      if (existing && normalized && !seen.has(normalized)) {
        seen.add(normalized);
        return day;
      }

      const pattern = siblingMissionPatterns[index % siblingMissionPatterns.length];
      const siblingMission = hasSiblings ? pattern.withSiblings : pattern.solo;
      seen.add(siblingMission.toLocaleLowerCase());
      return { ...day, siblingMission };
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
  editionFingerprint?: string;
  family?: FamilyChild[];
  events?: ItineraryEvent[];
  // Set by addCoverIllustration (app/lib/generation/illustration-ai.ts) when an AI-generated
  // hero image is available; the cover falls back to the hand-drawn
  // destination motif (app/lib/pdf/illustrations.ts) when absent, the same way
  // every other AI-illustrated element in the booklet degrades gracefully.
  coverIllustrationPath?: string;
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
    // A live 50-scenario test run found this generic message let Kimi
    // exhaust every correction attempt regenerating an equally-short value,
    // since it never learned the actual required length — stating the
    // bounds and what it actually sent gives the correction retry something
    // concrete to fix.
    throw new Error(
      `${label} must be between ${minimum} and ${maximum} characters (got ${text.length}: "${text}").`,
    );
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

function validateActivity(
  activityValue: unknown,
  activityLabel: number | string,
  dayIndex: number,
  expectedAge: number | undefined,
  usedTitles: Set<string>,
  mapPuzzleState: { count: number },
  requiresPresenceStrict: boolean,
  restrictTo?: GameType[],
) {
  const label = typeof activityLabel === "number" ? `Activity ${activityLabel + 1}` : activityLabel;
  if (!activityValue || typeof activityValue !== "object") {
    throw new Error(`${label} on day ${dayIndex + 1} is missing.`);
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
    throw new Error(`${label} on day ${dayIndex + 1} has an invalid game type.`);
  }
  if (
    expectedAge !== undefined &&
    !allowedGameTypesForAge(expectedAge).includes(declaredGameType as GameType)
  ) {
    throw new Error(
      `${declaredGameType} is not an age-${expectedAge} game type.`,
    );
  }
  if (restrictTo && !restrictTo.includes(declaredGameType as GameType)) {
    throw new Error(
      `${declaredGameType} is not a compact enough game type for ${label.toLocaleLowerCase()} on day ${dayIndex + 1}.`,
    );
  }
  if (!Array.isArray(activity.items) || activity.items.length !== 4) {
    throw new Error(
      `${label} on day ${dayIndex + 1} must contain exactly four game items.`,
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
    if (mapPuzzleState.count > 0) {
      gameType = "scavenger_hunt";
      title = renameActivityForMechanic(title, "Field Hunt");
      kind = "On-location field hunt";
    } else {
      mapPuzzleState.count += 1;
      if (/\bsudoku\b/i.test(title)) title = renameActivityForMechanic(title, "Route Challenge");
      if (/\bsudoku\b/i.test(kind)) kind = "Route-planning logic";
    }
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
    requiresPresence: requiresPresenceStrict
      ? activity.requiresPresence === true
      : Boolean(activity.requiresPresence),
    answerMode: activity.answerMode === "closed" ? "closed" as const : "open" as const,
    ...(typeof activity.illustrationPath === "string" && /^\/api\/illustration\?key=illustrations%2Fv(?:1|2)%2F[a-f0-9]{64}%2Fartwork\.png$/i.test(activity.illustrationPath)
      ? { illustrationPath: activity.illustrationPath }
      : {}),
  };
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
  const mapPuzzleState = { count: 0 };
  const dayPlans = draft.dayPlans.map((dayValue, dayIndex): DayPlan => {
    if (!dayValue || typeof dayValue !== "object") {
      throw new Error(`Day ${dayIndex + 1} is missing.`);
    }

    const day = dayValue as Record<string, unknown>;
    const slotValue = day.slots && typeof day.slots === "object"
      ? day.slots as Record<string, unknown>
      : null;
    const rawActivities = slotValue
      ? [slotValue.inThePlace, slotValue.sitDown]
      : day.activities;
    if (!Array.isArray(rawActivities) || rawActivities.length !== 2) {
      throw new Error(`Day ${dayIndex + 1} must contain an in-place and a sit-down activity.`);
    }

    const activities = rawActivities.map((activityValue, activityIndex) => validateActivity(
      activityValue,
      activityIndex,
      dayIndex,
      expectedAge,
      usedTitles,
      mapPuzzleState,
      activityIndex === 0 && Boolean(slotValue),
    ));

    const secondValue = slotValue?.inThePlaceSecond;
    const inThePlaceSecond = secondValue
      ? validateActivity(
          secondValue,
          "Second in-place activity",
          dayIndex,
          expectedAge,
          usedTitles,
          mapPuzzleState,
          true,
          pairEligibleGameTypes,
        )
      : undefined;

    const landmarkValue = day.landmark && typeof day.landmark === "object"
      ? day.landmark as Record<string, unknown>
      : null;
    const landmark = landmarkValue
      ? {
          display: requireText(landmarkValue.display, `Day ${dayIndex + 1} landmark display`, 3, 100),
          short: requireText(landmarkValue.short, `Day ${dayIndex + 1} landmark short name`, 2, 40),
          place: requireText(landmarkValue.place, `Day ${dayIndex + 1} landmark place`, 2, 70),
        }
      : {
          display: requireText(day.theme, `Day ${dayIndex + 1} theme`, 4, 80),
          short: "this place",
          place: requireText(day.theme, `Day ${dayIndex + 1} theme`, 4, 80),
        };
    const queueValue = slotValue?.whileYouWait && typeof slotValue.whileYouWait === "object"
      ? slotValue.whileYouWait as Record<string, unknown>
      : null;
    const queueGameValue = queueValue?.game && typeof queueValue.game === "object"
      ? queueValue.game as Record<string, unknown>
      : null;
    const queueItemsRaw = queueGameValue && Array.isArray(queueGameValue.items) ? queueGameValue.items : null;
    const queueGameTypeRaw = queueGameValue?.gameType;
    let queueGame: { gameType: GameType; items: { label: string; clue: string }[] } | undefined;
    if (queueItemsRaw && queueGameTypeRaw) {
      if (typeof queueGameTypeRaw !== "string" || !supportedGameTypes.includes(queueGameTypeRaw as GameType)) {
        throw new Error(`Day ${dayIndex + 1} queue game has an invalid game type.`);
      }
      if (!queueEligibleGameTypes.includes(queueGameTypeRaw as GameType)) {
        throw new Error(
          `${queueGameTypeRaw} is not a compact enough game type for the queue page on day ${dayIndex + 1}.`,
        );
      }
      if (
        expectedAge !== undefined &&
        !allowedGameTypesForAge(expectedAge).includes(queueGameTypeRaw as GameType)
      ) {
        throw new Error(`${queueGameTypeRaw} is not an age-${expectedAge} game type.`);
      }
      if (queueItemsRaw.length !== 4) {
        throw new Error(`Day ${dayIndex + 1} queue game must contain exactly four game items.`);
      }
      queueGame = {
        gameType: queueGameTypeRaw as GameType,
        items: queueItemsRaw.map((itemValue, itemIndex) => {
          if (!itemValue || typeof itemValue !== "object") {
            throw new Error(`Queue game item ${itemIndex + 1} on day ${dayIndex + 1} is missing.`);
          }
          const item = itemValue as Record<string, unknown>;
          return {
            label: requireText(item.label, `Queue game item label on day ${dayIndex + 1}`, 1, 36),
            clue: requireText(item.clue, `Queue game item clue on day ${dayIndex + 1}`, 4, 120),
          };
        }),
      };
    }
    // questReveal is a new top-level optional slot (same backward-compat
    // pattern as inThePlaceSecond): absent entirely for older editions and
    // for any generation Kimi doesn't comply on, strict when present for
    // revealText/chatPrompts. The mystery-target badge fields live in this
    // same object (moved here 2026-09-22 from whileYouWait, after live
    // testing found Kimi reliably returns revealText/chatPrompts here but
    // not the equivalent flat fields added to the already-crowded
    // whileYouWait object) and stay individually soft — never throw if
    // absent, only validate them when present.
    const questRevealValue = slotValue?.questReveal && typeof slotValue.questReveal === "object"
      ? slotValue.questReveal as Record<string, unknown>
      : null;
    const targetLabelRaw = typeof questRevealValue?.targetLabel === "string" ? questRevealValue.targetLabel.trim() : "";
    const targetLabel = targetLabelRaw
      ? requireText(targetLabelRaw, `Day ${dayIndex + 1} queue target label`, 2, 40)
      : undefined;
    const targetKindRaw = questRevealValue?.targetKind;
    const targetKind = typeof targetKindRaw === "string" && supportedQueueTargetKinds.includes(targetKindRaw as QueueTargetKind)
      ? targetKindRaw as QueueTargetKind
      : undefined;
    const bonusQuestRaw = typeof questRevealValue?.bonusQuest === "string" ? questRevealValue.bonusQuest.trim() : "";
    const bonusQuest = bonusQuestRaw
      ? requireText(bonusQuestRaw, `Day ${dayIndex + 1} queue bonus quest`, 4, 120)
      : undefined;
    const questRevealPhotoPath = typeof questRevealValue?.photoPath === "string" && /^\/api\/illustration\?key=illustrations%2Fv(?:1|2)%2F[a-f0-9]{64}%2Fartwork\.png$/i.test(questRevealValue.photoPath)
      ? questRevealValue.photoPath
      : undefined;
    const questReveal = questRevealValue
      ? {
          ...(targetLabel ? { targetLabel } : {}),
          ...(targetKind ? { targetKind } : {}),
          ...(bonusQuest ? { bonusQuest } : {}),
          // photoPath is set post-generation (not by Kimi), the same way
          // Activity.illustrationPath above is — must be preserved here the
          // same way, or addRevealPhoto's result gets silently dropped by
          // this validator on the very next pass (createBookletPdf always
          // re-validates). Went unnoticed until Cloudflare's free image
          // provider made addRevealPhoto actually succeed in practice; the
          // OpenAI path had failed on quota every time before that.
          ...(questRevealPhotoPath ? { photoPath: questRevealPhotoPath } : {}),
          revealText: requireText(questRevealValue.revealText, `Day ${dayIndex + 1} quest reveal text`, 10, 260),
          chatPrompts: (() => {
            const rawPrompts = Array.isArray(questRevealValue.chatPrompts) ? questRevealValue.chatPrompts : [];
            if (rawPrompts.length !== 2) {
              throw new Error(`Day ${dayIndex + 1} quest reveal must contain exactly two chat prompts.`);
            }
            return rawPrompts.map((prompt, promptIndex) => requireText(
              prompt,
              `Day ${dayIndex + 1} quest reveal chat prompt ${promptIndex + 1}`,
              4,
              140,
            )) as [string, string];
          })(),
        }
      : undefined;

    const rawFacts = slotValue && Array.isArray(slotValue.factCard)
      ? slotValue.factCard.filter((fact): fact is string => typeof fact === "string")
      : [];
    const factCard = rawFacts.length === 3
      ? rawFacts.map((fact, factIndex) => requireText(fact, `Fact ${factIndex + 1} on day ${dayIndex + 1}`, 4, 120))
      : [];
    const slots = {
      beforeYouGo: slotValue
        ? requireText(slotValue.beforeYouGo, `Day ${dayIndex + 1} grown-up note`, 4, 180)
        : `Grown-up: point out ${landmark.short} first.`,
      whileYouWait: queueValue
        ? {
            title: typeof queueValue.title === "string" && queueValue.title.trim()
              ? requireText(queueValue.title, `Day ${dayIndex + 1} queue title`, 3, 55)
              : "Count While You Wait",
            instruction: typeof queueValue.instruction === "string" && queueValue.instruction.trim()
              ? requireText(queueValue.instruction, `Day ${dayIndex + 1} queue instruction`, 4, 180)
              : `Count one repeated detail near ${landmark.short}.`,
            countLabel: typeof queueValue.countLabel === "string" && queueValue.countLabel.trim()
              ? requireText(queueValue.countLabel, `Day ${dayIndex + 1} queue count label`, 2, 40)
              : "I counted",
            countTo: Number.isInteger(queueValue.countTo) && Number(queueValue.countTo) >= 1 && Number(queueValue.countTo) <= 20
              ? Number(queueValue.countTo)
              : 5,
            required: queueValue.required === true,
            ...queueGame,
          }
        : {
            title: "Count While You Wait",
            instruction: `Count one repeated detail near ${landmark.short}.`,
            countLabel: "I counted",
            countTo: expectedAge && expectedAge <= 4 ? 5 : 10,
            required: false,
          },
      inThePlace: activities[0],
      ...(inThePlaceSecond ? { inThePlaceSecond } : {}),
      sitDown: activities[1],
      factCard,
      ...(questReveal ? { questReveal } : {}),
    };
    const normalizedDay: DayPlan = {
      ...(slotValue ? { architectureVersion: 2 as const } : {}),
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
      landmark,
      slots,
      activities,
    };
    // interestHook is a nice-to-have enhancement (per the composer prompt,
    // only ever set on days assigned an interest lens), not core content
    // like theme/mission — a live 50-scenario test run found Kimi sometimes
    // just echoes the bare interest word or phrase (e.g. "drawing") instead
    // of expanding it into a real lens sentence, which can exhaust every
    // correction attempt and fail the whole batch. Silently dropping a
    // too-short one instead of throwing matches the same "never block a
    // booklet over something Kimi structurally won't reliably comply with"
    // reasoning already used for whileYouWait's gameType/items below.
    if (typeof day.interestHook === "string" && day.interestHook.trim().length >= 12) {
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
    (candidate.editionFingerprint === undefined || /^[a-f0-9]{64}$/i.test(candidate.editionFingerprint)) &&
    Boolean(candidate.profile)
  );
}
