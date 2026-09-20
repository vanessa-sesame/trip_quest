import type { CSSProperties } from "react";
import type { Activity, GameItem, GameType } from "./booklet";
import { coloringSceneFor, coloringSceneLabels } from "./coloring";
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
    case "supertree":
      details = (
        <>
          <circle className="art-sun" cx="258" cy="25" r="11" />
          <path className="art-fine" d="M16 124 Q78 116 145 124 T284 122" />
          <path className="art-stroke" d="M139 124 C142 96 143 69 149 47 C155 69 156 96 160 124 Z" />
          <path className="art-accent" d="M149 49 C119 47 100 32 91 17 M149 49 C122 37 120 18 123 8 M149 49 C143 31 146 13 151 5 M149 49 C164 30 173 15 178 8 M149 49 C178 39 194 25 203 14" />
          <ellipse className="art-stroke" cx="149" cy="30" rx="61" ry="25" />
          <path className="art-fine" d="M101 27 Q149 10 197 27 M113 39 Q149 23 185 39 M120 124 C123 107 124 90 128 76 C132 91 133 107 136 124 M219 124 C221 106 222 92 226 75 C230 92 231 106 234 124" />
          <path className="art-accent" d="M128 78 C110 74 98 65 92 55 M128 78 C143 70 151 61 157 51 M226 77 C208 72 198 63 191 54 M226 77 C242 70 252 60 260 51" />
          <ellipse className="art-stroke" cx="128" cy="60" rx="37" ry="20" />
          <ellipse className="art-stroke" cx="226" cy="59" rx="37" ry="20" />
          <path className="art-fine" d="M160 68 Q191 60 219 69 M162 74 Q190 66 217 75" />
        </>
      );
      break;
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
    case "train":
      details = (
        <>
          <path className="art-fine" d="M18 126 H282 M25 135 H275 M44 126 L35 138 M82 126 L73 138 M120 126 L111 138 M158 126 L149 138 M196 126 L187 138 M234 126 L225 138 M272 126 L263 138" />
          <path className="art-stroke" d="M38 54 Q44 35 68 31 H225 Q250 34 260 56 V111 H38 Z" />
          <path className="art-accent" d="M63 47 H217 M52 84 H246 M84 31 V18 H207 V31" />
          <path className="art-stroke" d="M59 57 H105 V78 H59 Z M119 57 H165 V78 H119 Z M179 57 H225 V78 H179 Z" />
          <path className="art-fine" d="M132 98 H168 M54 98 H78 M222 98 H246" />
          <circle className="art-fill" cx="78" cy="113" r="13" /><circle className="art-fill" cx="222" cy="113" r="13" />
          <path className="art-accent" d="M132 18 H159 M144 11 H171" />
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
    case "mosque":
      details = (
        <>
          <path className="art-fine" d="M18 124 H282" />
          <path className="art-stroke" d="M72 124 V72 H228 V124 M98 72 Q150 22 202 72 Z" />
          <path className="art-accent" d="M150 33 V18 M150 18 q10 7 18 -2 q-3 13 -18 11" />
          <path className="art-stroke" d="M40 124 V50 H58 V124 M242 124 V50 H260 V124 M36 50 H62 L49 30 Z M238 50 H264 L251 30 Z" />
          <path className="art-fine" d="M49 30 V18 M251 30 V18 M91 124 V93 Q104 74 117 93 V124 M133 124 V93 Q150 70 167 93 V124 M183 124 V93 Q196 74 209 93 V124" />
          <path className="art-accent" d="M82 79 H218 M84 114 H216" />
        </>
      );
      break;
    case "tower":
      details = (
        <>
          <circle className="art-sun" cx="247" cy="28" r="12" />
          <path className="art-stroke" d="M93 124 H207 M113 124 L143 39 H157 L187 124 M132 79 H168 M120 108 H180 M143 39 L150 14 L157 39" />
          <path className="art-fine" d="M122 101 L174 59 M178 101 L126 59 M134 79 L166 108 M166 79 L134 108 M101 124 Q150 112 199 124" />
          <path className="art-accent" d="M128 57 H172 M136 45 H164 M146 14 V6" />
          <path className="art-stroke" d="M28 124 V91 M28 91 q-12 -13 -22 0 M28 101 q14 -13 24 0 M264 124 V92 M264 92 q-12 -13 -22 0 M264 102 q14 -13 24 0" />
          <path className="art-fine" d="M37 41 q8 -7 16 0 q8 -7 16 0 M215 58 q8 -7 16 0" />
        </>
      );
      break;
    case "castle":
      details = (
        <>
          <path className="art-fine" d="M16 124 H284" />
          <path className="art-stroke" d="M46 124 V54 H91 V124 M209 124 V54 H254 V124 M91 124 V76 H209 V124" />
          <path className="art-accent" d="M40 54 V39 H52 V48 H64 V39 H76 V48 H91 V54 M203 54 V39 H215 V48 H227 V39 H239 V48 H254 V54 M91 76 V63 H106 V71 H121 V63 H136 V71 H151 V63 H166 V71 H181 V63 H196 V71 H209 V76" />
          <path className="art-stroke" d="M132 124 V98 Q150 77 168 98 V124" />
          <path className="art-fine" d="M59 76 H78 V98 H59 Z M222 76 H241 V98 H222 Z M114 86 H130 M170 86 H186" />
          <path className="art-fill" d="M25 124 Q36 106 47 124 M253 124 Q266 103 278 124" />
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
    case "coast":
      details = (
        <>
          <circle className="art-sun" cx="252" cy="28" r="13" />
          <path className="art-fine" d="M10 104 Q35 94 60 104 T110 104 T160 104 T210 104 T290 104 M8 117 Q38 107 68 117 T128 117 T188 117 T248 117 T292 117" />
          <path className="art-stroke" d="M44 102 V47 H72 V102 M40 47 H76 L64 31 H52 Z M49 64 H67 M49 79 H67" />
          <path className="art-accent" d="M58 31 V19 M58 19 L76 25 L58 30" />
          <path className="art-stroke" d="M151 98 L176 70 L201 98 Z M176 70 V53 M176 53 Q190 58 198 68" />
          <path className="art-fill" d="M139 99 Q176 116 213 99 L204 113 H149 Z" />
          <path className="art-fine" d="M94 48 q8 -7 16 0 q8 -7 16 0 M213 53 q8 -7 16 0" />
          <path className="art-stroke" d="M266 104 V75 M266 75 q-12 -13 -22 0 M266 86 q14 -13 24 0" />
        </>
      );
      break;
    case "penguin":
      details = (
        <>
          <path className="art-fine" d="M14 126 Q58 116 104 126 T196 126 T286 124" />
          <path className="art-stroke" d="M103 118 Q84 91 94 55 Q103 22 128 25 Q154 29 158 61 Q166 92 145 119 Z" />
          <path className="art-fine" d="M109 109 Q99 81 106 53 Q113 36 128 36 Q143 39 148 58 Q153 83 139 110" />
          <path className="art-accent" d="M94 65 L74 86 L98 79 M158 66 L180 87 L155 80 M119 119 L105 132 M137 119 L151 132" />
          <circle className="art-fill" cx="120" cy="46" r="3" /><circle className="art-fill" cx="137" cy="46" r="3" />
          <path className="art-stroke" d="M125 54 L142 59 L126 64 Z" />
          <path className="art-stroke" d="M201 120 Q186 98 193 72 Q199 48 218 50 Q238 53 241 76 Q247 99 231 121 Z" />
          <path className="art-accent" d="M199 83 L185 98 M239 84 L252 99 M211 121 L201 132 M226 121 L236 132" />
          <path className="art-fine" d="M28 39 q8 -7 16 0 q8 -7 16 0 M241 31 q8 -7 16 0" />
        </>
      );
      break;
    case "wildlife":
      details = (
        <>
          <path className="art-fine" d="M14 124 Q76 112 140 124 T286 122" />
          <path className="art-stroke" d="M76 105 Q78 66 113 60 Q153 57 169 85 Q174 100 160 113 H96 Z" />
          <path className="art-stroke" d="M105 61 Q101 37 118 27 Q139 16 156 31 Q169 42 160 66 M106 53 Q88 43 82 61 Q93 70 108 65" />
          <path className="art-accent" d="M159 39 Q184 43 181 67 Q178 85 193 88 M97 105 V128 M124 108 V128 M151 106 V128" />
          <circle className="art-fill" cx="146" cy="37" r="3" />
          <path className="art-stroke" d="M225 124 V74 M225 74 q-17 -17 -31 0 M225 88 q20 -18 34 0" />
          <path className="art-fine" d="M37 43 q8 -7 16 0 q8 -7 16 0 M213 39 q8 -7 16 0" />
        </>
      );
      break;
    case "dinosaur":
      details = (
        <>
          <path className="art-fine" d="M12 126 Q72 116 134 126 T286 124" />
          <path className="art-stroke" d="M46 109 Q70 78 113 76 Q155 73 183 92 Q205 103 234 88 Q253 79 264 89 Q243 110 211 111 Q184 113 164 101 Q138 118 92 113 Z" />
          <path className="art-stroke" d="M80 81 Q61 58 73 38 Q85 18 109 26 Q123 32 120 48 Q115 62 98 76" />
          <path className="art-accent" d="M85 38 L74 25 L92 31 L96 17 L105 31 L117 22 L112 39 M103 113 L95 132 M151 108 L159 132" />
          <circle className="art-fill" cx="103" cy="39" r="3" />
          <path className="art-fine" d="M132 85 q7 -10 14 0 q7 -10 14 0 M171 92 q7 -10 14 0" />
          <path className="art-stroke" d="M27 124 V93 M27 93 q-12 -13 -22 0 M27 103 q14 -13 24 0 M273 124 V96 M273 96 q-12 -13 -22 0" />
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
  return <svg className={`line-art scene-${scene}`} viewBox="0 0 300 150" role="img" aria-label={`${coloringSceneLabels[scene]} line drawing`}>{common}{details}</svg>;
}

function DrawingBoard({ activity, coloring, context }: { activity: Activity; coloring: boolean; context?: string }) {
  const items = activity.items;
  const scene = coloringSceneFor(activity, context);
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

export function ActivityGame({ activity, age, context }: { activity: Activity; age: number; context?: string }) {
  const requestedGameType = activity.gameType || "story";
  const items = activity.items?.length === 4 ? activity.items : fallbackItems;
  const gameType = requestedGameType === "crossword"
    && !createCrossword(items.map((item) => item.label)).complete
    ? "word_search"
    : requestedGameType;
  let board;

  switch (gameType) {
    case "coloring": board = <DrawingBoard activity={activity} coloring context={context} />; break;
    case "drawing": board = <DrawingBoard activity={activity} coloring={false} context={context} />; break;
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
