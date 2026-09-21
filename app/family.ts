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

const monthNumbers: Record<string, string> = {
  jan: "01",
  january: "01",
  feb: "02",
  february: "02",
  mar: "03",
  march: "03",
  apr: "04",
  apri: "04",
  april: "04",
  may: "05",
  jun: "06",
  june: "06",
  jul: "07",
  july: "07",
  aug: "08",
  august: "08",
  sep: "09",
  sept: "09",
  september: "09",
  oct: "10",
  october: "10",
  nov: "11",
  november: "11",
  dec: "12",
  december: "12",
};

type ItineraryDateMarker = {
  key: string;
  label: string;
};

function monthNumber(value: string) {
  const lower = value.toLocaleLowerCase();
  return monthNumbers[lower]
    || Object.entries(monthNumbers).find(([name]) => name.length >= 3 && name.startsWith(lower))?.[1];
}

function itineraryDateMarker(value: string): ItineraryDateMarker | null {
  const namedDate = value.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\b/i)
    || value.match(/\b([A-Za-z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?\b/i);
  if (namedDate) {
    const first = namedDate[1];
    const second = namedDate[2];
    const day = /^\d/.test(first) ? first : second;
    const monthLabel = /^\d/.test(first) ? second : first;
    const month = monthNumber(/^\d/.test(first) ? second : first);
    if (month && Number(day) >= 1 && Number(day) <= 31) {
      return {
        key: `${month}-${day.padStart(2, "0")}`,
        label: `${Number(day)} ${monthLabel}`,
      };
    }
  }

  const numericDate = value.match(/\b(\d{1,2})[/.\-](\d{1,2})(?:[/.\-](\d{2,4}))?\b/);
  if (numericDate) {
    const day = Number(numericDate[1]);
    const month = Number(numericDate[2]);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return {
        key: `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
        label: `${day}/${month}`,
      };
    }
  }
  return null;
}

const itineraryDatePrefix = /^\s*(?:day\s*\d{1,2}\s*[:\-]\s*)?(?:(?:\d{1,2})(?:st|nd|rd|th)?\s+[A-Za-z]{3,9}|(?:[A-Za-z]{3,9})\s+\d{1,2}(?:st|nd|rd|th)?|\d{1,2}[/.\-]\d{1,2}(?:[/.\-]\d{2,4})?)(?:\s*(?:[:,-]|\u2013|\u2014)\s*|\s+|$)/i;

function eventTitle(value: string) {
  return value
    .replace(/^\s*day\s*\d{1,2}\s*[:\-]\s*/i, "")
    .replace(itineraryDatePrefix, "")
    .replace(/^[-*•\d.)\s]+/, "")
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
  const dateDays = new Map<string, number>();
  const parsed = lines.flatMap((line, index) => {
    const explicitDay = line.match(/\bday\s*(\d{1,2})\b/i);
    const dateMarker = itineraryDateMarker(line);
    if (explicitDay) {
      currentDay = Math.max(1, Math.min(days, Number(explicitDay[1])));
      if (dateMarker) dateDays.set(dateMarker.key, currentDay);
    } else if (dateMarker) {
      const existingDay = dateDays.get(dateMarker.key);
      currentDay = existingDay || Math.min(days, dateDays.size + 1);
      dateDays.set(dateMarker.key, currentDay);
    }
    const parts = line.split(/\s+and\s+(?=(?:airport|hotel|train|museum|lunch|dinner|breakfast|market|walk|flight|attraction)\b)/i);
    return parts.flatMap((part, partIndex) => {
      const title = eventTitle(part);
      if (title.length < 2 && !dateMarker) return [];
      const type = inferEventType(title);
      return [{
        id: `event-${index + 1}-${partIndex + 1}`,
        day: currentDay,
        type,
        title: (title || `Plans for ${dateMarker?.label || "this date"}`).slice(0, 120),
      } satisfies ItineraryEvent];
    });
  });
  const daysWithRealEvents = new Set(parsed
    .filter((event) => !/^Plans for /i.test(event.title))
    .map((event) => event.day));
  return parsed.filter((event) => !/^Plans for /i.test(event.title) || !daysWithRealEvents.has(event.day));
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
