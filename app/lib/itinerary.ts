// Turns whatever a family pastes as a trip outline (a markdown table from a
// chat assistant, a bulleted list, or day-by-day notes) into typed events and
// clean one-line daily plans, and tells travel-only days (flights, hotel
// check-in, packing) apart from days that visit somewhere.
//
// A live Ipoh booklet showed what the older line splitter did with a pasted
// markdown table: header and separator rows became "attractions", rows were
// cut mid-word at the length cap, bold markers and emoji stayed in the plan,
// and any row mentioning "train" was typed as a train ride. The composer then
// read "Attraction: | Date | Plan |" on an arrival day and themed it around
// the city's most famous landmark.

export type ItineraryEventType =
  | "flight"
  | "train"
  | "hotel"
  | "attraction"
  | "meal"
  | "downtime"
  | "travel"
  // Text that does not say what kind of stop it is ("Focus on animals").
  // Shown without a type label rather than guessed as an attraction.
  | "other";

export type ItineraryEvent = {
  id: string;
  day: number;
  type: ItineraryEventType;
  title: string;
  place?: string;
  details?: string;
};

export const DAILY_PLAN_MAX = 140;
const EVENT_TITLE_MAX = 120;

const EVENT_TYPE_LABELS: Record<ItineraryEventType, string> = {
  flight: "Flight",
  train: "Train",
  hotel: "Hotel",
  attraction: "Attraction",
  meal: "Meal",
  downtime: "Downtime",
  travel: "Travel",
  other: "Plan",
};

export function eventTypeLabel(type: ItineraryEventType) {
  return EVENT_TYPE_LABELS[type] ?? EVENT_TYPE_LABELS.other;
}

export function isItineraryEventType(value: unknown): value is ItineraryEventType {
  return typeof value === "string" && Object.hasOwn(EVENT_TYPE_LABELS, value);
}

// Cuts at the last whole word that fits, never inside a word (unless a
// single word is longer than half the limit), and drops a dangling joiner.
export function capAtWordBoundary(value: string, maximum: number) {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length <= maximum) return text;
  const slice = text.slice(0, maximum + 1);
  const cut = slice.lastIndexOf(" ");
  const kept = cut >= Math.floor(maximum / 2) ? slice.slice(0, cut) : text.slice(0, maximum);
  return kept
    .replace(/[\s,;:/+&|–—-]+$/u, "")
    .replace(/\s+(?:and|or|to|the|a|an|of|at|in|on|for|with|then|from)$/i, "")
    .replace(/[\s,;:/+&|–—-]+$/u, "")
    .trim();
}

const ARROW = /\s*(?:→|⟶|➝|➔|➜|➞|➡️?|->|=>)\s*/gu;
const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}︎️‍⃣]/gu;

