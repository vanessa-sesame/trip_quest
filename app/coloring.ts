import type { Activity } from "./booklet";

export const coloringScenes = [
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

export const coloringSceneLabels: Record<ColoringScene, string> = {
  skyline: "city landmark skyline",
  supertree: "Supertree Grove",
  garden: "local garden",
  bridge: "landmark bridge",
  train: "local train journey",
  market: "local market",
  mountain: "mountain landscape",
  temple: "temple architecture",
  mosque: "mosque dome and minarets",
  tower: "landmark tower",
  castle: "fort or castle",
  cave: "cave landscape",
  coast: "coast and harbor",
  penguin: "penguin colony",
  wildlife: "local wildlife",
  dinosaur: "dinosaur discovery",
  shophouse: "historic shophouses",
};

export function coloringSceneFor(
  activity: Pick<Activity, "title" | "items">,
  context = "",
): ColoringScene {
  const sceneFromText = (text: string): ColoringScene | undefined => {
    const value = text.toLocaleLowerCase();
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

  const itemScene = sceneFromText(activity.items.map((item) => `${item.label} ${item.clue}`).join(" "));
  if (itemScene && itemScene !== "skyline") return itemScene;

  const contextScene = sceneFromText(context);
  if (contextScene) return contextScene;

  return titleScene || itemScene || "skyline";
}
