import type { Activity } from "./booklet";

export const coloringScenes = [
  "merlion",
  "guardian",
  "tile",
  "skyline",
  "supertree",
  "garden",
  "bridge",
  "train",
  "market",
  "mountain",
  "temple",
  "mosque",
  "tower",
  "castle",
  "cave",
  "coast",
  "penguin",
  "wildlife",
  "dinosaur",
  "shophouse",
] as const;

export type ColoringScene = (typeof coloringScenes)[number];

export type ColoringVariant = 0 | 1 | 2;

export type ColoringIllustrationSpec = {
  label: string;
  subject: string;
  detailHints: readonly string[];
  imagePath?: string;
};

export type ColoringMiniCell = {
  kind: "item" | "challenge" | "free";
  label: string;
  clue: string;
};

export type ColoringPageSpec = {
  scene: ColoringScene;
  illustration: ColoringIllustrationSpec;
  traceWord: string;
  howToPlay: string;
  localClue: string;
  facts: string[];
  fieldNote: string;
  cells: ColoringMiniCell[];
};

export const coloringIllustrationSpecs: Record<ColoringScene, ColoringIllustrationSpec> = {
  merlion: {
    label: "Merlion fountain",
    subject: "the lion head, fish body, and water jet",
    detailHints: ["lion mane", "fish scales", "water spray"],
    imagePath: "/illustrations/merlion-coloring-v1.png",
  },
  guardian: {
    label: "temple guardian statue",
    subject: "a temple guardian with a headdress, shield, and pedestal",
    detailHints: ["guardian face", "ornate headdress", "shield and pedestal"],
  },
  tile: {
    label: "Peranakan tile motif",
    subject: "a repeating geometric tile pattern",
    detailHints: ["four-point flower", "repeating border", "mirror symmetry"],
  },
  skyline: { label: "city landmark skyline", subject: "a city skyline", detailHints: ["landmark roofline", "windows", "street level"] },
  supertree: {
    label: "Supertree Grove",
    subject: "a vertical garden tree",
    detailHints: ["branching canopy", "skyway", "hanging plants"],
    imagePath: "/illustrations/supertree-coloring-v1.png",
  },
  garden: { label: "local garden", subject: "a destination garden", detailHints: ["leaf shapes", "flowers", "garden path"] },
  bridge: { label: "landmark bridge", subject: "a landmark bridge", detailHints: ["arches or cables", "water", "crossing deck"] },
  train: { label: "local train journey", subject: "a local train", detailHints: ["windows", "rails", "station sign"] },
  market: { label: "local market", subject: "a local market stall", detailHints: ["awning", "baskets", "shop sign"] },
  mountain: { label: "mountain landscape", subject: "a mountain landscape", detailHints: ["summit", "trail", "clouds"] },
  temple: { label: "temple architecture", subject: "temple architecture", detailHints: ["roof tiers", "columns", "gate detail"] },
  mosque: { label: "mosque dome and minarets", subject: "a mosque dome and minarets", detailHints: ["dome", "minarets", "arched windows"] },
  tower: { label: "landmark tower", subject: "a landmark tower", detailHints: ["tower frame", "observation level", "skyline"] },
  castle: { label: "fort or castle", subject: "a fort or castle", detailHints: ["battlements", "gate", "stone wall"] },
  cave: { label: "cave landscape", subject: "a cave landscape", detailHints: ["cave mouth", "stalactites", "rock layers"] },
  coast: { label: "coast and harbor", subject: "a coast and harbor", detailHints: ["waves", "boat", "lighthouse"] },
  penguin: { label: "penguin colony", subject: "a penguin colony", detailHints: ["flippers", "beak", "rocky shore"] },
  wildlife: { label: "local wildlife", subject: "local wildlife", detailHints: ["animal silhouette", "habitat", "leafy cover"] },
  dinosaur: { label: "dinosaur discovery", subject: "a dinosaur discovery", detailHints: ["dinosaur shape", "fossil bones", "footprints"] },
  shophouse: { label: "historic shophouses", subject: "historic shophouses", detailHints: ["shutters", "covered walkway", "shop sign"] },
};

export const coloringSceneLabels: Record<ColoringScene, string> = Object.fromEntries(
  coloringScenes.map((scene) => [scene, coloringIllustrationSpecs[scene].label]),
) as Record<ColoringScene, string>;

type ColoringActivity = Pick<Activity, "title" | "items"> & Partial<Pick<Activity, "body" | "prompt">>;

function coloringText(activity: ColoringActivity, context: string) {
  return [
    activity.title,
    activity.body || "",
    activity.prompt || "",
    ...(activity.items || []).map((item) => `${item.label} ${item.clue}`),
    context,
  ].join("|");
}

function stableHash(value: string) {
  let hash = 17;
  for (const character of value) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return hash;
}

export function coloringVariantFor(
  activity: ColoringActivity,
  context = "",
): ColoringVariant {
  const position = context.match(/\bday\s+(\d+)\b[\s\S]*?\bgame\s+(\d+)\b/i);
  if (position) {
    const day = Number(position[1]);
    const game = Number(position[2]);
    if (Number.isInteger(day) && Number.isInteger(game) && day > 0 && game > 0) {
      return ((day + game - 2) % 3) as ColoringVariant;
    }
  }
  return (stableHash(coloringText(activity, context)) % 3) as ColoringVariant;
}

