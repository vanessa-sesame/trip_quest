import type { CSSProperties } from "react";
import type { Activity, GameItem, GameType } from "./booklet";
import { createCrossword, createMaze, createWordSearch, normalizePuzzleWord } from "./puzzles";

const gameNames: Record<GameType, string> = {
  coloring: "Coloring page",
  drawing: "Drawing studio",
  crossword: "Mini crossword",
  word_search: "Word search",
  maze: "Route maze",
  matching: "Match-up",
  bingo: "Explorer bingo",
  spot_the_difference: "Spot the difference",
  codebreaker: "Codebreaker",
  map_puzzle: "Map puzzle",
  scavenger_hunt: "Scavenger hunt",
  quiz: "Quick quiz",
  story: "Story studio",
};

const fallbackItems: GameItem[] = [
  { label: "Look", clue: "Find one tiny detail." },
  { label: "Listen", clue: "Catch one local sound." },
  { label: "Draw", clue: "Sketch the best shape." },
  { label: "Share", clue: "Tell your family what surprised you." },
];

function DrawingBoard({ items, coloring }: { items: GameItem[]; coloring: boolean }) {
  return (
    <div className={coloring ? "draw-board coloring-board" : "draw-board"}>
      <div className="line-art" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <strong>{items[0].label}</strong>
      <small>{coloring ? "Add local colors and patterns" : items[0].clue}</small>
    </div>
  );
}

function WordSearchBoard({ activity, items }: { activity: Activity; items: GameItem[] }) {
  const puzzle = createWordSearch(items.map((item) => item.label), activity.title);
  return (
    <div className="word-search-layout">
      <div className="word-grid" style={{ "--puzzle-size": puzzle.grid.length } as CSSProperties}>
        {puzzle.grid.flatMap((row, rowIndex) =>
          row.map((letter, columnIndex) => <span key={`${rowIndex}-${columnIndex}`}>{letter}</span>),
        )}
      </div>
      <div className="word-bank">
        {puzzle.words.map((word) => <span key={word}>{word}</span>)}
      </div>
    </div>
  );
}

function CrosswordBoard({ items }: { items: GameItem[] }) {
  const puzzle = createCrossword(items.map((item) => item.label));
  return (
    <div className="crossword-layout">
      <div className="crossword-grid" style={{ "--puzzle-size": puzzle.grid[0]?.length || 1 } as CSSProperties}>
        {puzzle.grid.flatMap((row, rowIndex) =>
          row.map((cell, columnIndex) => (
            <span className={cell ? "open" : "closed"} key={`${rowIndex}-${columnIndex}`}>
              {cell?.number ? <small>{cell.number}</small> : null}
            </span>
          )),
        )}
      </div>
      <ol className="crossword-clues">
        {items.map((item, index) => <li key={`${item.label}-${index}`}>{item.clue}</li>)}
      </ol>
    </div>
  );
}

function MazeBoard({ activity, items }: { activity: Activity; items: GameItem[] }) {
  const maze = createMaze(`${activity.title}|${items[0].label}`);
  return (
    <div className="maze-layout">
      <div className="maze-grid" style={{ "--puzzle-size": maze.length } as CSSProperties}>
        {maze.flatMap((row, rowIndex) => row.map((cell, columnIndex) => (
          <span
            key={`${rowIndex}-${columnIndex}`}
            className={rowIndex === 0 && columnIndex === 0 ? "maze-start" : rowIndex === maze.length - 1 && columnIndex === maze.length - 1 ? "maze-finish" : ""}
            style={{
              borderTopColor: cell.walls[0] ? "currentColor" : "transparent",
              borderRightColor: cell.walls[1] ? "currentColor" : "transparent",
              borderBottomColor: cell.walls[2] ? "currentColor" : "transparent",
              borderLeftColor: cell.walls[3] ? "currentColor" : "transparent",
            }}
          />
        )))}
      </div>
      <small>{items[0].label} to {items[items.length - 1].label}</small>
    </div>
  );
}

