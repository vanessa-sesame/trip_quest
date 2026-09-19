import { normalizeItinerary } from "./booklet-ai";
import {
  familyPromptSummary,
  normalizeFamilyChildren,
  normalizeItineraryEvents,
  type FamilyChild,
  type ItineraryEvent,
} from "./family";
import type { BookletCacheIdentity } from "./booklet-storage";
import { requireInteger } from "./request-security";

export type NormalizedPdfRequest = {
  destination: string;
  age: number;
  days: number;
  itinerary: string[];
  family: FamilyChild[];
  events: ItineraryEvent[];
  identity: BookletCacheIdentity;
};

export function normalizeDestination(value: unknown) {
  if (typeof value !== "string") throw new Error("Enter a destination.");
  const destination = value.replace(/\s+/g, " ").trim();
  if (destination.length < 2 || destination.length > 70) {
    throw new Error("Enter a destination between 2 and 70 characters.");
  }
  if (!/^[\p{L}\p{M}\d .,'’()&/-]+$/u.test(destination)) {
    throw new Error("Use a city, region, or country name only.");
  }
  return destination;
}

export function normalizePdfRequest(
  body: Record<string, unknown>,
  researchModel: string,
  composerModel: string,
): NormalizedPdfRequest {
  const destination = normalizeDestination(body.destination);
  const age = requireInteger(body.age, 3, 14, "Age");
  const days = requireInteger(body.days, 1, 14, "Trip length");
  const itinerary = normalizeItinerary(body.itinerary, days);
  const family = normalizeFamilyChildren(body.family);
  const events = normalizeItineraryEvents(body.events, days);
  const familyContext = familyPromptSummary(family);
  return {
    destination,
    age,
    days,
    itinerary,
    family,
    events,
    identity: {
      destination,
      age,
      days,
      itinerary,
      researchModel,
      composerModel,
      familyContext,
      familySize: family.length,
    },
  };
}

