import type { Activity, DifferenceRegion } from "./booklet.ts";

// Player-facing names and how-to-play lines for each game type, shared by
// the printable PDF and the web preview so both say the same thing.

// Human names for game types. Raw enum values never reach the page.
export const gameTypeLabels: Record<string, string> = {
  coloring: "Coloring and tracing",
  drawing: "Drawing studio",
  crossword: "Mini crossword",
  word_search: "Word search",
  maze: "Maze",
  matching: "Match-up",
  bingo: "Explorer bingo",
  spot_the_difference: "Look and find",
  codebreaker: "Codebreaker",
  map_puzzle: "Route planner",
  scavenger_hunt: "Scavenger hunt",
  quiz: "Quick quiz",
  story: "Story studio",
};

type GameCopyInput = Pick<Activity, "gameType" | "differencePaths">;

// Spot-the-difference is only a picture game once it has its picture pair;
// without one it is played as a look-and-find checklist.
export function hasDifferencePictures(activity: GameCopyInput) {
  return activity.gameType === "spot_the_difference" && Boolean(activity.differencePaths);
}

export function gameLabel(activity: GameCopyInput) {
  if (hasDifferencePictures(activity)) return "Spot 3 differences";
  return gameTypeLabels[activity.gameType || ""] || "Travel game";
}

// "top left", "middle right"... for where a difference sits in picture B.
export function differencePosition(region: Pick<DifferenceRegion, "x" | "y" | "w" | "h">) {
  const cx = region.x + region.w / 2;
  const cy = region.y + region.h / 2;
  const vertical = cy < 1 / 3 ? "top" : cy > 2 / 3 ? "bottom" : "middle";
  const horizontal = cx < 1 / 3 ? "left" : cx > 2 / 3 ? "right" : "centre";
  return vertical === "middle" && horizontal === "centre" ? "centre" : `${vertical} ${horizontal}`;
}

// How each mechanic is played, written for the board as it is actually
// drawn (Start/Finish on the maze, questions on the quiz). This is render
// copy, not stored content, so it can change without touching editions.
export function gameInstruction(activity: GameCopyInput) {
  if (hasDifferencePictures(activity)) return "Find the 3 things that changed in picture B and circle them.";
  switch (activity.gameType) {
    case "word_search":
      return "Find each word in the grid and circle it. Tick it off below.";
    case "crossword":
      return "Solve each clue, then write the answer in the matching squares.";
    case "maze":
      return "Trace one path from Start to Finish without crossing a wall.";
    case "matching":
      return "Draw a line from each word to the clue that matches it.";
    case "bingo":
      return "Spot these in the real place. Tick the circle when you find one.";
    case "spot_the_difference":
      return "Look closely around you and tick each detail when you find it.";
    case "codebreaker":
      return "Use the key and the clue to crack the secret word.";
    case "map_puzzle":
      return "Plan a route from S to F that visits every numbered stop.";
    case "scavenger_hunt":
      return "Tick each detail when you find it. Leave everything where it belongs.";
    case "quiz":
      return "Look around for each answer and write it on the line.";
    case "drawing":
      return "Look closely, then draw one detail you noticed.";
    case "coloring":
      return "Color the picture, spot the details, then trace the word.";
    default:
      return "Use the story sparks to make up a tiny travel story.";
  }
}

// A title as printed: stored titles can start with a separator left behind
// when a mechanic word was removed ("Crossword: Tile Code" -> ": Tile Code").
export function displayTitle(title: string) {
  return title.replace(/^[\s:|\-–—]+/, "").trim() || title;
}

// Whether the activity's intro paragraph is shown. Maze intros are
// generated from item names ("from START to DETOUR") and would contradict
// the Start/Finish board; spot-the-difference skips its intro too (its
// how-to line says it all, and its look-and-find fallback has no pictures).
export function showsActivityBody(activity: Pick<Activity, "gameType" | "body">) {
  return Boolean(activity.body) && activity.gameType !== "maze" && activity.gameType !== "spot_the_difference";
}
