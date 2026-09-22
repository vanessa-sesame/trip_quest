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
  "canal",
  "windmill",
  "bicycle",
  "machine",
  "boat",
  "statue",
  "playground",
  "artwork",
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
    imagePath: "/illustrations/guardian-coloring-v1.png",
  },
  tile: {
    label: "Peranakan tile motif",
    subject: "a repeating geometric tile pattern",
    detailHints: ["four-point flower", "repeating border", "mirror symmetry"],
    imagePath: "/illustrations/tile-coloring-v1.png",
  },
  // No imagePath: this is the catch-all scene (coloringSceneFor's final
  // fallback, and the broadest keyword match — "city", "building",
  // "museum", etc.), reached far more often than any other single scene.
  // skyline-coloring-v1.png is a real but specific, identifiable landmark
  // (Marina Bay Sands, Singapore) — showing it for every unmatched subject
  // worldwide is factually wrong, not just generic. Falling back to the
  // abstract vector scene (drawColoringScene) instead is honestly generic.
  skyline: { label: "city landmark skyline", subject: "a city skyline", detailHints: ["landmark roofline", "windows", "street level"] },
  supertree: {
    label: "Supertree Grove",
    subject: "a vertical garden tree",
    detailHints: ["branching canopy", "skyway", "hanging plants"],
    imagePath: "/illustrations/supertree-coloring-v1.png",
  },
  garden: { label: "local garden", subject: "a destination garden", detailHints: ["leaf shapes", "flowers", "garden path"], imagePath: "/illustrations/garden-coloring-v1.png" },
  bridge: { label: "landmark bridge", subject: "a landmark bridge", detailHints: ["arches or cables", "water", "crossing deck"], imagePath: "/illustrations/bridge-coloring-v1.png" },
  train: { label: "local train journey", subject: "a local train", detailHints: ["windows", "rails", "station sign"], imagePath: "/illustrations/train-coloring-v1.png" },
  market: { label: "local market", subject: "a local market stall", detailHints: ["awning", "baskets", "shop sign"], imagePath: "/illustrations/market-coloring-v1.png" },
  mountain: { label: "mountain landscape", subject: "a mountain landscape", detailHints: ["summit", "trail", "clouds"], imagePath: "/illustrations/mountain-coloring-v1.png" },
  temple: { label: "temple architecture", subject: "temple architecture", detailHints: ["roof tiers", "columns", "gate detail"], imagePath: "/illustrations/temple-coloring-v1.png" },
  mosque: { label: "mosque dome and minarets", subject: "a mosque dome and minarets", detailHints: ["dome", "minarets", "arched windows"], imagePath: "/illustrations/mosque-coloring-v1.png" },
  tower: { label: "landmark tower", subject: "a landmark tower", detailHints: ["tower frame", "observation level", "skyline"], imagePath: "/illustrations/tower-coloring-v1.png" },
  castle: { label: "fort or castle", subject: "a fort or castle", detailHints: ["battlements", "gate", "stone wall"], imagePath: "/illustrations/castle-coloring-v1.png" },
  cave: { label: "cave landscape", subject: "a cave landscape", detailHints: ["cave mouth", "stalactites", "rock layers"], imagePath: "/illustrations/cave-coloring-v1.png" },
  coast: { label: "coast and harbor", subject: "a coast and harbor", detailHints: ["waves", "boat", "lighthouse"], imagePath: "/illustrations/coast-coloring-v1.png" },
  penguin: { label: "penguin colony", subject: "a penguin colony", detailHints: ["flippers", "beak", "rocky shore"], imagePath: "/illustrations/penguin-coloring-v1.png" },
  wildlife: { label: "local wildlife", subject: "local wildlife", detailHints: ["animal silhouette", "habitat", "leafy cover"], imagePath: "/illustrations/wildlife-coloring-v1.png" },
  dinosaur: { label: "dinosaur discovery", subject: "a dinosaur discovery", detailHints: ["dinosaur shape", "fossil bones", "footprints"], imagePath: "/illustrations/dinosaur-coloring-v1.png" },
  shophouse: { label: "historic shophouses", subject: "historic shophouses", detailHints: ["shutters", "covered walkway", "shop sign"], imagePath: "/illustrations/shophouse-coloring-v1.png" },
  // New scenes (2026-09-22): added to widen keyword coverage beyond the
  // original ~20, so fewer unrelated subjects collide into the same
  // fallback. No imagePath yet — no image credits available to generate
  // curated art right now; see scripts/generate-coloring-library.ts, which
  // is ready to run (and safe to re-run — it skips scenes that already
  // have a file) the moment credits exist. Until then these render via the
  // shared neutral fallback in drawColoringScene (see the "skyline" case).
  canal: { label: "canal and houseboats", subject: "a canal lined with houseboats", detailHints: ["water reflection", "houseboat", "footbridge"] },
  windmill: { label: "windmill", subject: "a windmill", detailHints: ["turning sails", "tower", "surrounding fields"] },
  bicycle: { label: "bicycle path", subject: "a bicycle path", detailHints: ["bike wheel", "handlebars", "path markings"] },
  machine: { label: "invented machine", subject: "an imaginative invented machine", detailHints: ["gear", "lever", "moving part"] },
  boat: { label: "boat on the water", subject: "a boat on the water", detailHints: ["hull", "sail or deck", "water line"] },
  statue: { label: "statue or monument", subject: "a statue or monument", detailHints: ["base or pedestal", "figure outline", "plaque"] },
  playground: { label: "playground", subject: "a playground", detailHints: ["slide", "swing", "climbing frame"] },
  artwork: { label: "painting or artwork", subject: "a painting or piece of artwork", detailHints: ["frame", "brushstroke", "subject of the piece"] },
};

