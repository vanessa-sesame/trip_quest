import type { CSSProperties } from "react";
import Image from "next/image";
import type { Activity, GameItem, GameType } from "../lib/booklet/booklet";
import {
  coloringIllustrationSpecs,
  curatedColoringImagePath,
  coloringPageSpec,
  coloringSceneFor,
  coloringSceneLabels,
  coloringVariantFor,
} from "../lib/booklet/coloring";
import {
  createCrossword,
  createMaze,
  createRoutePuzzle,
  createWordSearch,
  mazeSizeForAge,
  normalizePuzzleWord,
} from "../lib/booklet/puzzles";

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

const coloringPageCss = `
.coloring-page-board{display:grid;min-height:0;height:100%;grid-template-rows:auto minmax(0,1fr) auto auto;gap:6px;color:var(--ink)}
.coloring-page-topline{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}
.coloring-page-kicker{color:var(--coral);font-size:.35rem;font-weight:900;letter-spacing:.04em}
.coloring-how-to{display:grid;max-width:52%;gap:2px;border:1px solid var(--line);border-radius:4px;padding:4px 6px}
.coloring-how-to b,.coloring-mini-heading span,.coloring-cell-badge,.coloring-trace-strip span,.coloring-note-grid b{font-size:.34rem;font-weight:900;letter-spacing:.03em;text-transform:uppercase}
.coloring-how-to span{font-size:.38rem;line-height:1.2}
.coloring-page-main{display:grid;min-height:0;grid-template-columns:minmax(0,1.05fr) minmax(0,.95fr);gap:8px}
.coloring-scene-panel{display:grid;min-width:0;min-height:0;grid-template-rows:auto minmax(0,1fr);gap:3px;border:1px solid var(--line);border-radius:6px;background:var(--paper);padding:6px}
.coloring-scene-panel>b,.coloring-mini-heading>b{font-size:.45rem;line-height:1.15}
.coloring-hero-art{position:static;width:100%;height:100%;min-height:0;border:0;border-radius:3px;background:var(--paper)}
.coloring-raster-art{position:relative;width:100%;height:100%;min-height:0;overflow:hidden;border-radius:3px;background:var(--paper)}
.coloring-raster-art img{object-fit:contain;padding:2px}
.coloring-mini-panel{display:grid;min-width:0;min-height:0;grid-template-rows:auto minmax(0,1fr);gap:4px}
.coloring-mini-heading{display:flex;align-items:baseline;justify-content:space-between;gap:4px}
.coloring-mini-heading span{color:var(--teal-dark);white-space:nowrap}
.coloring-mini-grid{display:grid;min-height:0;grid-template-columns:repeat(3,minmax(0,1fr));grid-template-rows:repeat(3,minmax(0,1fr));gap:4px}
.coloring-mini-cell{display:grid;min-width:0;min-height:0;grid-template-rows:auto auto minmax(0,1fr);gap:2px;overflow:hidden;border:1px solid var(--line);border-radius:5px;background:var(--white);padding:4px}
.coloring-mini-cell.cell-challenge{background:var(--pale-yellow)}
.coloring-mini-cell.cell-free{place-items:center;background:var(--coral);border-color:var(--coral);color:var(--white);text-align:center}
.coloring-cell-badge{color:var(--teal-dark);font-size:.28rem}
.cell-challenge .coloring-cell-badge{color:var(--coral)}
.cell-free .coloring-cell-badge{color:var(--white)}
.coloring-mini-cell strong{overflow-wrap:anywhere;font-size:.38rem;line-height:1.1}
.coloring-mini-cell small{display:-webkit-box;overflow:hidden;color:var(--muted);font-size:.31rem;line-height:1.15;-webkit-box-orient:vertical;-webkit-line-clamp:2}
.cell-free strong,.cell-free small{color:var(--white)}
.coloring-trace-strip{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:7px;border-radius:5px;background:var(--pale-blue);padding:6px 8px}
.coloring-trace-strip span,.coloring-note-grid b{color:var(--teal-dark)}
.coloring-trace-strip strong{overflow-wrap:anywhere;border-bottom:1px dotted var(--line);color:var(--line);font-size:.8rem;letter-spacing:.03em}
.coloring-trace-strip small{max-width:30%;color:var(--muted);font-size:.32rem;text-align:right}
.coloring-note-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.coloring-local-note,.coloring-field-note{min-width:0;min-height:30px;border-radius:5px;padding:6px 8px}
.coloring-local-note{background:var(--pale-yellow)}
.coloring-field-note{display:grid;gap:3px;background:var(--pale-coral)}
.coloring-note-grid p,.coloring-note-grid small,.coloring-note-grid li{color:var(--ink);font-size:.36rem;line-height:1.2}
.coloring-local-note ul{display:grid;gap:2px;margin:3px 0 0;padding-left:12px}
.coloring-local-note li{margin:0}
.coloring-field-note i{display:block;border-bottom:1px dashed var(--line)}
.generated-game-page .coloring-page-board{flex:1;gap:3%;padding-top:4%}
.generated-game-page .coloring-page-main{gap:4%}
.generated-game-page .coloring-page-kicker,.generated-game-page .coloring-how-to b,.generated-game-page .coloring-mini-heading span,.generated-game-page .coloring-cell-badge,.generated-game-page .coloring-trace-strip span,.generated-game-page .coloring-note-grid b{font-size:.4rem}
.generated-game-page .coloring-how-to span{font-size:.43rem}
.generated-game-page .coloring-scene-panel>b,.generated-game-page .coloring-mini-heading>b{font-size:.56rem}
.generated-game-page .coloring-mini-cell strong{font-size:.48rem}
.generated-game-page .coloring-mini-cell small{font-size:.37rem}
.generated-game-page .coloring-trace-strip strong{font-size:1.15rem}
.generated-game-page .coloring-trace-strip small{font-size:.39rem}
.generated-game-page .coloring-note-grid p,.generated-game-page .coloring-note-grid small,.generated-game-page .coloring-note-grid li{font-size:.43rem}
`;

