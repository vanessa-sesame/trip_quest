import type { Activity, DayPlan } from "./booklet.ts";
import type { GeneratedBookletData } from "./booklet-ai.ts";

export type ReaderBand = {
  reader: string;
  instructionWords: number | null;
  childPageWords: number | null;
  childElement: string;
};

export function readerBandForAge(age: number): ReaderBand {
  if (age <= 4) return {
    reader: "Adult only",
    instructionWords: 12,
    childPageWords: 40,
    childElement: "Colour, point, and count to 5",
  };
  if (age <= 6) return {
    reader: "Adult reads aloud",
    instructionWords: 20,
    childPageWords: 60,
    childElement: "Trace, tick, count to 20, and make one drawing",
  };
  if (age <= 9) return {
    reader: "Child, helped",
    instructionWords: 40,
    childPageWords: 105,
    childElement: "Write single words, match, and solve simple codes",
  };
  return {
    reader: "Child alone",
    instructionWords: null,
    childPageWords: null,
    childElement: "Sketch, write sentences, and solve real puzzles",
  };
}

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

function activityWords(activity: Activity) {
  return wordCount([
    activity.body,
    activity.prompt,
    ...(activity.items || []).flatMap((item) => [item.label, item.clue]),
  ].join(" "));
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

function assertAgeBudget(day: DayPlan, age: number) {
  const band = readerBandForAge(age);
  if (band.instructionWords !== null) {
    [
      ["before-you-go", day.slots.beforeYouGo],
      ["queue", day.slots.whileYouWait.instruction],
      ["in-place", day.slots.inThePlace.body],
      ["sit-down", day.slots.sitDown.body],
    ].forEach(([label, value]) => {
      if (wordCount(value) > band.instructionWords!) {
        throw new Error(`Day ${day.day} ${label} instruction exceeds the age-${age} limit.`);
      }
    });
  }
  if (band.childPageWords !== null) {
    const queueWords = wordCount([
      day.slots.whileYouWait.instruction,
      day.slots.whileYouWait.countLabel,
      ...day.slots.factCard,
    ].join(" "));
    if (queueWords > band.childPageWords) {
      throw new Error(`Day ${day.day} queue page exceeds the age-${age} word budget.`);
    }
    [day.slots.inThePlace, day.slots.sitDown].forEach((activity) => {
      if (activityWords(activity) > band.childPageWords!) {
        throw new Error(`Day ${day.day} “${activity.title}” exceeds the age-${age} word budget.`);
      }
    });
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
    assertAgeBudget(day, booklet.age);
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