export function coloringSceneFor(
  activity: ColoringActivity,
  context = "",
): ColoringScene {
  const sceneFromText = (text: string): ColoringScene | undefined => {
    const value = text.toLocaleLowerCase();
    if (/merlion|water-spouting lion|lion fountain|lion head.*fish|fish.*lion/.test(value)) return "merlion";
    if (/temple guardian|guardian statue|guardian figure|guardian sculpture|stone sentinel|dvarapala|yaksha|statue|sculpture|idol/.test(value)) return "guardian";
    if (/tile|mosaic|ceramic|peranakan|geometric pattern|repeating pattern|pattern motif/.test(value)) return "tile";
    if (/supertree|gardens by the bay|ocbc skyway|vertical garden/.test(value)) return "supertree";
    if (/dinosaur|fossil|jurassic|prehistoric/.test(value)) return "dinosaur";
    if (/penguin|rookery/.test(value)) return "penguin";
    if (/mosque|minaret|islamic|sultan mosque|golden dome/.test(value)) return "mosque";
    if (/castle|citadel|fortress|fort\b|palace|rampart|battlement/.test(value)) return "castle";
    if (/eiffel|tower|spire|needle|observation deck|clock tower|belfry/.test(value)) return "tower";
    if (/cave|karst|limestone|grotto|cavern/.test(value)) return "cave";
    if (/shophouse|shop house|street shop|old town|lantern/.test(value)) return "shophouse";
    if (/train|railway|station|mrt|metro|tram|subway/.test(value)) return "train";
    if (/beach|coast|harbou?r|seaside|ocean|sea\b|island|lighthouse|waterfront|jetty/.test(value)) return "coast";
    if (/zoo|animal|wildlife|elephant|giraffe|monkey|panda|bird park|safari/.test(value)) return "wildlife";
    if (/bridge|skyway|viaduct|crossing/.test(value)) return "bridge";
    if (/market|hawker|food|meal|street stall/.test(value)) return "market";
    if (/temple|shrine|pagoda|cathedral|church|monastery/.test(value)) return "temple";
    if (/mountain|volcano|alpine|summit|cliff|hill|glacier/.test(value)) return "mountain";
    if (/garden|botanic|orchid|flower|forest|rainforest|bamboo|park|grove/.test(value)) return "garden";
    if (/skyline|city|downtown|skyscraper|building|architecture|museum|gallery|monument/.test(value)) return "skyline";
    return undefined;
  };

  const titleScene = sceneFromText(activity.title);
  if (titleScene && titleScene !== "skyline") return titleScene;

  const titleSupportScene = sceneFromText(`${activity.title} ${activity.body || ""} ${activity.prompt || ""}`);
  if (titleSupportScene && titleSupportScene !== "skyline") return titleSupportScene;

  const itemScene = sceneFromText((activity.items || []).map((item) => `${item.label} ${item.clue}`).join(" "));
  if (itemScene && itemScene !== "skyline") return itemScene;

  const contextScene = sceneFromText(context);
  if (contextScene) return contextScene;

  return titleSupportScene || titleScene || itemScene || "skyline";
}

const traceWords: Partial<Record<ColoringScene, string>> = {
  merlion: "MERLION",
  guardian: "GUARDIAN",
  tile: "TILE",
  supertree: "SUPERTREE",
  shophouse: "SHOPHOUSE",
};

export function coloringPageSpec(activity: ColoringActivity, context = ""): ColoringPageSpec {
  const scene = coloringSceneFor(activity, context);
  const illustration = coloringIllustrationSpecs[scene];
  const items = (activity.items || []).slice(0, 4);
  const itemCells: ColoringMiniCell[] = items.map((item) => ({
    kind: "item",
    label: item.label,
    clue: item.clue,
  }));
  while (itemCells.length < 4) {
    itemCells.push({
      kind: "item",
      label: illustration.detailHints[itemCells.length] || "DETAIL",
      clue: "Find this detail in the picture or at the real place.",
    });
  }
  const challengeCells: ColoringMiniCell[] = [
    { kind: "challenge", label: "COLOR CLUE", clue: `Choose a color for the ${illustration.detailHints[0]}.` },
    { kind: "challenge", label: "SHAPE CLUE", clue: `Trace the outline of the ${illustration.detailHints[1]}.` },
    { kind: "challenge", label: "TINY DETAIL", clue: `Find the smallest ${illustration.detailHints[2]}.` },
    { kind: "challenge", label: "FAMILY FIND", clue: "Ask someone which local detail they noticed first." },
  ];
  return {
    scene,
    illustration,
    traceWord: (traceWords[scene] || itemCells[0].label || illustration.label.split(" ")[0])
      .replace(/[^A-Za-z0-9 ]/g, "")
      .toUpperCase(),
    howToPlay: "Spot it, color its square, and get 3 in a row.",
    localClue: itemCells[0].clue || activity.body || activity.prompt || illustration.subject,
    facts: itemCells.slice(0, 3).map((item) => item.clue),
    fieldNote: activity.prompt || "The first thing I noticed was...",
    cells: [
      itemCells[0], challengeCells[0], itemCells[1],
      challengeCells[1], { kind: "free", label: "FREE", clue: "Use any local detail you choose." }, itemCells[2],
      challengeCells[2], itemCells[3], challengeCells[3],
    ],
  };
}
