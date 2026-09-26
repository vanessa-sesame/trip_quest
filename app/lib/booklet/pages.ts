import type { Activity, DayPlan } from "./booklet.ts";

export type ActivitySlot = "inThePlace" | "inThePlaceSecond" | "sitDown";

export type DayPageEntry =
  | { kind: "queue"; day: DayPlan; title: string }
  | { kind: "queueGame"; day: DayPlan; activity: Activity; title: string }
  | { kind: "reveal"; day: DayPlan; title: string }
  | { kind: "activity"; day: DayPlan; activity: Activity; slot: ActivitySlot; title: string };

// The queue slot's optional real game, as a regular activity. Present only
// when composition supplied both a game type and its items.
export function queueGameActivity(day: DayPlan): Activity | undefined {
  const queue = day.slots?.whileYouWait;
  if (!queue?.gameType || !queue.items?.length) return undefined;
  return {
    title: queue.title,
    kind: "Queue game",
    // queue.instruction is the counting prompt on the day's briefing page;
    // the game page explains its own mechanic instead.
    body: "",
    prompt: "",
    gameType: queue.gameType,
    items: queue.items,
  };
}

// The seed string a game's puzzle or scene is derived from. The PDF and the
// web preview both use it, so they show the same grid, maze and scene. The
// first two keep their original numbering so existing editions render
// unchanged.
export function activityContext(day: DayPlan, slot: ActivitySlot | "queueGame") {
  if (slot === "queueGame") return `${day.theme} - day ${day.day} - queue game`;
  const game = slot === "inThePlace" ? 1 : slot === "sitDown" ? 2 : 3;
  return `${day.theme} - day ${day.day} - game ${game}`;
}

// One page per entry, in print order, shared by the PDF and the web pager
// so both show the same pages. An A5 page holds one game, so every game
// (the queue game, both in-place games, the sit-down game) gets its own.
export function bookletDayPageEntries(dayPlans: DayPlan[]): DayPageEntry[] {
  return dayPlans.flatMap((day): DayPageEntry[] => {
    const queueGame = queueGameActivity(day);
    const inThePlace = day.slots?.inThePlace || day.activities[0];
    const second = day.slots?.inThePlaceSecond;
    const sitDown = day.slots?.sitDown || day.activities[1];
    return [
      { kind: "queue", day, title: day.slots?.whileYouWait.title || "Count While You Wait" },
      ...(queueGame ? [{ kind: "queueGame" as const, day, activity: queueGame, title: queueGame.title }] : []),
      // Only present when composition supplied questReveal. Not gated on
      // targetLabel: the reveal page reads fine without the queue badge.
      ...(day.slots?.questReveal ? [{ kind: "reveal" as const, day, title: "Found It!" }] : []),
      { kind: "activity", day, activity: inThePlace, slot: "inThePlace", title: inThePlace.title },
      ...(second ? [{ kind: "activity" as const, day, activity: second, slot: "inThePlaceSecond" as const, title: second.title }] : []),
      { kind: "activity", day, activity: sitDown, slot: "sitDown", title: sitDown.title },
    ];
  });
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

// day.activities stays the legacy [inThePlace, sitDown] pair everywhere it is
// read by index today. Call sites that also need the optional second
// in-place activity (the answer key, coloring-artwork lookups) use this
// instead of changing what day.activities contains.
export function dayGameActivities(day: DayPlan): Activity[] {
  return [day.slots?.inThePlace, day.slots?.inThePlaceSecond, day.slots?.sitDown]
    .filter((activity): activity is Activity => Boolean(activity));
}