function MatchingBoard({ items }: { items: GameItem[] }) {
  return (
    <div className="matching-board">
      <div>{items.map((item, index) => <span key={item.label}>{index + 1}. {item.label}</span>)}</div>
      <div>{[...items].reverse().map((item, index) => <span key={item.clue}>{String.fromCharCode(65 + index)}. {item.clue}</span>)}</div>
    </div>
  );
}

function BingoBoard({ items }: { items: GameItem[] }) {
  return <div className="bingo-board">{items.map((item) => <span key={item.label}>{item.label}</span>)}</div>;
}

function DifferenceBoard({ items }: { items: GameItem[] }) {
  return (
    <div className="difference-layout">
      {[0, 1].map((version) => (
        <div className={`difference-scene version-${version}`} key={version} aria-label={`Picture ${version + 1}`}>
          <span /><span /><span /><i />
        </div>
      ))}
      <small>Circle 3 changes inspired by {items[0].label}</small>
    </div>
  );
}

function CodebreakerBoard({ items }: { items: GameItem[] }) {
  const phrase = normalizePuzzleWord(items[0].label, 12) || "TRIP";
  const symbols = ["@", "#", "$", "%", "&", "+", "=", "?"];
  const uniqueLetters = Array.from(new Set(phrase));
  const code = phrase.split("").map((letter) => symbols[uniqueLetters.indexOf(letter) % symbols.length]);
  return (
    <div className="code-board">
      <div>{code.map((symbol, index) => <span key={`${symbol}-${index}`}>{symbol}</span>)}</div>
      <small>{uniqueLetters.slice(0, 4).map((letter, index) => `${symbols[index]}=${letter}`).join("  ")}</small>
      <i>{items[0].clue}</i>
    </div>
  );
}

function MapBoard({ items }: { items: GameItem[] }) {
  return (
    <div className="map-board">
      {items.map((item, index) => (
        <div key={item.label}>
          <span>{index + 1}</span>
          <strong>{item.label}</strong>
        </div>
      ))}
    </div>
  );
}

function ChecklistBoard({ items }: { items: GameItem[] }) {
  return (
    <div className="checklist-board">
      {items.map((item) => <span key={item.label}><i aria-hidden="true" /> <strong>{item.label}</strong> {item.clue}</span>)}
    </div>
  );
}

function QuizBoard({ items }: { items: GameItem[] }) {
  return (
    <div className="quiz-board">
      <strong>{items[0].clue}</strong>
      <div>{items.map((item, index) => <span key={item.label}>{String.fromCharCode(65 + index)}. {item.label}</span>)}</div>
    </div>
  );
}

function StoryBoard({ items }: { items: GameItem[] }) {
  return (
    <div className="story-board">
      <strong>{items[0].label}: {items[0].clue}</strong>
      <span /><span /><span />
    </div>
  );
}

export function ActivityGame({ activity }: { activity: Activity }) {
  const gameType = activity.gameType || "story";
  const items = activity.items?.length === 4 ? activity.items : fallbackItems;
  let board;

  switch (gameType) {
    case "coloring": board = <DrawingBoard items={items} coloring />; break;
    case "drawing": board = <DrawingBoard items={items} coloring={false} />; break;
    case "word_search": board = <WordSearchBoard activity={activity} items={items} />; break;
    case "crossword": board = <CrosswordBoard items={items} />; break;
    case "maze": board = <MazeBoard activity={activity} items={items} />; break;
    case "matching": board = <MatchingBoard items={items} />; break;
    case "bingo": board = <BingoBoard items={items} />; break;
    case "spot_the_difference": board = <DifferenceBoard items={items} />; break;
    case "codebreaker": board = <CodebreakerBoard items={items} />; break;
    case "map_puzzle": board = <MapBoard items={items} />; break;
    case "scavenger_hunt": board = <ChecklistBoard items={items} />; break;
    case "quiz": board = <QuizBoard items={items} />; break;
    default: board = <StoryBoard items={items} />;
  }

  return (
    <section className={`activity-game game-${gameType}`} aria-label={gameNames[gameType]}>
      <b>{gameNames[gameType]}</b>
      {board}
    </section>
  );
}
