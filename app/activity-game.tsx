import type { CSSProperties } from "react";
import type { Activity, GameItem, GameType } from "./booklet";
import {
  createCrossword,
  createMaze,
  createRoutePuzzle,
  createWordSearch,
  mazeSizeForAge,
  normalizePuzzleWord,
} from "./puzzles";

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
  map_puzzle: "Route planner",
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

function WordSearchBoard({ activity, age, items }: { activity: Activity; age: number; items: GameItem[] }) {
  const size = age <= 8 ? 10 : age <= 11 ? 11 : 12;
  const puzzle = createWordSearch(
    items.map((item) => item.label),
    activity.title,
    size,
    age >= 9,
  );
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
      <div
        className="crossword-grid"
        style={{
          "--puzzle-size": puzzle.grid[0]?.length || 1,
          aspectRatio: `${puzzle.grid[0]?.length || 1} / ${puzzle.grid.length || 1}`,
        } as CSSProperties}
      >
        {puzzle.grid.flatMap((row, rowIndex) =>
          row.map((cell, columnIndex) => (
            <span className={cell ? "open" : "closed"} key={`${rowIndex}-${columnIndex}`}>
              {cell?.number ? <small>{cell.number}</small> : null}
            </span>
          )),
        )}
      </div>
      <ul className="crossword-clues">
        {puzzle.entries.map((entry) => (
          <li key={`${entry.number}-${entry.direction}`}>
            <b>{entry.number}{entry.direction === "across" ? "A" : "D"}</b>
            <span>{items[entry.answerIndex]?.clue}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MazeBoard({ activity, age, items }: { activity: Activity; age: number; items: GameItem[] }) {
  const maze = createMaze(
    `${activity.title}|${items[0].label}|${age}`,
    mazeSizeForAge(age),
  );
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
  const clues = [...items].reverse();
  return (
    <div className="matching-board">
      {items.map((item, index) => (
        <div className="matching-row" key={`${index}-${item.label}`}>
          <span className="matching-term">
            <b>{index + 1}.</b> {item.label}
          </span>
          <span className="matching-clue">
            <b>{String.fromCharCode(65 + index)}.</b> {clues[index]?.clue ?? ""}
          </span>
        </div>
      ))}
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

function MapBoard({ activity, age, items }: { activity: Activity; age: number; items: GameItem[] }) {
  const puzzle = createRoutePuzzle(`${activity.title}|${items.map((item) => item.label).join("|")}`, age);
  const point = ({ row, column }: { row: number; column: number }) => ({
    x: 10 + column * (80 / (puzzle.size - 1)),
    y: 10 + row * (80 / (puzzle.size - 1)),
  });
  const streetKey = (street: typeof puzzle.streets[number]) =>
    `${street.from.row}-${street.from.column}-${street.to.row}-${street.to.column}`;
  return (
    <div className="map-board">
      <svg className="route-map" viewBox="0 0 100 100" role="img" aria-label="Street-grid route puzzle with four stops and closed roads">
        {puzzle.allStreets.map((street) => {
          const from = point(street.from);
          const to = point(street.to);
          return <line className="route-street-base" key={`base-${streetKey(street)}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y} />;
        })}
        {puzzle.streets.map((street) => {
          const from = point(street.from);
          const to = point(street.to);
          return <line className="route-street-open" key={`open-${streetKey(street)}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y} />;
        })}
        {puzzle.closedStreets.map((street) => {
          const from = point(street.from);
          const to = point(street.to);
          const middleX = (from.x + to.x) / 2;
          const middleY = (from.y + to.y) / 2;
          const horizontal = from.y === to.y;
          return (
            <g className="route-closure" key={`closed-${streetKey(street)}`}>
              <line x1={middleX + (horizontal ? -1.5 : -3)} y1={middleY + (horizontal ? -3 : -1.5)} x2={middleX + (horizontal ? -1.5 : 3)} y2={middleY + (horizontal ? 3 : -1.5)} />
              <line x1={middleX + (horizontal ? 1.5 : -3)} y1={middleY + (horizontal ? -3 : 1.5)} x2={middleX + (horizontal ? 1.5 : 3)} y2={middleY + (horizontal ? 3 : 1.5)} />
            </g>
          );
        })}
        {Array.from({ length: puzzle.size * puzzle.size }, (_, index) => {
          const location = point({ row: Math.floor(index / puzzle.size), column: index % puzzle.size });
          return <circle className="route-junction" key={`junction-${index}`} cx={location.x} cy={location.y} r="1.2" />;
        })}
        {[{ ...puzzle.start, label: "S", className: "start" }, { ...puzzle.finish, label: "F", className: "finish" }].map((terminal) => {
          const location = point(terminal);
          return (
            <g className={`route-terminal ${terminal.className}`} key={terminal.label}>
              <rect x={location.x - 4} y={location.y - 4} width="8" height="8" rx="1" />
              <text x={location.x} y={location.y + 2.2}>{terminal.label}</text>
            </g>
          );
        })}
        {puzzle.stops.map((stop) => {
          const location = point(stop);
          return (
            <g className="route-stop" key={stop.itemIndex}>
              <circle cx={location.x} cy={location.y} r="4.5" />
              <text x={location.x} y={location.y + 2.2}>{stop.itemIndex + 1}</text>
            </g>
          );
        })}
      </svg>
      <div className="route-map-legend">
        {items.map((item, index) => (
          <div key={item.label}>
            <span>{index + 1}</span>
            <p><strong>{item.label}</strong><small>{item.clue}</small></p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChecklistBoard({ items }: { items: GameItem[] }) {
  return (
    <div className="checklist-board">
      {items.map((item, index) => (
        <div className="checklist-row" key={`${index}-${item.label}`}>
          <i aria-hidden="true" />
          <strong>{item.label}</strong>
          <span>{item.clue}</span>
        </div>
      ))}
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

export function ActivityGame({ activity, age }: { activity: Activity; age: number }) {
  const requestedGameType = activity.gameType || "story";
  const items = activity.items?.length === 4 ? activity.items : fallbackItems;
  const gameType = requestedGameType === "crossword"
    && !createCrossword(items.map((item) => item.label)).complete
    ? "word_search"
    : requestedGameType;
  let board;

  switch (gameType) {
    case "coloring": board = <DrawingBoard items={items} coloring />; break;
    case "drawing": board = <DrawingBoard items={items} coloring={false} />; break;
    case "word_search": board = <WordSearchBoard activity={activity} age={age} items={items} />; break;
    case "crossword": board = <CrosswordBoard items={items} />; break;
    case "maze": board = <MazeBoard activity={activity} age={age} items={items} />; break;
    case "matching": board = <MatchingBoard items={items} />; break;
    case "bingo": board = <BingoBoard items={items} />; break;
    case "spot_the_difference": board = <DifferenceBoard items={items} />; break;
    case "codebreaker": board = <CodebreakerBoard items={items} />; break;
    case "map_puzzle": board = <MapBoard activity={activity} age={age} items={items} />; break;
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
