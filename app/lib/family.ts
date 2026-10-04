import type { ItineraryEvent } from "./itinerary.ts";

// Itinerary parsing lives in ./itinerary.ts; re-exported here for the
// pages and routes that already import it from the family module.
export {
  capAtWordBoundary,
  cleanDailyPlan,
  eventTypeLabel,
  eventsToDailyPlans,
  inferEventType,
  isTravelOnlyPlan,
  mergeDailyPlans,
  normalizeItineraryEvents,
  parseItineraryText,
  type ItineraryEvent,
  type ItineraryEventType,
} from "./itinerary.ts";

export type ReadingLevel =
  | "pre-reader"
  | "early-reader"
  | "independent-reader"
  | "confident-reader";

export type QuestMechanic =
  | "spot"
  | "draw"
  | "count"
  | "talk"
  | "imagine"
  | "navigate"
  | "photograph"
  | "solve"
  | "move"
  | "cooperate";

export type FamilyChild = {
  id: string;
  name: string;
  age: number;
  readingLevel: ReadingLevel;
  interests: string[];
  avoid: string[];
  preferredMechanics: QuestMechanic[];
};

export type FamilyWorkspace = {
  children: FamilyChild[];
  updatedAt?: string;
};

export type InterestPlanItem = {
  day: number;
  childNumber: number;
  interest: string;
};

export const QUEST_MECHANICS: QuestMechanic[] = [
  "spot",
  "draw",
  "count",
  "talk",
  "imagine",
  "navigate",
  "photograph",
  "solve",
  "move",
];

const MECHANIC_LABELS: Record<QuestMechanic, string> = {
  spot: "Spot",
  draw: "Draw",
  count: "Count",
  talk: "Talk",
  imagine: "Imagine",
  navigate: "Navigate",
  photograph: "Photograph",
  solve: "Solve",
  move: "Move",
  cooperate: "Cooperate",
};

const READING_LEVELS: ReadingLevel[] = [
  "pre-reader",
  "early-reader",
  "independent-reader",
  "confident-reader",
];

function cleanText(value: unknown, maximum: number) {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().slice(0, maximum)
    : "";
}

export function parseFamilyTags(value: string, maximum = 8) {
  return [...new Set(value
    .split(/[,;\n]+/)
    .map((item) => cleanText(item, 32).toLocaleLowerCase())
    .filter(Boolean))].slice(0, maximum);
}

function cleanTags(value: unknown, maximum = 8) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .filter((item): item is string => typeof item === "string")
    .flatMap((item) => parseFamilyTags(item, maximum))
    .filter(Boolean))].slice(0, maximum);
}

export function readingLevelForAge(age: number): ReadingLevel {
  if (age <= 5) return "pre-reader";
  if (age <= 7) return "early-reader";
  if (age <= 10) return "independent-reader";
  return "confident-reader";
}

export function defaultFamilyWorkspace(): FamilyWorkspace {
  return {
    children: [{
      id: "child-1",
      name: "Your child",
      age: 5,
      readingLevel: "pre-reader",
      interests: [],
      avoid: [],
      preferredMechanics: [],
    }],
  };
}

export function normalizeFamilyChildren(value: unknown): FamilyChild[] {
  if (value !== undefined && !Array.isArray(value)) {
    throw new Error("Family profiles must be a list.");
  }
  const children = Array.isArray(value) ? value : [];
  if (children.length > 6) throw new Error("Add up to six children per family workspace.");

  const normalized = children.map((item, index) => {
    if (!item || typeof item !== "object") throw new Error(`Child ${index + 1} is invalid.`);
    const child = item as Record<string, unknown>;
    const age = Number(child.age);
    if (!Number.isInteger(age) || age < 3 || age > 14) {
      throw new Error(`Child ${index + 1} age must be between 3 and 14.`);
    }
    const readingLevel = READING_LEVELS.includes(child.readingLevel as ReadingLevel)
      ? child.readingLevel as ReadingLevel
      : readingLevelForAge(age);
    const id = cleanText(child.id, 64) || `child-${index + 1}`;
    return {
      id,
      name: cleanText(child.name, 40) || (index === 0 ? "Your child" : `Sibling ${index}`),
      age,
      readingLevel,
      interests: cleanTags(child.interests),
      avoid: cleanTags(child.avoid),
      preferredMechanics: cleanTags(child.preferredMechanics, 4)
        .filter((item): item is QuestMechanic => QUEST_MECHANICS.includes(item as QuestMechanic)),
    } satisfies FamilyChild;
  });

  return normalized.length ? normalized : defaultFamilyWorkspace().children;
}

export function normalizeFamilyWorkspace(value: unknown): FamilyWorkspace {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    children: normalizeFamilyChildren(record.children),
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : undefined,
  };
}

export function familyPromptSummary(children: FamilyChild[]) {
  return children.map((child, index) => [
    `${index === 0 ? "Lead child" : `Sibling ${index}`}: age ${child.age}, reading ${child.readingLevel}`,
    child.interests.length ? `interests: ${child.interests.join(", ")}` : "interests: none recorded",
    child.avoid.length ? `avoid: ${child.avoid.join(", ")}` : "avoid: none recorded",
    child.preferredMechanics.length
      ? `preferred mechanics: ${child.preferredMechanics.join(", ")}`
      : "preferred mechanics: open",
  ].join("; ")).join("\n");
}

