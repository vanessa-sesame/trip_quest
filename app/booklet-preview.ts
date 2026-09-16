import type { Activity } from "./booklet";
import type { GeneratedBookletData } from "./booklet-ai";

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

  return {
    ...booklet,
    dayPlans: booklet.dayPlans.map((day, dayIndex) => ({
      ...day,
      theme: dayIndex === 0 ? day.theme : `Day ${day.day} adventure`,
      focusLabel: dayIndex === 0 ? day.focusLabel : "Printable activity",
      mission:
        dayIndex === 0
          ? day.mission
          : "Included in the complete printable booklet.",
      activities: day.activities.map((activity, activityIndex) => {
        const pageIndex = 2 + dayIndex * 2 + activityIndex;
        return isBookletPageLocked(pageIndex, false)
          ? lockedActivity()
          : activity;
      }),
    })),
  };
}
