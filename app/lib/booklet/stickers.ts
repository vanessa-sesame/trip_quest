import type { DayPlan, GameType } from "./booklet.ts";
import { queueGameActivity, type ActivitySlot } from "./pages.ts";
import { FAMILY_BADGES } from "../family.ts";

// Every sticker in a kit and the spot in the booklet it belongs to. The
// booklet draws a spot for each sticker and the sticker sheets print one
// sticker for each, both from this one list, so they always match.

export type StickerIcon =
  | "star" | "heart" | "magnifier" | "pencil" | "pin" | "maze" | "check"
  | "sparkle" | "crown" | "flag" | "key" | "question" | "book" | "envelope" | "sun";

export type StickerKind = "game" | "day" | "name" | "milestone" | "seal" | "master" | "badge" | "bonus" | "envelopeSeal";

export type StickerSpot =
  | { page: "activity"; day: number; slot: ActivitySlot | "queueGame" }
  | { page: "dayBadge"; day: number }
  | { page: "cover" }
  | { page: "treats"; milestone: number }
  | { page: "certificate" }
  | { page: "badges"; index: number }
  | { page: "none" };

export type Sticker = {
  id: string;
  kind: StickerKind;
  // "game" stickers travel with the booklet; "envelope" stickers go inside
  // the mystery envelope, opened at the end of the treat trail.
  sheet: "game" | "envelope";
  label: string;
  icon: StickerIcon;
  // 0-3: which of the booklet's four accent colours the sticker uses.
  tone: number;
  spot: StickerSpot;
};

const gameCheers: Record<GameType, { label: string; icon: StickerIcon }> = {
  word_search: { label: "Word finder!", icon: "magnifier" },
  crossword: { label: "Clue cracker!", icon: "pencil" },
  maze: { label: "Maze master!", icon: "maze" },
  matching: { label: "Match maker!", icon: "heart" },
  bingo: { label: "Bingo!", icon: "star" },
  spot_the_difference: { label: "Sharp eyes!", icon: "magnifier" },
  codebreaker: { label: "Code cracker!", icon: "key" },
  map_puzzle: { label: "Route boss!", icon: "pin" },
  scavenger_hunt: { label: "Found them!", icon: "check" },
  quiz: { label: "Quiz whiz!", icon: "question" },
  drawing: { label: "Artist!", icon: "pencil" },
  coloring: { label: "Colour star!", icon: "sparkle" },
  story: { label: "Storyteller!", icon: "book" },
};

export function gameCheer(gameType: GameType | undefined) {
  return gameCheers[gameType ?? "story"] ?? gameCheers.story;
}

// The treat-trail stops for a trip: after day 1, halfway, and at the end.
export function treatMilestones(days: number) {
  if (days <= 1) return [{ label: "Day 1 done!", afterDay: 1 }];
  if (days === 2) return [{ label: "Day 1 done!", afterDay: 1 }, { label: "Trip done!", afterDay: 2 }];
  return [
    { label: "Day 1 done!", afterDay: 1 },
    { label: "Halfway there!", afterDay: Math.ceil(days / 2) },
    { label: "Trip done!", afterDay: days },
  ];
}

export function stickerPlan(
  booklet: { destination: string; dayPlans: DayPlan[] },
  options: { familyPack: boolean; childName?: string },
): Sticker[] {
  const stickers: Sticker[] = [];
  const name = options.childName?.trim();
  stickers.push({ id: "name", kind: "name", sheet: "game", label: name || "Explorer", icon: "star", tone: 0, spot: { page: "cover" } });

  booklet.dayPlans.forEach((day, index) => {
    const tone = index % 4;
    const queueGame = queueGameActivity(day);
    const games: Array<{ slot: ActivitySlot | "queueGame"; gameType: GameType | undefined }> = [
      ...(queueGame ? [{ slot: "queueGame" as const, gameType: queueGame.gameType }] : []),
      { slot: "inThePlace", gameType: day.slots.inThePlace.gameType },
      ...(day.slots.inThePlaceSecond ? [{ slot: "inThePlaceSecond" as const, gameType: day.slots.inThePlaceSecond.gameType }] : []),
      { slot: "sitDown", gameType: day.slots.sitDown.gameType },
    ];
    for (const game of games) {
      const cheer = gameCheer(game.gameType);
      stickers.push({
        id: `game-${day.day}-${game.slot}`,
        kind: "game",
        sheet: "game",
        label: cheer.label,
        icon: cheer.icon,
        tone,
        spot: { page: "activity", day: day.day, slot: game.slot },
      });
    }
    stickers.push({ id: `day-${day.day}`, kind: "day", sheet: "game", label: `Day ${day.day} done!`, icon: "sun", tone, spot: { page: "dayBadge", day: day.day } });
  });

  treatMilestones(booklet.dayPlans.length).forEach((milestone, index) => {
    stickers.push({ id: `treat-${index}`, kind: "milestone", sheet: "game", label: milestone.label, icon: "heart", tone: (index + 1) % 4, spot: { page: "treats", milestone: index } });
  });

  stickers.push({ id: "envelope-seal", kind: "envelopeSeal", sheet: "envelope", label: "Open me at the end of your treat trail!", icon: "envelope", tone: 3, spot: { page: "none" } });
  stickers.push({ id: "seal", kind: "seal", sheet: "envelope", label: `${booklet.destination} Explorer`, icon: "star", tone: 2, spot: { page: "certificate" } });
  stickers.push({ id: "master", kind: "master", sheet: "envelope", label: "Master Explorer", icon: "crown", tone: 0, spot: { page: "none" } });
  if (options.familyPack) {
    FAMILY_BADGES.forEach((badge, index) => {
      stickers.push({ id: `badge-${index}`, kind: "badge", sheet: "envelope", label: badge, icon: (["magnifier", "heart", "star", "sparkle", "pin", "book", "flag", "check"] as StickerIcon[])[index % 8], tone: index % 4, spot: { page: "badges", index } });
    });
  }
  // Bonus stickers fill the envelope sheet: a surprise with no set spot.
  const envelopeCount = stickers.filter((sticker) => sticker.sheet === "envelope").length;
  const bonusIcons: StickerIcon[] = ["star", "heart", "sparkle", "pin", "sun", "flag"];
  for (let index = 0; envelopeCount + index < 20 && index < 6; index += 1) {
    stickers.push({ id: `bonus-${index}`, kind: "bonus", sheet: "envelope", label: index === 0 ? booklet.destination : ["Wow!", "Brave!", "Curious!", "Kind!", "Explorer!"][(index - 1) % 5], icon: bonusIcons[index], tone: index % 4, spot: { page: "none" } });
  }
  return stickers;
}

export function stickerForSpot(stickers: Sticker[], spot: StickerSpot) {
  return stickers.find((sticker) => JSON.stringify(sticker.spot) === JSON.stringify(spot));
}

// The kit's stickers for a booklet as printed: the family pack decides the
// badge stickers, and the lead child's name (unless it is a placeholder
// like "Explorer 1") goes on the name sticker.
export function stickersForBooklet(
  booklet: { destination: string; dayPlans: DayPlan[]; family?: Array<{ name: string }> },
  familyPack?: { children: Array<{ name: string }> },
) {
  const name = familyPack?.children[0]?.name ?? booklet.family?.[0]?.name ?? "";
  return stickerPlan(booklet, {
    familyPack: Boolean(familyPack),
    childName: /^explorer\s*\d*$/i.test(name.trim()) ? undefined : name,
  });
}