// Markdown, HTML and emoji out; route arrows normalized to " → ".
export function stripItineraryMarkup(value: string) {
  return value
    .replace(ARROW, " → ")
    .replace(/<br\s*\/?>/gi, "; ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(EMOJI, " ")
    .replace(/\*+|`+|~~|__/g, "")
    .replace(/^\s*#{1,6}\s*/, "")
    .replace(/^\s*>\s*/, "")
    .replace(/^\s*(?:[-+•▪◦‣–—]|\d{1,2}[.)])\s+/u, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Whether a daily plan still carries pasted markup (a table pipe, bold
// markers, emoji, arrows, bullets) and needs cleaning before use.
export function looksMarkedUp(value: string) {
  return /[|*`<>]|^\s*#|→|->|=>|\p{Extended_Pictographic}|(?:^|;)\s*[-•]\s/u.test(value);
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
    || Object.entries(monthNumbers).find(([name]) => lower.length >= 3 && name.startsWith(lower))?.[1];
}

const NAMED_DATE_DAY_FIRST = /^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?(?:,?\s+(?:19|20)\d{2})?(?![A-Za-z])/;
const NAMED_DATE_MONTH_FIRST = /^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(?:19|20)\d{2})?(?![\d:])/;
const NUMERIC_DATE = /^(\d{1,2})[/.\-](\d{1,2})(?:[/.\-](\d{2,4}))?(?![\w:])/;
const WEEKDAY = /^(?:mon(?:day)?|tue(?:s|sday)?|wed(?:s|nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\.?(?=[\s,:()|–—-]|$)/i;
const DAY_LABEL = /^day\s*(\d{1,2})(?!\d)/i;
const CUE_SEPARATOR = /^[\s:,.()[\]|–—-]+/u;

function matchDate(value: string): { marker: ItineraryDateMarker; length: number } | null {
  const named = value.match(NAMED_DATE_DAY_FIRST);
  if (named) {
    const month = monthNumber(named[2]);
    const day = Number(named[1]);
    if (month && day >= 1 && day <= 31) {
      return { marker: { key: `${month}-${String(day).padStart(2, "0")}`, label: `${day} ${named[2]}` }, length: named[0].length };
    }
  }
  const monthFirst = value.match(NAMED_DATE_MONTH_FIRST);
  if (monthFirst) {
    const month = monthNumber(monthFirst[1]);
    const day = Number(monthFirst[2]);
    if (month && day >= 1 && day <= 31) {
      return { marker: { key: `${month}-${String(day).padStart(2, "0")}`, label: `${day} ${monthFirst[1]}` }, length: monthFirst[0].length };
    }
  }
  const numeric = value.match(NUMERIC_DATE);
  if (numeric) {
    const day = Number(numeric[1]);
    const month = Number(numeric[2]);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return {
        marker: { key: `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`, label: `${day}/${month}` },
        length: numeric[0].length,
      };
    }
  }
  return null;
}

type DayCue = { explicitDay?: number; date?: ItineraryDateMarker; rest: string };

// A "Day 2", "Sun 11 Oct", "10 April" or "Day 1 (Sat 10 Oct):" at the start
// of a line. Dates elsewhere in the text are ignored so that "3-4pm" or
// "Gate 12" never start a new day.
function leadingDayCue(value: string): DayCue {
  let rest = value;
  let explicitDay: number | undefined;
  let date: ItineraryDateMarker | undefined;
  for (let guard = 0; guard < 6; guard += 1) {
    rest = rest.replace(CUE_SEPARATOR, "");
    const dayLabel = explicitDay === undefined ? rest.match(DAY_LABEL) : null;
    if (dayLabel) {
      explicitDay = Number(dayLabel[1]);
      rest = rest.slice(dayLabel[0].length);
      continue;
    }
    if (date) break;
    const weekday = rest.match(WEEKDAY);
    if (weekday) {
      const after = rest.slice(weekday[0].length).replace(CUE_SEPARATOR, "");
      const dated = matchDate(after);
      if (!dated) break;
      date = dated.marker;
      rest = after.slice(dated.length);
      continue;
    }
    const dated = matchDate(rest);
    if (!dated) break;
    date = dated.marker;
    rest = rest.slice(dated.length);
  }
  if (explicitDay === undefined && !date) return { rest: value };
  return { explicitDay, date, rest: rest.replace(CUE_SEPARATOR, "").trim() };
}

const FLIGHT_NUMBER = /\b(?:[A-Z]{2}|[A-Z]\d|\d[A-Z])\s?\d{2,4}\b/;
const FLIGHT = /\b(?:flights?|fly|flying|flew|airports?|airplane|aeroplane|plane|boarding|terminal|layover|airline)\b/i;
const TRAIN = /\b(?:trains?\s+(?:to|from|ride|journey|trip|back|home)|(?:take|catch|ride|board|by)\s+(?:the\s+|a\s+)?(?:train|tram|mrt|lrt|metro|subway|monorail)|mrt|lrt|metro|subway|tram|monorail|shinkansen|bullet train|ets|ktm|eurostar|tgv|amtrak)\b/i;
const HOTEL = /\b(?:hotels?|check(?:ing)?[- ]?in|check(?:ing)?[- ]?out|resort|hostel|airbnb|guest ?house|homestay|villa|ryokan|suite|lobby|stay(?:ing)? at)\b/i;
const MEAL = /\b(?:breakfast|brunch|lunch|dinner|supper|hawker|restaurant|caf[eé]|food court|kopitiam|dim sum|snacks?|eat|meal)\b/i;
const DOWNTIME = /\b(?:rest|free time|naps?|pool|downtime|break|relax(?:ing)?|chill|lazy|quiet time|playground)\b/i;
const TRAVEL = /\b(?:transfers?|taxi|grab|uber|bus|coach|travel|drive|driving|ferry|leave|depart(?:ure)?|arrive|arrival|head (?:back|home|out)|back to|pack|packing|walk(?:ing)?|road trip|journey|transit)\b/i;
const ATTRACTION = /\b(?:museums?|temples?|caves?|parks?|zoo|gardens?|gallery|galleries|palace|castle|tower|beach|waterfalls?|lake|hills?|mountains?|markets?|street art|old town|square|cathedral|church|mosque|shrine|aquarium|fort|bridge|monument|ruins|reserve|island|village|tour|cruise|show|festival|landmark|sightseeing|visit|explore|exploring|see|safari|farm|theme park|water park|heritage|murals?)\b/i;
const PROPER_NOUN_PHRASE = /\b[A-Z][\p{L}'’-]+(?:\s+(?:(?:of|de|la|le|du|del|da|di|the|and|&|van|von|al|el)\s+)?[A-Z][\p{L}'’-]+)+/u;

