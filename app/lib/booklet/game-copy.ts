import type { Activity } from "./booklet.ts";

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

export function gameLabel(activity: Pick<Activity, "gameType">) {
  return gameTypeLabels[activity.gameType || ""] || "Travel game";
}

// How each mechanic is played, written for the board as it is actually
// drawn (Start/Finish on the maze, questions on the quiz). This is render
// copy, not stored content, so it can change without touching editions.
export function gameInstruction(activity: Pick<Activity, "gameType">) {
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
