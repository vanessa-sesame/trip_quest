import type { Activity } from "./booklet";

export const coloringScenes = [
  "skyline",
  "garden",
  "bridge",
  "market",
  "mountain",
  "temple",
  "cave",
  "shophouse",
] as const;

export type ColoringScene = (typeof coloringScenes)[number];

export function coloringSceneFor(activity: Pick<Activity, "title" | "items">): ColoringScene {
  const visibleText = `${activity.title} ${activity.items.map((item) => `${item.label} ${item.clue}`).join(" ")}`.toLocaleLowerCase();
  if (/cave|karst|limestone|grotto|cavern/.test(visibleText)) return "cave";
  if (/shophouse|shop house|street shop|old town|lantern/.test(visibleText)) return "shophouse";
  if (/train|railway|station|mrt|metro/.test(visibleText)) return "bridge";
  if (/market|hawker|food|meal|street stall/.test(visibleText)) return "market";
  if (/temple|mosque|shrine|pagoda/.test(visibleText)) return "temple";
  const seed = `${activity.title}|${activity.items.map((item) => item.label).join("|")}`;
  let hash = 0;
  for (const character of seed) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return coloringScenes[hash % coloringScenes.length];
}