function VariantLineDetails({
  scene,
  variant,
}: {
  scene: ReturnType<typeof coloringSceneFor>;
  variant: ReturnType<typeof coloringVariantFor>;
}) {
  if (variant === 0) return null;
  switch (scene) {
    case "merlion":
      return variant === 1 ? (
        <>
          <path className="art-fine" d="M93 123 Q118 110 143 123 M158 123 Q190 107 223 123" />
          <path className="art-accent" d="M98 71 Q113 58 128 71 M105 78 Q120 65 135 78 M165 95 Q194 82 223 95" />
          <path className="art-fine" d="M184 38 Q192 50 200 38 M202 38 Q210 50 218 38" />
        </>
      ) : (
        <>
          <path className="art-fine" d="M30 126 Q75 112 120 126 T210 126 T286 124" />
          <path className="art-accent" d="M58 110 Q70 95 82 110 M228 110 Q240 95 252 110" />
          <circle className="art-fill" cx="48" cy="35" r="5" /><circle className="art-fill" cx="265" cy="45" r="4" />
        </>
      );
    case "guardian":
      return variant === 1 ? (
        <>
          <path className="art-accent" d="M103 39 H197 M110 32 H190" />
          <path className="art-fine" d="M94 89 Q76 106 88 122 M206 89 Q224 106 212 122" />
          <path className="art-stroke" d="M65 124 H235 M77 116 H223" />
        </>
      ) : (
        <>
          <path className="art-fine" d="M26 124 H274 M44 116 H256" />
          <path className="art-accent" d="M38 110 Q50 95 62 110 M238 110 Q250 95 262 110" />
          <circle className="art-fill" cx="45" cy="39" r="5" /><circle className="art-fill" cx="255" cy="39" r="5" />
        </>
      );
    case "tile":
      return variant === 1 ? (
        <>
          <path className="art-accent" d="M31 33 H269 M31 117 H269" />
          <path className="art-fine" d="M44 42 L59 27 L74 42 L59 57 Z M226 42 L241 27 L256 42 L241 57 Z" />
          <path className="art-stroke" d="M124 124 L150 98 L176 124 M124 34 L150 60 L176 34" />
        </>
      ) : (
        <>
          <path className="art-accent" d="M31 28 H269 M31 122 H269" />
          <path className="art-fine" d="M35 75 H265 M55 36 V114 M245 36 V114" />
          <circle className="art-fill" cx="38" cy="75" r="4" /><circle className="art-fill" cx="262" cy="75" r="4" />
        </>
      );
    case "supertree":
      return variant === 1 ? (
        <>
          <path className="art-fine" d="M39 124 Q64 108 90 124 M208 124 Q235 108 266 124" />
          <path className="art-stroke" d="M42 121 Q54 102 69 121 M221 121 Q234 99 250 121" />
          <ellipse className="art-accent" cx="150" cy="113" rx="42" ry="11" />
        </>
      ) : (
        <>
          <path className="art-fine" d="M24 124 Q61 111 99 124 T174 124 T276 124" />
          <path className="art-stroke" d="M32 118 Q50 101 68 118 M233 118 Q250 99 269 118" />
          <path className="art-accent" d="M102 96 Q149 78 198 96" />
        </>
      );
    case "garden":
      return variant === 1 ? (
        <>
          <path className="art-stroke" d="M112 124 V74 H190 V124 M102 74 H200 L190 60 H112 Z" />
          <path className="art-fine" d="M128 74 V124 M150 74 V124 M172 74 V124 M121 88 H181 M121 103 H181" />
          <path className="art-accent" d="M127 59 Q150 40 176 59" />
        </>
      ) : (
        <>
          <path className="art-stroke" d="M92 124 Q150 95 211 124" />
          <path className="art-fine" d="M103 111 Q113 101 123 111 M133 105 Q143 95 153 105 M166 108 Q176 98 186 108" />
          <circle className="art-accent" cx="119" cy="92" r="5" />
          <circle className="art-accent" cx="186" cy="88" r="5" />
        </>
      );
    case "skyline":
      return variant === 1 ? (
        <>
          <circle className="art-stroke" cx="231" cy="82" r="29" />
          <path className="art-fine" d="M231 53 V111 M202 82 H260 M211 62 L251 102 M251 62 L211 102" />
          <path className="art-accent" d="M215 116 H247 M231 111 V124" />
        </>
      ) : (
        <>
          <path className="art-stroke" d="M208 124 V54 H263 V124 M202 54 H269 L255 39 H216 Z" />
          <circle className="art-accent" cx="235" cy="77" r="15" />
          <path className="art-fine" d="M235 77 L235 66 M235 77 L244 82" />
        </>
      );
    case "market":
      return variant === 1 ? (
        <>
          <path className="art-accent" d="M40 53 L75 35 L110 53 L145 35 L180 53 L215 35 L250 53" />
          <path className="art-fine" d="M63 75 V114 M99 75 V114 M135 75 V114 M171 75 V114 M207 75 V114" />
          <circle className="art-fill" cx="80" cy="101" r="8" /><circle className="art-fill" cx="100" cy="101" r="8" />
          <circle className="art-fill" cx="210" cy="101" r="8" /><circle className="art-fill" cx="230" cy="101" r="8" />
        </>
      ) : (
        <>
          <path className="art-stroke" d="M52 124 Q57 88 82 88 Q107 88 112 124 M188 124 Q193 88 218 88 Q243 88 248 124" />
          <path className="art-fine" d="M58 99 Q82 78 106 99 M194 99 Q218 78 242 99" />
          <path className="art-accent" d="M69 79 Q82 66 95 79 M205 79 Q218 66 231 79" />
        </>
      );
    case "dinosaur":
      return variant === 1 ? (
        <>
          <path className="art-stroke" d="M222 124 Q230 96 240 124 M250 124 Q258 98 268 124" />
          <path className="art-fine" d="M228 105 Q242 93 256 105 M235 96 Q249 84 263 96" />
          <path className="art-accent" d="M35 124 Q47 108 59 124 M54 124 Q66 105 78 124" />
        </>
      ) : (
        <>
          <path className="art-accent" d="M30 124 C58 111 86 111 114 124 M200 124 C228 111 256 111 284 124" />
          <circle className="art-fine" cx="56" cy="106" r="4" /><circle className="art-fine" cx="76" cy="101" r="4" />
          <circle className="art-fine" cx="238" cy="105" r="4" /><circle className="art-fine" cx="258" cy="100" r="4" />
        </>
      );
    case "shophouse":
      return variant === 1 ? (
        <>
          <path className="art-accent" d="M37 55 H79 M113 47 H157 M191 59 H263" />
          <path className="art-stroke" d="M42 55 V41 H76 V55 M118 47 V32 H153 V47 M196 59 V44 H258 V59" />
          <path className="art-fine" d="M48 41 Q59 30 70 41 M124 32 Q136 20 148 32 M204 44 Q227 25 250 44" />
        </>
      ) : (
        <>
          <path className="art-stroke" d="M19 118 H281 M51 118 V101 H89 V118 M110 118 V96 H148 V118 M170 118 V101 H208 V118" />
          <path className="art-accent" d="M37 96 H103 M116 91 H164 M176 96 H244" />
          <path className="art-fine" d="M64 76 V95 M127 65 V90 M207 78 V96" />
        </>
      );
    case "coast":
      return variant === 1 ? (
        <>
          <path className="art-stroke" d="M164 106 L198 83 L232 106 Z M198 83 V120" />
          <path className="art-accent" d="M198 84 L218 92 L198 99" />
          <path className="art-fine" d="M148 115 Q198 101 248 115" />
        </>
      ) : (
        <>
          <path className="art-fine" d="M154 118 Q164 106 174 118 M178 118 Q188 102 198 118 M202 118 Q212 106 222 118" />
          <circle className="art-accent" cx="170" cy="126" r="5" /><circle className="art-accent" cx="208" cy="128" r="4" />
        </>
      );
    case "temple":
    case "mosque":
      return variant === 1 ? (
        <>
          <path className="art-accent" d="M40 116 Q48 105 56 116 M244 116 Q252 105 260 116" />
          <path className="art-fine" d="M85 46 H215 M96 39 H204" />
          <circle className="art-fill" cx="150" cy="29" r="6" />
        </>
      ) : (
        <>
          <path className="art-stroke" d="M28 124 V91 H46 V124 M254 124 V91 H272 V124" />
          <path className="art-accent" d="M24 91 H50 M250 91 H276" />
          <path className="art-fine" d="M37 91 V78 M263 91 V78" />
        </>
      );
    default:
      return variant === 1 ? (
        <path className="art-fine" d="M25 113 Q73 91 121 113 T217 113 T289 113" />
      ) : (
        <>
          <path className="art-accent" d="M36 119 Q45 103 54 119 M246 119 Q255 103 264 119" />
          <circle className="art-fill" cx="151" cy="28" r="7" />
        </>
      );
  }
}