export const coloringSceneLabels: Record<ColoringScene, string> = Object.fromEntries(
  coloringScenes.map((scene) => [scene, coloringIllustrationSpecs[scene].label]),
) as Record<ColoringScene, string>;

type ColoringActivity = Pick<Activity, "title" | "items"> & Partial<Pick<Activity, "body" | "prompt" | "illustrationPath">>;

function coloringText(activity: ColoringActivity, context: string) {
  return [
    activity.title,
    activity.body || "",
    activity.prompt || "",
    ...(activity.items || []).map((item) => `${item.label} ${item.clue}`),
    context,
  ].join("|");
}

export function curatedColoringImagePath(activity: ColoringActivity, context = "") {
  const text = coloringText(activity, context).toLocaleLowerCase();
  if (/eiffel\s+tower|champ\s+de\s+mars/.test(text)) return "/illustrations/eiffel-tower-coloring-v1.png";
  return coloringIllustrationSpecs[coloringSceneFor(activity, context)].imagePath;
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
    // Bare "statue"/"sculpture"/"idol" deliberately excluded: guardian-coloring-v1.png
    // is a specific Southeast/East Asian temple-guardian lion, not a generic
    // statue — those bare words matched any statue anywhere (a European
    // bronze, an Egyptian carving) and showed this specific one regardless.
    if (/temple guardian|guardian statue|guardian figure|guardian sculpture|stone sentinel|dvarapala|yaksha/.test(value)) return "guardian";
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
    if (/canal|houseboat|canal house|canal ring/.test(value)) return "canal";
    if (/windmill|watermill/.test(value)) return "windmill";
    if (/bicycle|bike path|bike lane|cycling|cyclist/.test(value)) return "bicycle";
    if (/\bmachine\b|invention|contraption|gadget|gears?\b|pulley|chain reaction|mechanism/.test(value)) return "machine";
    if (/boat|ferry|sailboat|ship\b|vessel/.test(value)) return "boat";
    if (/beach|coast|harbou?r|seaside|ocean|sea\b|island|lighthouse|waterfront|jetty/.test(value)) return "coast";
    if (/zoo|animal|wildlife|elephant|giraffe|monkey|panda|bird park|safari/.test(value)) return "wildlife";
    if (/bridge|skyway|viaduct|crossing/.test(value)) return "bridge";
    if (/market|hawker|food|meal|street stall/.test(value)) return "market";
    if (/temple|shrine|pagoda|cathedral|church|monastery/.test(value)) return "temple";
    if (/mountain|volcano|alpine|summit|cliff|hill|glacier/.test(value)) return "mountain";
    if (/garden|botanic|orchid|flower|forest|rainforest|bamboo|park|grove/.test(value)) return "garden";
    // "monument" and "gallery" moved here from the skyline bucket below —
    // a statue/monument or a painting is a better match than a generic
    // cityscape. "museum" alone stays with skyline: many museums aren't
    // about art at all (natural history, science, transport).
    if (/statue|sculpture|monument|memorial|\bidol\b/.test(value)) return "statue";
    if (/painting|artwork|canvas|portrait|masterpiece|\bgallery\b/.test(value)) return "artwork";
    if (/playground|\bslide\b|swing set|jungle gym|climbing frame/.test(value)) return "playground";
    if (/skyline|city|downtown|skyscraper|building|architecture|museum/.test(value)) return "skyline";
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
  const illustration = {
    ...coloringIllustrationSpecs[scene],
    ...(activity.illustrationPath || curatedColoringImagePath(activity, context)
      ? { imagePath: activity.illustrationPath || curatedColoringImagePath(activity, context) }
      : {}),
  };
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
