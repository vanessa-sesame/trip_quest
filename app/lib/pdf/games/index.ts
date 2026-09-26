import type { Activity } from "../../booklet/booklet.ts";
import { differencePosition, hasDifferencePictures } from "../../booklet/game-copy.ts";
export { gameInstruction, gameLabel, gameTypeLabels } from "../../booklet/game-copy.ts";
import { normalizePuzzleWord } from "../../booklet/puzzles.ts";
import { drawColoringBoard, drawDifferencePictures, drawDrawingBoard } from "./art.ts";
import { drawBingo, drawChecklist, drawLookAndFind, drawMatching, drawQuiz, drawStory } from "./cards.ts";
import { codebreakerPhrase, drawCodebreaker, drawCrossword, drawMaze, drawWordSearch } from "./grids.ts";
import { drawMap, routePuzzleFor } from "./map.ts";
import type { GameArgs } from "./types.ts";

export type { GameArgs } from "./types.ts";

export function drawGame(args: GameArgs) {
  switch (args.activity.gameType) {
    case "coloring":
      return drawColoringBoard(args);
    case "drawing":
      return drawDrawingBoard(args);
    case "word_search":
      return drawWordSearch(args);
    case "crossword":
      return drawCrossword(args);
    case "maze":
      return drawMaze(args);
    case "matching":
      return drawMatching(args);
    case "bingo":
      return drawBingo(args);
    case "spot_the_difference":
      return drawDifferencePictures(args) || drawLookAndFind(args);
    case "codebreaker":
      return drawCodebreaker(args);
    case "map_puzzle":
      return drawMap(args);
    case "scavenger_hunt":
      return drawChecklist(args);
    case "quiz":
      return drawQuiz(args);
    default:
      return drawStory(args);
  }
}

// Games that bring their own writing space, so the activity page does not
// add a field-note card under them.
export function gameHasOwnWritingSpace(activity: Pick<Activity, "gameType" | "differencePaths">) {
  return activity.gameType === "coloring" || activity.gameType === "drawing" || activity.gameType === "story"
    || hasDifferencePictures(activity);
}

export function answerFor(activity: Activity, age: number) {
  const items = activity.items ?? [];
  switch (activity.gameType) {
    case "word_search":
    case "crossword":
      return items.map((item) => normalizePuzzleWord(item.label)).filter(Boolean).join(" / ");
    case "matching":
      return items.map((_, index) => `${index + 1}-${String.fromCharCode(64 + items.length - index)}`).join(" / ");
    case "codebreaker":
      return codebreakerPhrase(items[0]?.label);
    case "maze":
      return "Exactly one path joins Start to Finish.";
    case "map_puzzle": {
      const puzzle = routePuzzleFor(activity, age);
      return `A shortest route visits stops ${puzzle.solutionStopOrder.join("-")} in ${puzzle.minimumStreets} streets; another order of the same length also counts.`;
    }
    case "quiz":
      return items.map((item, index) => `${index + 1}. ${item.label}`).join("  ");
    case "spot_the_difference":
      return activity.differencePaths
        ? activity.differencePaths.regions.map((region) => `${differencePosition(region)}: ${region.label}`).join(" / ")
        : "Any detail the child can point to in the real place counts.";
    default:
      return "Open-ended: celebrate one specific local detail.";
  }
}