function DestinationLineArt({
  scene,
  variant,
  className = "line-art",
}: {
  scene: ReturnType<typeof coloringSceneFor>;
  variant: ReturnType<typeof coloringVariantFor>;
  className?: string;
}) {
  const common = <path className="art-fine" d="M8 124 Q76 116 148 125 T292 123" />;
  let details;
  switch (scene) {
    case "tile":
      details = (
        <>
          <rect className="art-stroke" x="28" y="18" width="244" height="114" rx="2" />
          {Array.from({ length: 12 }, (_, index) => {
            const column = index % 4;
            const row = Math.floor(index / 4);
            const x = 58 + column * 62;
            const y = 47 + row * 30;
            return (
              <g key={`${row}-${column}`} transform={`translate(${x} ${y})`}>
                <path className="art-stroke" d="M0 -13 L13 0 L0 13 L-13 0 Z" />
                <path className="art-accent" d="M0 -13 Q6 -7 0 0 Q-6 -7 0 -13 M13 0 Q7 6 0 0 Q7 -6 13 0 M0 13 Q-6 7 0 0 Q6 7 0 13 M-13 0 Q-7 -6 0 0 Q-7 6 -13 0" />
                <circle className="art-fill" cx="0" cy="0" r="3" />
              </g>
            );
          })}
          <path className="art-fine" d="M28 32 H272 M28 102 H272" />
        </>
      );
      break;
    case "merlion":
      details = (
        <>
          <path className="art-stroke" d="M78 130 H190 M88 122 H180 M99 116 Q104 99 101 84 Q98 69 108 58 Q118 48 132 48 Q150 48 160 60 Q169 72 164 91 Q160 105 169 116" />
          <path className="art-stroke" d="M101 85 Q77 93 65 111 Q58 124 69 132 Q83 139 96 126 Q83 126 78 119 Q84 105 105 101" />
          <path className="art-stroke" d="M98 56 L86 49 L94 39 L83 31 L99 30 L103 17 L115 26 L126 13 L134 27 L148 17 L151 32 L166 31 L160 43 L171 51 L160 59" />
          <path className="art-stroke" d="M103 55 Q101 39 113 30 Q126 21 142 29 Q156 36 157 53 Q158 70 145 79 Q132 86 116 78 Q105 72 103 55 Z" />
          <path className="art-fine" d="M111 43 Q117 38 123 43 M139 43 Q145 38 151 43 M129 47 L126 55 L133 55 M119 64 Q132 72 145 64" />
          <circle className="art-fill" cx="118" cy="46" r="2.4" /><circle className="art-fill" cx="145" cy="46" r="2.4" />
          <path className="art-accent" d="M151 57 Q166 53 178 59 M157 63 Q169 67 178 59 M178 59 Q205 57 230 69 Q249 78 267 73 M178 63 Q204 66 226 79 Q244 89 263 86 M178 67 Q201 75 219 89 Q235 101 253 99" />
          <path className="art-fine" d="M111 92 l8 -7 l8 7 l-8 7 Z M132 92 l8 -7 l8 7 l-8 7 Z M121 108 l8 -7 l8 7 l-8 7 Z M145 108 l8 -7 l8 7 l-8 7 Z" />
          <path className="art-accent" d="M94 83 Q80 81 72 69 Q87 68 102 74 M162 86 Q177 83 185 72 Q171 71 160 77" />
          <path className="art-fine" d="M198 112 q10 -8 20 0 q10 -8 20 0 q10 -8 20 0 M205 121 q10 -8 20 0 q10 -8 20 0" />
          <circle className="art-sun" cx="267" cy="25" r="10" />
        </>
      );
      break;
    case "guardian":
      details = (
        <>
          <path className="art-stroke" d="M92 131 H208 M104 123 H196 M118 121 L112 101 L121 79 Q130 70 150 70 Q170 70 179 79 L188 101 L182 121 Z" />
          <path className="art-stroke" d="M126 121 V99 L139 82 M174 121 V99 L161 82 M119 99 H181 M124 108 H176" />
          <path className="art-accent" d="M124 82 L112 75 L119 65 L131 72 M176 82 L188 75 L181 65 L169 72 M132 80 Q150 93 168 80" />
          <path className="art-stroke" d="M123 63 Q113 51 119 37 Q125 24 138 21 L150 12 L162 21 Q175 24 181 37 Q187 51 177 63 Q166 74 150 74 Q134 74 123 63 Z" />
          <path className="art-stroke" d="M119 37 L108 27 L124 27 L121 14 L137 22 L143 7 L150 19 L158 7 L164 22 L180 14 L177 28 L193 27 L181 38" />
          <path className="art-fine" d="M130 40 Q136 34 142 40 M158 40 Q164 34 170 40 M149 43 L145 51 L152 52 M137 59 Q150 67 163 59" />
          <circle className="art-fill" cx="137" cy="42" r="2.4" /><circle className="art-fill" cx="164" cy="42" r="2.4" />
          <path className="art-accent" d="M130 31 Q150 23 170 31 M135 68 Q150 77 165 68 M137 86 L150 96 L163 86" />
          <path className="art-stroke" d="M119 77 Q98 75 86 88 Q75 100 77 116 M181 77 Q201 76 211 88 Q220 99 217 116" />
          <path className="art-stroke" d="M75 82 L48 88 L43 108 Q53 126 75 121 Q88 111 85 94 Z M218 84 L248 78 L260 96 L253 116 Q235 126 219 116 Z" />
          <path className="art-fine" d="M51 95 H78 M48 104 H78 M227 91 H250 M224 101 H254" />
          <path className="art-stroke" d="M205 32 V122 M199 32 H211 M198 122 H212" />
          <path className="art-accent" d="M205 19 L195 33 H215 Z M109 129 H191" />
        </>
      );
      break;
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
          <path className="art-stroke" d="M20 45 L58 25 L96 45 M96 32 L135 10 L174 32 M174 50 L226 28 L280 50" />
          <path className="art-fine" d="M27 41 L58 24 L90 41 M103 28 L135 9 L168 28 M181 46 L226 27 L274 46" />
          <path className="art-accent" d="M24 73 H92 M100 64 H170 M178 77 H276 M24 78 q8 8 16 0 q8 8 16 0 q8 8 16 0 q8 8 16 0 M100 69 q8 8 16 0 q8 8 16 0 q8 8 16 0 q8 8 16 0 M178 82 q8 8 16 0 q8 8 16 0 q8 8 16 0 q8 8 16 0 q8 8 16 0" />
          <path className="art-fine" d="M32 56 H84 M108 45 H162 M188 61 H266 M32 91 H84 M108 82 H162 M188 96 H266" />
          <path className="art-stroke" d="M38 56 V68 M48 56 V68 M58 56 V68 M68 56 V68 M78 56 V68 M114 45 V57 M124 45 V57 M134 45 V57 M144 45 V57 M154 45 V57 M194 61 V73 M204 61 V73 M214 61 V73 M224 61 V73 M234 61 V73 M244 61 V73 M254 61 V73" />
          <path className="art-stroke" d="M45 124 V94 Q58 82 71 94 V124 M124 124 V83 Q135 71 146 83 V124 M216 124 V99 Q228 87 240 99 V124" />
          <path className="art-fine" d="M58 93 V124 M135 83 V124 M228 99 V124 M50 109 H66 M127 102 H143 M220 112 H236" />
          <path className="art-accent" d="M36 20 q7 -10 14 0 q7 -10 14 0 M120 17 q7 -10 14 0 q7 -10 14 0 M218 24 q7 -10 14 0 q7 -10 14 0" />
          <path className="art-stroke" d="M42 104 q-10 8 -10 20 M75 104 q10 8 10 20 M111 105 q-10 8 -10 19 M159 105 q10 8 10 19 M194 108 q-10 7 -10 16 M260 108 q10 7 10 16" />
          <circle className="art-fill" cx="31" cy="119" r="3" /><circle className="art-fill" cx="85" cy="119" r="3" /><circle className="art-fill" cx="100" cy="119" r="3" /><circle className="art-fill" cx="170" cy="119" r="3" />
        </>
      );
      break;
  }
  return <svg className={`${className} scene-${scene} variant-${variant}`} viewBox="0 0 300 150" role="img" aria-label={`${coloringSceneLabels[scene]} line drawing`}>{common}{details}<VariantLineDetails scene={scene} variant={variant} /></svg>;
}