export function familyEditionContext(
  children: FamilyChild[],
  events: ItineraryEvent[] = [],
) {
  return JSON.stringify({
    children: children.map((child) => ({
      name: child.name.trim(),
      age: child.age,
      readingLevel: child.readingLevel,
      interests: child.interests,
      avoid: child.avoid,
      preferredMechanics: child.preferredMechanics,
    })),
    events: events.map((event) => ({
      day: event.day,
      type: event.type,
      title: event.title,
      place: event.place,
      details: event.details,
    })),
  });
}

export function familyChildDisplayName(child: FamilyChild, index: number) {
  const name = child.name.trim();
  if (index === 0 && /^(?:explorer|your child)(?:\s*1)?$/i.test(name)) return "Explorer 1";
  if (index > 0 && new RegExp(`^(?:explorer|sibling)(?:\\s*${index + 1})?$`, "i").test(name)) {
    return `Explorer ${index + 1}`;
  }
  return name || `Explorer ${index + 1}`;
}

export function mechanicLabel(mechanic: QuestMechanic) {
  return MECHANIC_LABELS[mechanic];
}

export const FAMILY_BADGES = [
  "Keen Observer",
  "Kind Traveler",
  "Brave Taster",
  "Pattern Finder",
  "Route Helper",
  "Story Keeper",
  "Team Player",
  "Local Detail",
] as const;

export function familyRoleDescription(child: FamilyChild, index: number) {
  const role = child.interests.some((interest) => /draw|art|paint|craft|sketch/i.test(interest))
    ? "Sketcher: turn one local shape into an original line"
    : [
        "Scout: spot one local detail and point it out",
        "Storyteller: explain what one clue might mean",
        "Evidence keeper: record the proof for the family",
        "Route keeper: choose the next safe stop with a grown-up",
        "Question maker: ask one curious why-or-how question",
        "Presenter: share the family answer",
      ][index % 6];
  const interests = child.interests.slice(0, 2).join(", ");
  return interests ? `${role}. Interest missions: ${interests}.` : role;
}

export function mechanicMissionPrompt(mechanic: QuestMechanic, theme: string) {
  switch (mechanic) {
    case "spot": return `Spot one tiny detail at ${theme} that most visitors might miss.`;
    case "draw": return `Draw the shape, texture, or pattern that best remembers ${theme}.`;
    case "count": return `Count four examples near ${theme}; compare which one is biggest or brightest.`;
    case "talk": return `Tell a grown-up one respectful question about what you notice at ${theme}.`;
    case "imagine": return `Imagine a local object at ${theme} could speak. Give it one helpful sentence.`;
    case "navigate": return `Choose the safest family route around ${theme}; mark one useful landmark.`;
    case "photograph": return `With permission, frame one photo of a pattern or detail connected to ${theme}.`;
    case "solve": return `Solve the clue, then point to the real evidence at ${theme}.`;
    case "move": return `Make a quiet three-step movement inspired by the shapes or rhythm at ${theme}.`;
    default: return `Combine your clues and make one family answer about ${theme}.`;
  }
}

export function mechanicPlanForTrip(children: FamilyChild[], days: number) {
  const preferred = children.flatMap((child) => child.preferredMechanics);
  const ordered = [...new Set([...preferred, ...QUEST_MECHANICS])];
  return Array.from({ length: days }, (_, index) => {
    const first = ordered[index % ordered.length];
    const second = ordered[(index + 3) % ordered.length];
    const shared = children.length > 1 && index % 2 === 1 ? "cooperate" : second;
    return { day: index + 1, mechanics: [first, shared] as QuestMechanic[] };
  });
}

export function interestPlanForTrip(children: FamilyChild[], days: number): InterestPlanItem[] {
  const interests = Array.from(
    { length: Math.max(0, ...children.map((child) => child.interests.length)) },
    (_, interestIndex) => children.flatMap((child, childIndex) => {
      const interest = child.interests[interestIndex];
      return interest ? [{ childNumber: childIndex + 1, interest }] : [];
    }),
  ).flat();
  if (!interests.length || days < 1) return [];

  const assignmentCount = Math.min(days, Math.max(interests.length, Math.ceil(days / 2)));
  return Array.from({ length: assignmentCount }, (_, index) => {
    const position = assignmentCount === 1
      ? 0
      : Math.round(index * (days - 1) / (assignmentCount - 1));
    return {
      day: position + 1,
      ...interests[index % interests.length],
    };
  });
}

// The family-pack context the printed booklet uses (explorer roles, trip
// thread, mission cards). Shared by the PDF route and the web preview so
// both draw exactly the same family pages.
export function familyPackFor(children: FamilyChild[], events: ItineraryEvent[], days: number) {
  return { children, events, mechanicsByDay: mechanicPlanForTrip(children, days) };
}
