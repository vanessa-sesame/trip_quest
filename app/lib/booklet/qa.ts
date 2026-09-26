import type { DayPlan } from "./booklet.ts";
import type { GeneratedBookletData } from "../generation/booklet-ai.ts";

export function wordCount(value: string) {
  if (!value.trim()) return 0;
  // A standalone punctuation token (an em dash, an ellipsis) is not a word a
  // child has to read; only count tokens that contain a letter or digit.
  return value.trim().split(/\s+/).filter((token) => /[\p{L}\p{N}]/u.test(token)).length;
}

function normalizedSentence(value: string) {
  return value
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function sentences(values: string[]) {
  return values
    .flatMap((value) => value.split(/(?<=[.!?])\s+/))
    .map(normalizedSentence)
    .filter(Boolean);
}

function visibleDayText(day: DayPlan) {
  return [
    day.theme,
    day.focusLabel,
    day.mission,
    day.interestHook || "",
    day.siblingMission || "",
    day.slots.beforeYouGo,
    day.slots.whileYouWait.title,
    day.slots.whileYouWait.instruction,
    ...(day.slots.whileYouWait.items?.map((item) => item.clue) || []),
    day.slots.inThePlace.title,
    day.slots.inThePlace.body,
    day.slots.inThePlace.prompt,
    day.slots.inThePlaceSecond?.title || "",
    day.slots.inThePlaceSecond?.body || "",
    day.slots.inThePlaceSecond?.prompt || "",
    day.slots.sitDown.title,
    day.slots.sitDown.body,
    day.slots.sitDown.prompt,
    ...day.slots.factCard,
  ];
}

function assertFacts(day: DayPlan) {
  const facts = day.slots.factCard;
  if (facts.length !== 0 && facts.length !== 3) {
    throw new Error(`Day ${day.day} must contain either zero facts or exactly three facts.`);
  }
  facts.forEach((fact) => {
    if (wordCount(fact) > 15) throw new Error(`Day ${day.day} has a fact longer than 15 words.`);
    if (/^(?:look|find|count|draw|colour|color|trace|circle|tick|write|ask|try|spot)\b|\byou\b/i.test(fact)) {
      throw new Error(`Day ${day.day} uses an instruction in its fact box.`);
    }
  });
  const otherSentences = new Set(sentences(visibleDayText(day).filter((value) => !facts.includes(value))));
  const seenFacts = new Set<string>();
  facts.forEach((fact) => {
    const normalized = normalizedSentence(fact);
    if (seenFacts.has(normalized) || otherSentences.has(normalized)) {
      throw new Error(`Day ${day.day} repeats a fact sentence elsewhere on the page.`);
    }
    seenFacts.add(normalized);
  });
}

function assertLandmarkVariables(day: DayPlan) {
  const display = normalizedSentence(day.landmark.display);
  if (!display) throw new Error(`Day ${day.day} is missing its landmark display name.`);
  const forbidden = [
    day.mission,
    day.interestHook || "",
    day.siblingMission || "",
    day.slots.beforeYouGo,
    day.slots.whileYouWait.instruction,
    day.slots.inThePlace.body,
    day.slots.inThePlace.prompt,
    day.slots.inThePlaceSecond?.body || "",
    day.slots.inThePlaceSecond?.prompt || "",
    day.slots.sitDown.body,
    day.slots.sitDown.prompt,
    ...(day.slots.inThePlace.items?.map((item) => item.clue) || []),
    ...(day.slots.inThePlaceSecond?.items?.map((item) => item.clue) || []),
    ...(day.slots.sitDown.items?.map((item) => item.clue) || []),
    ...(day.slots.whileYouWait.items?.map((item) => item.clue) || []),
  ]
    .some((value) => normalizedSentence(value).includes(display));
  if (forbidden) {
    throw new Error(`Day ${day.day} uses the landmark display string inside a sentence.`);
  }
}

function assertFamily(day: DayPlan, familySize: number) {
  if (familySize !== 1 || !day.siblingMission) return;
  if (/\bone explorer\b.+\bthe other\b|siblings?|relay|swap roles|trade jobs/i.test(day.siblingMission)) {
    throw new Error(`Day ${day.day} describes multiple child explorers for a one-child roster.`);
  }
}

export function assertBookletQa(booklet: GeneratedBookletData) {
  const strictDays = booklet.dayPlans.filter((day) => day.architectureVersion === 2);
  if (!strictDays.length) return booklet;
  const cardKeys = new Set<string>();
  strictDays.forEach((day) => {
    assertLandmarkVariables(day);
    assertFacts(day);
    assertFamily(day, booklet.family?.length || 1);
    if (day.slots.whileYouWait.required && !day.slots.whileYouWait.instruction.trim()) {
      throw new Error(`Day ${day.day} is missing its required queue page.`);
    }
    if (!day.slots.inThePlace.requiresPresence) {
      throw new Error(`Day ${day.day} in-place puzzle can be completed before arrival.`);
    }
    if (day.slots.inThePlaceSecond && !day.slots.inThePlaceSecond.requiresPresence) {
      throw new Error(`Day ${day.day} second in-place puzzle can be completed before arrival.`);
    }
    if (/\bYour child\b|THIS BOOK BELONGS TO/i.test(visibleDayText(day).join(" "))) {
      throw new Error(`Day ${day.day} contains an unresolved child-name placeholder.`);
    }
    const cardKey = normalizedSentence(`${day.slots.sitDown.title} ${day.slots.sitDown.prompt}`);
    if (cardKeys.has(cardKey)) throw new Error(`Day ${day.day} repeats a cut-out mission card.`);
    cardKeys.add(cardKey);
  });
  return booklet;
}

const ORDINAL_LABEL = /^(first|second|third|fourth|fifth|1st|2nd|3rd|4th|5th)\b/i;
const COUNTER_SUFFIX = /\s*#?\d+$/;
const IMPERATIVE_CLUE = /^(draw|colou?r|write|sketch|trace)\b/i;
const CLUE_MECHANICS = new Set(["matching", "quiz", "bingo", "codebreaker"]);

export type RepairableSlot = "inThePlace" | "inThePlaceSecond" | "sitDown" | "whileYouWait";

// One composition-time content problem, tied to the game that has it so a
// repair can rewrite just that game instead of the whole day.
export type ContentProblem = { day: number; slot: RepairableSlot; message: string };

type ComposedGame = { slot: RepairableSlot; title: string; gameType?: string; items?: { label: string; clue: string }[] };

function composedGames(day: DayPlan): ComposedGame[] {
  const queue = day.slots.whileYouWait;
  const games: Array<ComposedGame | undefined> = [
    { slot: "inThePlace", ...day.slots.inThePlace },
    day.slots.inThePlaceSecond ? { slot: "inThePlaceSecond", ...day.slots.inThePlaceSecond } : undefined,
    { slot: "sitDown", ...day.slots.sitDown },
    queue.items ? { slot: "whileYouWait", title: queue.title, gameType: queue.gameType, items: queue.items } : undefined,
  ];
  return games.filter((game): game is ComposedGame => Boolean(game));
}

// Composition-time content rules. Unlike assertBookletQa these never run on
// stored booklets, so they can tighten over time without invalidating
// editions already saved. `plannedTypes` (inThePlace, sitDown) decides which
// game to change when two share a type: the one that left its schedule.
export function composedContentProblems(
  draft: { dayPlans: DayPlan[] },
  plannedTypes: Array<{ day: number; gameTypes: string[] }> = [],
): ContentProblem[] {
  const problems: ContentProblem[] = [];
  for (const day of draft.dayPlans) {
    const slots = (["inThePlace", "inThePlaceSecond", "sitDown"] as const)
      .filter((slot) => day.slots[slot]?.gameType)
      .map((slot) => ({ slot, gameType: day.slots[slot]!.gameType! }));
    const plan = plannedTypes.find((entry) => entry.day === day.day)?.gameTypes ?? [];
    const planned: Partial<Record<RepairableSlot, string>> = { inThePlace: plan[0], sitDown: plan[1] };
    for (const [index, entry] of slots.entries()) {
      const clash = slots.slice(0, index).find((other) => other.gameType === entry.gameType);
      if (!clash) continue;
      // Change the free second game first, then whichever left its schedule.
      const target = [entry, clash].find((candidate) => candidate.slot === "inThePlaceSecond")
        ?? [entry, clash].find((candidate) => planned[candidate.slot] && planned[candidate.slot] !== candidate.gameType)
        ?? entry;
      problems.push({
        day: day.day,
        slot: target.slot,
        message: `Day ${day.day} uses ${entry.gameType} for more than one game; its in-place, second in-place and sit-down games must be three different game types (follow the assigned schedule).`,
      });
    }
    for (const game of composedGames(day)) {
      const items = game.items ?? [];
      const labels = items.map((item) => item.label.trim());
      const ordinal = labels.filter((label) => ORDINAL_LABEL.test(label));
      const stems = labels.map((label) => label.replace(COUNTER_SUFFIX, "").trim().toLocaleLowerCase());
      // "Photo 1 / Photo 2" is filler; a bare number ("1882", a code digit)
      // is a real answer, so only labels with a word stem count.
      const counted = labels.filter((label, index) =>
        COUNTER_SUFFIX.test(label) && stems[index] !== "" && stems.filter((stem) => stem === stems[index]).length > 1,
      );
      const filler = [...new Set([...ordinal, ...counted])];
      if (filler.length) {
        problems.push({
          day: day.day,
          slot: game.slot,
          message: `Day ${day.day} "${game.title}" uses numbered filler labels (${filler.join(", ")}); give its four items four different, specific local things instead.`,
        });
      }
      if (game.gameType && CLUE_MECHANICS.has(game.gameType)) {
        const imperative = items.filter((item) => IMPERATIVE_CLUE.test(item.clue.trim()));
        if (imperative.length) {
          problems.push({
            day: day.day,
            slot: game.slot,
            message: `Day ${day.day} "${game.title}" is a ${game.gameType} game but its clues are drawing/writing instructions ("${imperative[0].clue}"); write clues that describe or ask about a real local detail.`,
          });
        }
      }
      if (game.gameType === "quiz") {
        const notQuestions = items.filter((item) => !item.clue.includes("?"));
        if (notQuestions.length) {
          problems.push({
            day: day.day,
            slot: game.slot,
            message: `Day ${day.day} "${game.title}" is a quiz but "${notQuestions[0].clue}" is not a question; each quiz clue must be a real question whose answer is its label.`,
          });
        }
      }
    }
  }
  return problems;
}

export function composedContentIssues(draft: { dayPlans: DayPlan[] }) {
  return composedContentProblems(draft).map((problem) => problem.message);
}
