import type { DayPlan } from "./booklet.ts";
import type { GeneratedBookletData } from "./booklet-ai.ts";

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
    day.slots.inThePlace.title,
    day.slots.inThePlace.body,
    day.slots.inThePlace.prompt,
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
    day.slots.sitDown.body,
    day.slots.sitDown.prompt,
    ...(day.slots.inThePlace.items?.map((item) => item.clue) || []),
    ...(day.slots.sitDown.items?.map((item) => item.clue) || []),
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
    if (/\bYour child\b|THIS BOOK BELONGS TO/i.test(visibleDayText(day).join(" "))) {
      throw new Error(`Day ${day.day} contains an unresolved child-name placeholder.`);
    }
    const cardKey = normalizedSentence(`${day.slots.sitDown.title} ${day.slots.sitDown.prompt}`);
    if (cardKeys.has(cardKey)) throw new Error(`Day ${day.day} repeats a cut-out mission card.`);
    cardKeys.add(cardKey);
  });
  return booklet;
}
