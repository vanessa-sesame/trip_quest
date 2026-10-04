import type { Activity } from "../booklet/booklet.ts";
import { hasDifferencePictures } from "../booklet/game-copy.ts";
import { bookletDayPageEntries, dayGameActivities, type DayPageEntry } from "../booklet/pages.ts";
import { type GeneratedBookletData, validateBookletDraft } from "../generation/booklet-ai.ts";

// The printed page order, with no pdf-lib dependency, so the web preview's
// pager can list the same pages the PDF will have without loading the
// renderer.

export type AnswerEntry = { day: number; index: number; activity: Activity };

// Closed-answer entries per answer-notes page. Each entry is at most one
// title line plus two answer lines, so this always fits an A5 page.
export const ANSWERS_PER_PAGE = 8;
// Day cards per family-relay page (two columns of three).
export const RELAY_DAYS_PER_PAGE = 6;

export type BookletPage =
  | { kind: "cover" }
  | { kind: "guide" }
  | { kind: "treats" }
  | { kind: "day"; entry: DayPageEntry }
  | { kind: "notes" }
  | { kind: "answers"; entries: AnswerEntry[]; part: number; parts: number }
  | { kind: "memory" }
  | { kind: "certificate" }
  | { kind: "relay"; days: GeneratedBookletData["dayPlans"]; part: number; parts: number }
  | { kind: "familyMission" }
  | { kind: "missionCards" }
  | { kind: "badges" };

function chunk<T>(values: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) chunks.push(values.slice(index, index + size));
  return chunks.length ? chunks : [[]];
}

export function answerEntriesForBooklet(booklet: GeneratedBookletData): AnswerEntry[] {
  return booklet.dayPlans.flatMap((day) =>
    dayGameActivities(day)
      .map((activity, index) => ({ day: day.day, index, activity }))
      .filter((entry) => entry.activity.answerMode === "closed" || hasDifferencePictures(entry.activity)),
  );
}

export function answerPagesForBooklet(booklet: GeneratedBookletData) {
  const answerChunks = chunk(answerEntriesForBooklet(booklet), ANSWERS_PER_PAGE);
  return answerChunks.map((entries, index) => ({ kind: "answers" as const, entries, part: index + 1, parts: answerChunks.length }));
}

export function normalizedBooklet(booklet: GeneratedBookletData): GeneratedBookletData {
  return { ...booklet, ...validateBookletDraft(booklet, booklet.days, booklet.age) };
}

// A5 booklets are printed as folded sheets, so the total is padded to a
// multiple of 4 with "My notes" pages after the days.
export function planBookletPages(booklet: GeneratedBookletData, includeFamilyPack: boolean): BookletPage[] {
  const relayChunks = chunk(booklet.dayPlans, RELAY_DAYS_PER_PAGE);
  const front: BookletPage[] = [
    { kind: "cover" },
    { kind: "guide" },
    { kind: "treats" },
    ...bookletDayPageEntries(booklet.dayPlans).map((entry) => ({ kind: "day" as const, entry })),
  ];
  const back: BookletPage[] = [
    { kind: "memory" },
    { kind: "certificate" },
    ...(includeFamilyPack
      ? [
          ...relayChunks.map((days, index) => ({ kind: "relay" as const, days, part: index + 1, parts: relayChunks.length })),
          { kind: "familyMission" as const },
          { kind: "missionCards" as const },
          { kind: "badges" as const },
        ]
      : []),
  ];
  const padding = (4 - ((front.length + back.length) % 4)) % 4;
  return [...front, ...Array.from({ length: padding }, () => ({ kind: "notes" as const })), ...back];
}

export function bookletPdfPageCount(booklet: GeneratedBookletData, includeFamilyPack = false) {
  return planBookletPages(normalizedBooklet(booklet), includeFamilyPack).length;
}

function pageTitle(page: BookletPage) {
  switch (page.kind) {
    case "cover": return "Cover";
    case "guide": return "For grown-ups";
    case "treats": return "Treat trail";
    case "day": return page.entry.kind === "reveal" ? `Day ${page.entry.day.day}: Found it!` : `Day ${page.entry.day.day}: ${page.entry.title}`;
    case "notes": return "My notes";
    case "answers": return page.parts > 1 ? `Answer notes ${page.part}` : "Answer notes";
    case "memory": return "Memory museum";
    case "certificate": return "Certificate";
    case "relay": return page.parts > 1 ? `Family relay ${page.part}` : "Family relay";
    case "familyMission": return "Family mission map";
    case "missionCards": return "Mission cards";
    case "badges": return "Badge tracker";
  }
}

// One title per printed page, in order: the web pager's page list.
export function bookletPdfPageTitles(booklet: GeneratedBookletData, includeFamilyPack = false) {
  return planBookletPages(normalizedBooklet(booklet), includeFamilyPack).map(pageTitle);
}