// The type the text itself supports, or "other" when it does not say.
export function inferEventType(value: string): ItineraryEventType {
  if (FLIGHT.test(value) || FLIGHT_NUMBER.test(value)) return "flight";
  if (TRAIN.test(value)) return "train";
  if (HOTEL.test(value)) return "hotel";
  if (MEAL.test(value)) return "meal";
  if (DOWNTIME.test(value)) return "downtime";
  if (ATTRACTION.test(value) || PROPER_NOUN_PHRASE.test(value)) return "attraction";
  if (TRAVEL.test(value)) return "travel";
  return "other";
}

const HEADER_CELL = /^(?:date|dates|day|days|when|time|times|plan|plans|itinerary|activity|activities|schedule|morning|afternoon|evening|night|notes?|details?|where|what|location|places?|highlights?|stay|hotel|accommodation|meals?|food|transport|travel|#|no\.?|day\s*\/\s*date|date\s*\/\s*day)$/i;
const DATE_HEADER = /^(?:date|dates|day|days|when|day\s*\/\s*date|date\s*\/\s*day)$/i;
// A leftover column heading on its own ("Plan"); "hotel" alone is a real step.
const HEADER_ONLY_STEP = /^(?:date|dates|day|days|when|time|times|plan|plans|itinerary|activity|activities|schedule|notes?|details?|#|no\.?)$/i;
const SEPARATOR_CELL = /^:?-{2,}:?$/;
// Labels the app itself writes in front of an event ("Hotel: …"). An older
// importer put them in front of raw table rows, where they were guesses.
const EVENT_LABEL = /^(flight|train|hotel|attraction|meal|downtime|travel|plan)\s*:\s*/i;

type SourceRecord = { cue: DayCue | null; body: string; lineIndex: number };

function tableCells(line: string) {
  return line.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((cell) => cell.trim());
}

function isTableLine(line: string) {
  return /^\s*\|/.test(line) || (line.match(/\|/g)?.length ?? 0) >= 2;
}

// Each pasted line becomes zero or one record: a day cue (if the line starts
// a day) and the plan text. Table header and separator rows produce nothing.
function sourceRecords(text: string): SourceRecord[] {
  const records: SourceRecord[] = [];
  let headers: string[] | null = null;
  const lines = text.split(/\r?\n/).map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 80);
  lines.forEach((rawLine, lineIndex) => {
    const unlabelled = rawLine.replace(EVENT_LABEL, "");
    if (isTableLine(unlabelled)) {
      const cells = tableCells(unlabelled);
      const plain = cells.map((cell) => stripItineraryMarkup(cell));
      if (cells.every((cell) => !cell || SEPARATOR_CELL.test(cell.replace(/\s+/g, "")))) return;
      if (plain.some(Boolean) && plain.every((cell) => !cell || HEADER_CELL.test(cell))) {
        headers = plain;
        return;
      }
      const headerDate = headers ? headers.findIndex((header) => DATE_HEADER.test(header)) : -1;
      let dateIndex = headerDate >= 0 && headerDate < plain.length ? headerDate : -1;
      if (dateIndex < 0 && plain.length > 1) {
        const firstCue = leadingDayCue(plain[0]);
        if ((firstCue.explicitDay !== undefined || firstCue.date) && firstCue.rest.length <= 12) dateIndex = 0;
      }
      const cue = dateIndex >= 0 ? leadingDayCue(plain[dateIndex]) : null;
      const body = cells
        .filter((cell, index) => index !== dateIndex && plain[index])
        .join("; ");
      records.push({ cue: cue && (cue.explicitDay !== undefined || cue.date) ? cue : null, body, lineIndex });
      return;
    }
    const stripped = stripItineraryMarkup(rawLine);
    const cue = leadingDayCue(stripped);
    records.push({
      cue: cue.explicitDay !== undefined || cue.date ? cue : null,
      body: cue.explicitDay !== undefined || cue.date ? cue.rest : rawLine,
      lineIndex,
    });
  });
  return records;
}

const TRANSPORT_CUE = /\b(?:fly|flight|flying|train|bus|coach|ferry|drive|driving|transfer|taxi|grab|from)\b/i;
const ABBREVIATION = /^(?:st|mt|dr|mr|mrs|ms|no|vs|approx|ca|e\.g|i\.e|a\.m|p\.m|[a-z])\.$/i;

function lastWord(value: string) {
  return value.trim().split(/\s+/).pop() ?? "";
}

function firstWord(value: string) {
  return value.trim().split(/\s+/)[0] ?? "";
}

// "Singapore → Ipoh" after a flight number is one route; "Breakfast → pack"
// is two steps.
function splitArrows(value: string) {
  const pieces = value.split(/\s*→\s*/);
  const steps: string[] = [pieces[0]];
  for (const piece of pieces.slice(1)) {
    const previous = steps[steps.length - 1];
    const route = /^[A-Z]/.test(lastWord(previous))
      && /^[A-Z]/.test(firstWord(piece))
      && (TRANSPORT_CUE.test(previous) || FLIGHT_NUMBER.test(previous));
    if (route) steps[steps.length - 1] = `${previous} to ${piece}`;
    else steps.push(piece);
  }
  return steps;
}

function splitSentences(value: string) {
  const parts: string[] = [];
  let start = 0;
  for (const match of value.matchAll(/[.!?]\s+(?=[A-Z0-9"“(])/g)) {
    const end = (match.index ?? 0) + 1;
    if (ABBREVIATION.test(lastWord(value.slice(start, end)))) continue;
    parts.push(value.slice(start, end));
    start = end + match[0].length - 1;
  }
  parts.push(value.slice(start));
  return parts;
}

function splitSteps(body: string) {
  return stripItineraryMarkup(body)
    .split(/\s*[;•]\s*/)
    .flatMap(splitArrows)
    .flatMap(splitSentences)
    .flatMap((part) => part.split(/\s*,?\s+then\s+/i))
    .flatMap((part) => part.split(/\s+and\s+(?=(?:airport|hotel|train|museum|lunch|dinner|breakfast|market|walk|flight|attraction)\b)/i));
}

function cleanStep(value: string) {
  return stripItineraryMarkup(value)
    .replace(/^[\s,.;:/+&|–—-]+/u, "")
    .replace(/[\s,;:/+&|–—-]+$/u, "")
    .replace(/\.$/, "")
    .trim();
}

function isJunkStep(value: string) {
  return value.length < 3 || !/\p{L}/u.test(value) || HEADER_ONLY_STEP.test(value);
}

export function parseItineraryText(text: string, days: number): ItineraryEvent[] {
  const lastDay = Math.max(1, days);
  let currentDay = 1;
  const dateDays = new Map<string, number>();
  const seen = new Set<string>();
  const parsed = sourceRecords(text).flatMap((record) => {
    const { cue } = record;
    if (cue?.explicitDay !== undefined) {
      currentDay = Math.max(1, Math.min(lastDay, cue.explicitDay));
      if (cue.date) dateDays.set(cue.date.key, currentDay);
    } else if (cue?.date) {
      currentDay = dateDays.get(cue.date.key) || Math.min(lastDay, dateDays.size + 1);
      dateDays.set(cue.date.key, currentDay);
    }
    const events = splitSteps(record.body).flatMap((step, stepIndex) => {
      const label = step.trim().match(EVENT_LABEL);
      const title = capAtWordBoundary(cleanStep(label ? step.trim().slice(label[0].length) : step), EVENT_TITLE_MAX);
      if (isJunkStep(title)) return [];
      const labelled = label?.[1].toLocaleLowerCase();
      const type = labelled && labelled !== "plan" && isItineraryEventType(labelled) ? labelled : inferEventType(title);
      const key = `${currentDay}:${title.toLocaleLowerCase()}`;
      if (seen.has(key)) return [];
      seen.add(key);
      return [{
        id: `event-${record.lineIndex + 1}-${stepIndex + 1}`,
        day: currentDay,
        type,
        title,
      } satisfies ItineraryEvent];
    });
    if (!events.length && cue?.date) {
      return [{
        id: `event-${record.lineIndex + 1}-1`,
        day: currentDay,
        type: "other",
        title: `Plans for ${cue.date.label}`,
      } satisfies ItineraryEvent];
    }
    return events;
  });
  const daysWithRealEvents = new Set(parsed
    .filter((event) => !/^Plans for /i.test(event.title))
    .map((event) => event.day));
  return parsed.filter((event) => !/^Plans for /i.test(event.title) || !daysWithRealEvents.has(event.day));
}

// When a day's events do not all fit, the least telling ones go first (a
// "leave around 11:30" before the flight it leads to), keeping the order.
const PLAN_PRIORITY: Record<ItineraryEventType, number> = {
  attraction: 6,
  flight: 5,
  train: 5,
  hotel: 4,
  meal: 3,
  other: 3,
  travel: 2,
  downtime: 1,
};

// A named stop says more than a generic one; going "back to the hotel for a
// rest" says the least.
function planPriority(event: ItineraryEvent) {
  const base = PLAN_PRIORITY[event.type] ?? 3;
  if (/^(?:back to|head back|return to)\b|\b(?:rest|relax|nap)\b/i.test(event.title) && event.type !== "attraction") return 0;
  return base + (namesAPlace(event.title) && event.type !== "attraction" ? 1 : 0);
}

function fitPlanParts(parts: Array<{ text: string; priority: number }>, maximum: number) {
  const kept = [...parts];
  const length = () => kept.reduce((sum, part) => sum + part.text.length, 0) + Math.max(0, kept.length - 1) * 2;
  while (kept.length > 1 && length() > maximum) {
    let drop = 0;
    for (let index = 1; index < kept.length; index += 1) {
      if (kept[index].priority <= kept[drop].priority) drop = index;
    }
    kept.splice(drop, 1);
  }
  return capAtWordBoundary(kept.map((part) => part.text).join("; "), maximum);
}

export function eventsToDailyPlans(events: ItineraryEvent[], days: number, maximum = DAILY_PLAN_MAX) {
  return Array.from({ length: days }, (_, index) => fitPlanParts(
    events
      .filter((event) => event.day === index + 1)
      .map((event) => ({
        text: event.type === "other" ? event.title : `${eventTypeLabel(event.type)}: ${event.title}`,
        priority: planPriority(event),
      })),
    maximum,
  ));
}

// Adds an imported plan to what the family already typed for that day,
// without repeating it and without cutting a word. A field still holding an
// older import's markup is replaced.
export function mergeDailyPlans(current: string, imported: string, maximum = DAILY_PLAN_MAX) {
  const existing = current.replace(/\s+/g, " ").trim();
  const incoming = imported.replace(/\s+/g, " ").trim();
  if (!incoming) return capAtWordBoundary(existing, maximum);
  if (!existing || looksMarkedUp(existing)) return capAtWordBoundary(incoming, maximum);
  const normalized = (value: string) => value.toLocaleLowerCase();
  if (normalized(existing).includes(normalized(incoming))) return capAtWordBoundary(existing, maximum);
  if (normalized(incoming).includes(normalized(existing))) return capAtWordBoundary(incoming, maximum);
  return capAtWordBoundary(`${existing}; ${incoming}`, maximum);
}

// A daily plan ready for research and composition. Plain text is kept as
// typed; a plan that still carries pasted markup (including plans saved by
// the older importer) is re-parsed into clean "Type: step" parts.
export function cleanDailyPlan(plan: string, maximum = DAILY_PLAN_MAX) {
  const text = plan.replace(/\s+/g, " ").trim();
  if (!text || !looksMarkedUp(text)) return text;
  const events = parseItineraryText(text.split(/\s*;\s*/).join("\n"), 1);
  return eventsToDailyPlans(events, 1, maximum)[0]
    || capAtWordBoundary(cleanStep(text.replace(/\|/g, " ")), maximum);
}

const LOGISTICS_TRAVEL = /\b(?:transfers?|taxi|grab|uber|leave|depart(?:ure)?|arrive|arrival|head (?:back|home)|back to the (?:hotel|airport)|to the airport|pack|packing|check(?:ing)?[- ]?out|journey|transit|travel day)\b/i;
const NOT_A_PLACE = /^(?:I|AM|PM|Mon|Tue|Tues|Wed|Thu|Thur|Fri|Sat|Sun|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)$/;

// A capitalized word after the first one: "lunch at Nam Heong", not
// "Breakfast" or "Leave around 11:30am".
function namesAPlace(title: string) {
  return title.split(/\s+/).slice(1).some((word) => {
    const bare = word.replace(/^[("'“‘]+|[)"'”’.,:;!?]+$/g, "");
    return /^\p{Lu}\p{L}/u.test(bare) && !NOT_A_PLACE.test(bare);
  });
}

function logisticsRole(type: ItineraryEventType, title: string): "travel" | "neutral" | "visit" {
  switch (type) {
    case "flight":
    case "train":
    case "hotel":
      return "travel";
    case "travel":
      if (!LOGISTICS_TRAVEL.test(title)) return "visit";
      return !namesAPlace(title) || /\b(?:airport|hotel)\b/i.test(title) ? "travel" : "visit";
    case "meal":
    case "downtime":
      return !namesAPlace(title) || HOTEL.test(title) ? "neutral" : "visit";
    case "other":
      return !namesAPlace(title) && !ATTRACTION.test(title) ? "neutral" : "visit";
    default:
      return "visit";
  }
}

// True when a day's plan is only getting there, getting home or hotel time
// (flight, airport, transfer, check-in or check-out, packing, breakfast at
// the hotel) and names nothing to visit. Such a day is a travel day: the
// booklet must not invent a landmark visit for it.
export function isTravelOnlyPlan(plan: string) {
  const text = cleanDailyPlan(plan);
  if (!text) return false;
  const events = parseItineraryText(text.split(/\s*;\s*/).join("\n"), 1);
  if (!events.length) return false;
  // Each comma clause counts on its own, so "Fly to Ipoh, lunch at Nam
  // Heong" still names a place to visit. The first clause keeps the event's
  // own type (a "Hotel: Grand Hyatt" label); later ones say their own.
  const roles = events.flatMap((event) => event.title.split(/\s*,\s+/).map((clause, index) => {
    const inferred = inferEventType(clause);
    const type = index === 0 || inferred === "other" ? event.type : inferred;
    return logisticsRole(type, clause);
  }));
  return roles.includes("travel") && !roles.includes("visit");
}

export function normalizeItineraryEvents(value: unknown, days: number): ItineraryEvent[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error("Itinerary events must be a list.");
  const cleanText = (item: unknown, maximum: number) => typeof item === "string"
    ? capAtWordBoundary(item.replace(/\s+/g, " ").trim(), maximum)
    : "";
  return value.slice(0, 80).flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const event = item as Record<string, unknown>;
    const day = Number(event.day);
    const title = cleanText(event.title, EVENT_TITLE_MAX);
    if (!Number.isInteger(day) || day < 1 || day > days || title.length < 2) return [];
    const type = isItineraryEventType(event.type) ? event.type : inferEventType(title);
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
