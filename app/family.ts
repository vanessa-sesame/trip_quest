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

export type ItineraryEventType =
  | "flight"
  | "train"
  | "hotel"
  | "attraction"
  | "meal"
  | "downtime"
  | "travel";

export type ItineraryEvent = {
  id: string;
  day: number;
  type: ItineraryEventType;
  title: string;
  place?: string;
  details?: string;
};

export type FamilyWorkspace = {
  children: FamilyChild[];
  updatedAt?: string;
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

const EVENT_TYPE_LABELS: Record<ItineraryEventType, string> = {
  flight: "Flight",
  train: "Train",
  hotel: "Hotel",
  attraction: "Attraction",
  meal: "Meal",
  downtime: "Downtime",
  travel: "Travel",
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

function cleanTags(value: unknown, maximum = 8) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .filter((item): item is string => typeof item === "string")
    .map((item) => cleanText(item, 32).toLocaleLowerCase())
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
      name: "Explorer",
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
      name: cleanText(child.name, 40) || `Explorer ${index + 1}`,
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
    `Child ${index + 1}: age ${child.age}, reading ${child.readingLevel}`,
    child.interests.length ? `interests: ${child.interests.join(", ")}` : "interests: none recorded",
    child.avoid.length ? `avoid: ${child.avoid.join(", ")}` : "avoid: none recorded",
    child.preferredMechanics.length
      ? `preferred mechanics: ${child.preferredMechanics.join(", ")}`
      : "preferred mechanics: open",
  ].join("; ")).join("\n");
}

export function mechanicLabel(mechanic: QuestMechanic) {
  return MECHANIC_LABELS[mechanic];
}

export function eventTypeLabel(type: ItineraryEventType) {
  return EVENT_TYPE_LABELS[type];
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

function inferEventType(value: string): ItineraryEventType {
  const lower = value.toLocaleLowerCase();
  if (/flight|airport|airplane|plane/.test(lower)) return "flight";
  if (/train|metro|mrt|subway|rail/.test(lower)) return "train";
  if (/hotel|check.?in|resort|stay/.test(lower)) return "hotel";
  if (/breakfast|lunch|dinner|hawker|restaurant|cafe|food|market/.test(lower)) return "meal";
  if (/rest|free time|nap|pool|downtime|break/.test(lower)) return "downtime";
  if (/walk|transfer|taxi|bus|travel|drive|ferry/.test(lower)) return "travel";
  return "attraction";
}

function eventTitle(value: string) {
  return value
    .replace(/^[-*•\d.)\s]+/, "")
    .replace(/^(day\s*\d+\s*[:\-]\s*)/i, "")
    .replace(/^(flight|train|hotel|attraction|meal|downtime|travel)\s*[:\-]\s*/i, "")
    .trim();
}

export function parseItineraryText(text: string, days: number): ItineraryEvent[] {
  const lines = text
    .split(/\r?\n|;|•/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 80);
  let currentDay = 1;
  return lines.flatMap((line, index) => {
    const explicitDay = line.match(/\bday\s*(\d{1,2})\b/i);
    if (explicitDay) currentDay = Math.max(1, Math.min(days, Number(explicitDay[1])));
    const parts = line.split(/\s+and\s+(?=(?:airport|hotel|train|museum|lunch|dinner|breakfast|market|walk|flight|attraction)\b)/i);
    return parts.flatMap((part, partIndex) => {
      const title = eventTitle(part);
      if (title.length < 2) return [];
      const type = inferEventType(title);
      return [{
        id: `event-${index + 1}-${partIndex + 1}`,
        day: currentDay,
        type,
        title: title.slice(0, 120),
      } satisfies ItineraryEvent];
    });
  });
}

export function eventsToDailyPlans(events: ItineraryEvent[], days: number) {
  return Array.from({ length: days }, (_, index) => events
    .filter((event) => event.day === index + 1)
    .map((event) => `${eventTypeLabel(event.type)}: ${event.title}`)
    .join("; ")
    .slice(0, 140));
}

export function normalizeItineraryEvents(value: unknown, days: number): ItineraryEvent[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error("Itinerary events must be a list.");
  return value.slice(0, 80).flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const event = item as Record<string, unknown>;
    const day = Number(event.day);
    const title = cleanText(event.title, 120);
    if (!Number.isInteger(day) || day < 1 || day > days || title.length < 2) return [];
    const type = EVENT_TYPE_LABELS[event.type as ItineraryEventType]
      ? event.type as ItineraryEventType
      : inferEventType(title);
    return [{
      id: cleanText(event.id, 64) || `event-${index + 1}`,
      day,
      type,
      title,
      place: cleanText(event.place, 100) || undefined,
      details: cleanText(event.details, 160) || undefined,
    } satisfies ItineraryEvent];
  });
}
