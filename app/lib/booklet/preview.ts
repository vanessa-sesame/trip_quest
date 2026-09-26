import type { Activity, DayPlan } from "./booklet.ts";
import type { GeneratedBookletData } from "../generation/booklet-ai.ts";
import { bookletDayPageEntries, type DayPageEntry } from "./pages.ts";

export const FREE_PREVIEW_PAGE_COUNT = 3;
export const FULL_PREVIEW_FOR_TESTERS = true;

const lockedItems = [
  { label: "Locked", clue: "Included in the printable booklet." },
  { label: "Locked", clue: "Included in the printable booklet." },
  { label: "Locked", clue: "Included in the printable booklet." },
  { label: "Locked", clue: "Included in the printable booklet." },
];

function lockedActivity(): Activity {
  return {
    title: "Locked printable page",
    kind: "Full booklet activity",
    body: "This activity is included in the printable booklet.",
    prompt: "Unlock the printable booklet to continue.",
    gameType: "story",
    items: lockedItems.map((item) => ({ ...item })),
  };
}

// Only the payoff (revealText/chatPrompts) is locked — targetLabel/
// targetKind/bonusQuest stay visible as a teaser, matching how whileYouWait
// itself has never been content-locked (it's the queue page's own visible
// content, not the paid reveal page).
function lockedQuestReveal(
  reveal: NonNullable<DayPlan["slots"]["questReveal"]>,
): NonNullable<DayPlan["slots"]["questReveal"]> {
  return {
    ...reveal,
    revealText: "Included in the printable booklet.",
    chatPrompts: ["Unlock the printable booklet to continue.", "Unlock the printable booklet to continue."],
  };
}

export function isBookletPageLocked(
  pageIndex: number,
  fullPreview = FULL_PREVIEW_FOR_TESTERS,
) {
  return !fullPreview && pageIndex >= FREE_PREVIEW_PAGE_COUNT;
}

export function createBookletPreview(
  booklet: GeneratedBookletData,
  fullPreview = FULL_PREVIEW_FOR_TESTERS,
): GeneratedBookletData {
  if (fullPreview) return booklet;

  // Derived from the same manifest bookletCorePageTitles/page.tsx's pager
  // already use, rather than assuming a fixed stride — a day can be 3 or 4
  // pages now (the "Found It!" reveal page is conditional), so "day N's
  // inThePlace is always page 3 + dayIndex*3" no longer holds.
  const entries = bookletDayPageEntries(booklet.dayPlans);
  // +2 for the two leading pages (cover, guide) that come before any day
  // page in this same index space, matching FREE_PREVIEW_PAGE_COUNT = 3
  // (cover + guide + day-1's queue page are free).
  const pageIndexFor = (day: DayPlan, match: (entry: DayPageEntry) => boolean) => {
    const index = entries.findIndex((entry) => entry.day === day && match(entry));
    return index === -1 ? -1 : index + 2;
  };

  return {
    ...booklet,
    dayPlans: booklet.dayPlans.map((day, dayIndex) => {
      const locked = (match: (entry: DayPageEntry) => boolean) => isBookletPageLocked(pageIndexFor(day, match), false);
      const inThePlaceLocked = locked((entry) => entry.kind === "activity" && entry.slot === "inThePlace");
      const secondLocked = locked((entry) => entry.kind === "activity" && entry.slot === "inThePlaceSecond");
      const sitDownLocked = locked((entry) => entry.kind === "activity" && entry.slot === "sitDown");
      const queueGameLocked = locked((entry) => entry.kind === "queueGame");
      const revealLocked = locked((entry) => entry.kind === "reveal");
      const queue = day.slots?.whileYouWait;
      return {
        ...day,
        theme: dayIndex === 0 ? day.theme : `Day ${day.day} adventure`,
        focusLabel: dayIndex === 0 ? day.focusLabel : "Printable activity",
        mission:
          dayIndex === 0
            ? day.mission
            : "Included in the complete printable booklet.",
        slots: {
          ...day.slots,
          inThePlace: inThePlaceLocked ? lockedActivity() : day.slots.inThePlace,
          ...(day.slots?.inThePlaceSecond
            ? { inThePlaceSecond: secondLocked ? lockedActivity() : day.slots.inThePlaceSecond }
            : {}),
          // The queue game has its own page; its board locks with that page
          // while the counting prompt on the briefing page stays visible.
          ...(queue && queueGameLocked
            ? { whileYouWait: { ...queue, gameType: "story" as const, items: lockedItems.map((item) => ({ ...item })) } }
            : {}),
          sitDown: sitDownLocked ? lockedActivity() : day.slots.sitDown,
          ...(day.slots?.questReveal
            ? { questReveal: revealLocked ? lockedQuestReveal(day.slots.questReveal) : day.slots.questReveal }
            : {}),
        },
        activities: [
          inThePlaceLocked ? lockedActivity() : day.slots.inThePlace,
          sitDownLocked ? lockedActivity() : day.slots.sitDown,
        ],
      };
    }),
  };
}
