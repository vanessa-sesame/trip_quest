import type { Activity } from "./booklet";

export const coloringScenes = [
  "skyline",
  "garden",
  "bridge",
  "market",
  "mountain",
  "temple",
] as const;

export type ColoringScene = (typeof coloringScenes)[number];

export function coloringSceneFor(activity: Pick<Activity, "title" | "items">): ColoringScene {
  const seed = `${activity.title}|${activity.items.map((item) => item.label).join("|")}`;
  let hash = 0;
  for (const character of seed) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return coloringScenes[hash % coloringScenes.length];
}
