import type { CSSProperties } from "react";
import type { Activity, GameItem, GameType } from "./booklet";
import { coloringSceneFor } from "./coloring";
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

function DestinationLineArt({ scene }: { scene: ReturnType<typeof coloringSceneFor> }) {
  const common = <path className="art-fine" d="M8 124 Q76 116 148 125 T292 123" />;
  let details;
  switch (scene) {
    case "skyline":
      details = (
        <>
          <circle className="art-sun" cx="257" cy="30" r="14" />
          <path className="art-stroke" d="M20 55 H57 V124 H20 Z M76 34 H116 V124 H76 Z M136 47 H177 V124 H136 Z" />
          <path className="art-accent" d="M84 34 L96 20 L108 34 M144 47 L156 33 L168 47" />
          <path className="art-fine" d="M28 70 H49 M28 86 H49 M84 53 H108 M84 70 H108 M84 87 H108 M144 65 H169 M144 82 H169" />
          <path className="art-stroke" d="M205 124 V88 M205 88 Q220 68 235 88 M220 76 V124 M236 124 V96" />
          <path className="art-accent" d="M184 50 q8 -7 16 0 q8 -7 16 0 M224 61 q8 -7 16 0" />
        </>
      );
      break;
    case "garden":
      details = (
        <>
          <path className="art-stroke" d="M22 124 Q92 66 155 124 M38 124 Q78 91 115 124" />
          <path className="art-stroke" d="M68 124 V66 M68 66 Q52 50 42 68 M68 78 Q88 55 99 73 M68 91 Q50 78 42 91" />
          <path className="art-fine" d="M22 102 q9 -12 18 0 M42 94 q9 -12 18 0 M168 124 V77 M168 77 q-14 -14 -24 0 M168 88 q16 -15 26 0" />
          {[190, 228, 266].map((flowerX, index) => <g key={flowerX}><path className="art-stroke" d={`M${flowerX} 124 V${82 + (index % 2) * 9}`} /><circle className="art-accent" cx={flowerX} cy={78 + (index % 2) * 9} r="6" /><circle className="art-fill" cx={flowerX + 8} cy={78 + (index % 2) * 9} r="4" /></g>)}
          <path className="art-accent" d="M244 34 q8 -8 16 0 q8 -8 16 0" />
        </>
      );
      break;
    case "bridge":
      details = (
        <>
          <path className="art-stroke" d="M18 70 H282 M28 82 H272 M42 82 Q60 44 78 82 M98 82 Q116 44 134 82 M154 82 Q172 44 190 82 M210 82 Q228 44 246 82" />
          <path className="art-fine" d="M12 100 Q46 91 80 100 T148 100 T216 100 T284 100 M12 112 Q46 103 80 112 T148 112 T216 112 T284 112" />
          <path className="art-stroke" d="M47 70 V47 M232 70 V47 M47 47 H232" />
          <path className="art-accent" d="M62 41 q7 -7 14 0 M216 41 q7 -7 14 0" />
          <path className="art-fill" d="M122 106 q18 -13 36 0 l-8 8 h-20 z" />
        </>
      );
      break;
    case "market":
      details = (
        <>
          <path className="art-stroke" d="M38 50 H262 L278 76 H22 Z M38 50 V124 H262 V50" />
          <path className="art-accent" d="M32 72 H268 M54 72 V124 M102 72 V124 M150 72 V124 M198 72 V124 M246 72 V124" />
          <path className="art-fine" d="M48 91 H88 M112 91 H142 M164 91 H188 M210 91 H250" />
          <circle className="art-fill" cx="78" cy="104" r="13" /><circle className="art-fill" cx="218" cy="103" r="16" />
          <path className="art-stroke" d="M72 124 V108 M78 108 V124 M212 124 V106 M218 106 V124" />
          <path className="art-accent" d="M64 37 q7 -10 14 0 q7 -10 14 0 M208 37 q7 -10 14 0 q7 -10 14 0" />
        </>
      );
      break;
    case "mountain":
      details = (
        <>
          <circle className="art-sun" cx="252" cy="30" r="13" />
          <path className="art-stroke" d="M14 124 L78 48 L133 124 L180 67 L276 124" />
          <path className="art-fine" d="M78 48 L91 67 L104 62 L133 124 M180 67 L196 86 L211 80 L236 124" />
          <path className="art-stroke" d="M35 124 V88 M35 88 q-12 -13 -22 0 M35 98 q14 -13 24 0 M242 124 V89 M242 89 q-12 -13 -22 0 M242 99 q14 -13 24 0" />
          <path className="art-accent" d="M148 124 Q153 106 164 95 Q174 84 183 72" />
          <path className="art-fine" d="M194 39 q8 -7 16 0 q8 -7 16 0" />
        </>
      );
      break;
    case "temple":
      details = (
        <>
          <path className="art-stroke" d="M50 124 V73 H250 V124 M34 73 H266 L240 52 H60 Z M61 52 L150 22 L239 52" />
          <path className="art-accent" d="M83 73 V124 M112 73 V124 M150 73 V124 M188 73 V124 M217 73 V124" />
          <path className="art-fine" d="M30 124 H270 M70 42 H230 M150 22 V14" />
          <path className="art-fill" d="M20 61 q8 -10 16 0 v14 H20 Z M264 61 q8 -10 16 0 v14 H264 Z" />
          <circle className="art-sun" cx="255" cy="27" r="12" />
        </>
      );
      break;
    case "cave":
      details = (
        <>
          <path className="art-stroke" d="M20 124 Q24 32 150 23 Q276 32 280 124" />
          <path className="art-fine" d="M44 124 Q55 61 150 59 Q245 61 256 124" />
          <path className="art-accent" d="M64 42 L76 72 L87 49 L98 80 M201 46 L213 77 L224 42 L238 74" />
          <path className="art-stroke" d="M32 124 V91 M32 91 q-12 -13 -22 0 M32 101 q14 -13 24 0 M268 124 V93 M268 93 q-12 -13 -22 0 M268 103 q14 -13 24 0" />
          <path className="art-fill" d="M133 124 Q139 98 150 98 Q161 98 167 124" />
          <path className="art-fine" d="M40 112 q14 -7 28 0 M224 112 q14 -7 28 0" />
        </>
      );
      break;
    case "shophouse":
      details = (
        <>
          <path className="art-stroke" d="M24 124 V45 H92 V124 M100 124 V32 H170 V124 M178 124 V50 H276 V124" />
          <path className="art-accent" d="M24 73 H92 M100 64 H170 M178 77 H276" />
          <path className="art-fine" d="M36 58 H80 M112 48 H158 M192 64 H262 M36 90 H80 M112 80 H158 M192 95 H262" />
          <path className="art-stroke" d="M49 124 V94 H68 V124 M126 124 V83 H145 V124 M218 124 V99 H238 V124" />
          <path className="art-accent" d="M32 20 q7 -10 14 0 q7 -10 14 0 M120 17 q7 -10 14 0 q7 -10 14 0 M218 24 q7 -10 14 0 q7 -10 14 0" />
        </>
      );
      break;
  }
  return <svg className={`line-art scene-${scene}`} viewBox="0 0 300 150" role="img" aria-label={`${scene} line drawing`}>{common}{details}</svg>;
}

function DrawingBoard({ activity, coloring }: { activity: Activity; coloring: boolean }) {
  const items = activity.items;
  const scene = coloringSceneFor(activity);
  return (
    <div className={coloring ? "draw-board coloring-board" : "draw-board"}>
      <DestinationLineArt scene={scene} />
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
    case "coloring": board = <DrawingBoard activity={activity} coloring />; break;
    case "drawing": board = <DrawingBoard activity={activity} coloring={false} />; break;
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
