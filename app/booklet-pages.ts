import type { Activity, DayPlan } from "./booklet.ts";

export type DayPageEntry =
  | { kind: "queue"; day: DayPlan; title: string }
  | { kind: "activity"; day: DayPlan; activity: Activity; activityIndex: 0 | 1; title: string };

export function bookletDayPageEntries(dayPlans: DayPlan[]): DayPageEntry[] {
  return dayPlans.flatMap((day) => [
    { kind: "queue" as const, day, title: day.slots?.whileYouWait.title || "Count While You Wait" },
    {
      kind: "activity" as const,
      day,
      activity: day.slots?.inThePlace || day.activities[0],
      activityIndex: 0 as const,
      title: (day.slots?.inThePlace || day.activities[0]).title,
    },
    {
      kind: "activity" as const,
      day,
      activity: day.slots?.sitDown || day.activities[1],
      activityIndex: 1 as const,
      title: (day.slots?.sitDown || day.activities[1]).title,
    },
  ]);
}

export function bookletCorePageTitles(dayPlans: DayPlan[]) {
  return [
    "Cover",
    "Quick note for grown-ups",
    ...bookletDayPageEntries(dayPlans).map((entry) => entry.title),
    "Grown-up answer notes",
    "Memory Museum",
    "Certificate",
  ];
}

export function bookletPageTotal(dayPlans: DayPlan[], includeFamilyPack = false) {
  return bookletCorePageTitles(dayPlans).length + (includeFamilyPack ? 4 : 0);
}