function ColoringPageBoard({ activity, context }: { activity: Activity; context?: string }) {
  const spec = coloringPageSpec(activity, context);
  const variant = coloringVariantFor(activity, context);
  return (
    <div className="coloring-page-board">
      <div className="coloring-page-topline">
        <span className="coloring-page-kicker">SPOT · COLOR · TRACE</span>
        <div className="coloring-how-to"><b>HOW TO PLAY</b><span>{spec.howToPlay}</span></div>
      </div>
      <div className="coloring-page-main">
        <div className="coloring-scene-panel">
          <b>Color the {spec.illustration.label}</b>
          {spec.illustration.imagePath ? (
            <div className="coloring-raster-art">
              <Image
                alt={`${spec.illustration.label} coloring illustration`}
                fill
                sizes="(max-width: 700px) 42vw, 280px"
                src={spec.illustration.imagePath}
                unoptimized
              />
            </div>
          ) : (
            <DestinationLineArt scene={spec.scene} variant={variant} className="line-art coloring-hero-art" />
          )}
        </div>
        <div className="coloring-mini-panel">
          <div className="coloring-mini-heading"><b>Can you spot...</b><span>B · I · N · G · O</span></div>
          <div className="coloring-mini-grid">
            {spec.cells.map((cell, index) => (
              <div className={`coloring-mini-cell cell-${cell.kind}`} key={`${cell.kind}-${cell.label}-${index}`}>
                <span className="coloring-cell-badge">{cell.kind === "item" ? "SPOT" : cell.kind === "free" ? "FREE" : "TRY"}</span>
                <strong>{cell.label}</strong>
                <small>{cell.clue}</small>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="coloring-trace-strip">
        <span>TRACE THE NAME</span>
        <strong>{spec.traceWord}</strong>
        <small>{spec.illustration.subject}</small>
      </div>
      <div className="coloring-note-grid">
        <div className="coloring-local-note">
          <b>LOCAL CLUES</b>
          <ul>{spec.facts.map((fact) => <li key={fact}>{fact}</li>)}</ul>
        </div>
        <div className="coloring-field-note"><b>MY FIELD NOTE</b><small>{spec.fieldNote}</small><i /><i /></div>
      </div>
    </div>
  );
}

function DrawingBoard({ activity, coloring, context }: { activity: Activity; coloring: boolean; context?: string }) {
  const items = activity.items?.length ? activity.items : fallbackItems;
  if (coloring) return <ColoringPageBoard activity={activity} context={context} />;
  const scene = coloringSceneFor(activity, context);
  const variant = coloringVariantFor(activity, context);
  const illustration = coloringIllustrationSpecs[scene];
  const imagePath = activity.illustrationPath || curatedColoringImagePath(activity, context);
  return (
    <div className="draw-board">
      {imagePath ? (
        <div className="destination-raster-art">
          <Image
            alt={`${illustration.label} drawing reference`}
            fill
            sizes="(max-width: 700px) 55vw, 320px"
            src={imagePath}
            unoptimized
          />
        </div>
      ) : (
        <DestinationLineArt scene={scene} variant={variant} />
      )}
      <strong>{items[0].label}</strong>
      <small>{items[0].clue || illustration.subject}</small>
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
  // Words are normalized/deduped by createWordSearch (may drop or reorder
  // labels), so puzzle.words[i] is not guaranteed to match items[i]
  // positionally — look clues up by the same normalized form instead.
  const clueByWord = new Map(items.map((item) => [normalizePuzzleWord(item.label, size), item.clue]));
  return (
    <div className="word-search-layout">
      <div className="word-grid" style={{ "--puzzle-size": puzzle.grid.length } as CSSProperties}>
        {puzzle.grid.flatMap((row, rowIndex) =>
          row.map((letter, columnIndex) => <span key={`${rowIndex}-${columnIndex}`}>{letter}</span>),
        )}
      </div>
      <div className="word-bank">
        {puzzle.words.map((word) => (
          <span key={word}>
            <strong>{word}</strong>
            {clueByWord.get(word) ? <em>{clueByWord.get(word)}</em> : null}
          </span>
        ))}
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

function GameEditorialHeader({ activity }: { activity: Activity }) {
  const playCue: Partial<Record<GameType, string>> = {
    word_search: "Circle every local word in the grid.",
    crossword: "Solve each clue where the answers cross.",
    maze: "Trace one continuous route without crossing a wall.",
    matching: "Connect each local detail to its correct clue.",
    bingo: "Mark a square only when you spot it for real.",
    spot_the_difference: "Compare both pictures and prove each change.",
    codebreaker: "Use the key to decode the hidden local word.",
    map_puzzle: "Visit every stop while keeping the route short.",
    scavenger_hunt: "Tick each detail when you find it at the place.",
    quiz: "Choose an answer and point to your evidence.",
    drawing: "Study the reference, then add one observed detail.",
    story: "Use the local clues to build a tiny travel story.",
  };
  const details = (activity.items || []).slice(0, 3).map((item) => item.label).join(" · ");
  return (
    <div className="game-editorial-header">
      <div className="game-editorial-meta">
        <span>{activity.kind || "FIELD GAME"}</span>
        <b>HOW TO PLAY</b>
      </div>
      <p>{playCue[activity.gameType || "story"]}</p>
      <div className="game-editorial-note">
        <b>LOOK FOR</b>
        <span>{details || "one unmistakably local detail"}</span>
      </div>
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
      {gameType === "coloring" ? <style>{coloringPageCss}</style> : null}
      <b>{gameNames[gameType]}</b>
      {gameType === "coloring" ? board : (
        <>
          <GameEditorialHeader activity={activity} />
          <div className="game-board-content">{board}</div>
        </>
      )}
    </section>
  );
}
