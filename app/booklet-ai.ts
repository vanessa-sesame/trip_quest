import type { DayPlan } from "./booklet";

export type BookletSource = {
  title: string;
  url: string;
};

export type GeneratedBookletProfile = {
  style: string;
  intro: string;
  word: string;
  etiquette: string;
};

export type BookletDraft = {
  profile: GeneratedBookletProfile;
  dayPlans: DayPlan[];
};

export type GeneratedBookletData = BookletDraft & {
  destination: string;
  age: number;
  days: number;
  sources: BookletSource[];
  generatedAt: string;
};

function requireText(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
) {
  if (typeof value !== "string") {
    throw new Error(`${label} must be text.`);
  }

  const text = value.trim();
  if (text.length < minimum) {
    throw new Error(`${label} has an unexpected length.`);
  }

  if (text.length <= maximum) {
    return text;
  }

  const candidate = text.slice(0, maximum - 1);
  const sentenceEnd = Math.max(
    candidate.lastIndexOf("."),
    candidate.lastIndexOf("!"),
    candidate.lastIndexOf("?"),
  );
  if (sentenceEnd >= Math.floor(maximum * 0.6)) {
    return candidate.slice(0, sentenceEnd + 1);
  }

  const wordEnd = candidate.lastIndexOf(" ");
  return `${candidate.slice(0, wordEnd > 0 ? wordEnd : candidate.length)}…`;
}

export function validateBookletDraft(
  value: unknown,
  expectedDays: number,
): BookletDraft {
  if (!value || typeof value !== "object") {
    throw new Error("The generated booklet is not an object.");
  }

  const draft = value as Record<string, unknown>;
  const profileValue = draft.profile;
  if (!profileValue || typeof profileValue !== "object") {
    throw new Error("The generated destination profile is missing.");
  }

  const profileRecord = profileValue as Record<string, unknown>;
  const profile: GeneratedBookletProfile = {
    style: requireText(profileRecord.style, "Profile style", 8, 90),
    intro: requireText(profileRecord.intro, "Profile introduction", 30, 420),
    word: requireText(profileRecord.word, "Local word", 2, 120),
    etiquette: requireText(profileRecord.etiquette, "Etiquette note", 20, 320),
  };

  if (!Array.isArray(draft.dayPlans) || draft.dayPlans.length !== expectedDays) {
    throw new Error(`The booklet must contain exactly ${expectedDays} day pages.`);
  }

  const usedTitles = new Set<string>();
  const dayPlans = draft.dayPlans.map((dayValue, dayIndex): DayPlan => {
    if (!dayValue || typeof dayValue !== "object") {
      throw new Error(`Day ${dayIndex + 1} is missing.`);
    }

    const day = dayValue as Record<string, unknown>;
    if (!Array.isArray(day.activities) || day.activities.length !== 2) {
      throw new Error(`Day ${dayIndex + 1} must contain exactly two activities.`);
    }

    const activities = day.activities.map((activityValue, activityIndex) => {
      if (!activityValue || typeof activityValue !== "object") {
        throw new Error(
          `Activity ${activityIndex + 1} on day ${dayIndex + 1} is missing.`,
        );
      }

      const activity = activityValue as Record<string, unknown>;
      const title = requireText(
        activity.title,
        `Activity title on day ${dayIndex + 1}`,
        3,
        70,
      );
      const normalizedTitle = title.toLocaleLowerCase();
      if (usedTitles.has(normalizedTitle)) {
        throw new Error(`The activity title “${title}” was repeated.`);
      }
      usedTitles.add(normalizedTitle);
      const rawBody = requireText(
        activity.body,
        `Activity instructions on day ${dayIndex + 1}`,
        15,
        700,
      );
      const body = rawBody
        .replace(/\s+(?:prompt|response line):[\s\S]*$/i, "")
        .trim();

      return {
        title,
        kind: requireText(
          activity.kind,
          `Activity type on day ${dayIndex + 1}`,
          2,
          32,
        ),
        body: requireText(
          body,
          `Activity instructions on day ${dayIndex + 1}`,
          15,
          360,
        ),
        prompt: requireText(
          activity.prompt,
          `Activity prompt on day ${dayIndex + 1}`,
          2,
          180,
        ),
      };
    });

    return {
      day: dayIndex + 1,
      theme: requireText(day.theme, `Day ${dayIndex + 1} theme`, 4, 80),
      focusLabel: requireText(
        day.focusLabel,
        `Day ${dayIndex + 1} focus`,
        3,
        55,
      ),
      mission: requireText(
        day.mission,
        `Day ${dayIndex + 1} mission`,
        20,
        360,
      ),
      activities,
    };
  });

  return { profile, dayPlans };
}

export function isGeneratedBookletData(
  value: unknown,
): value is GeneratedBookletData {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<GeneratedBookletData>;
  return (
    typeof candidate.destination === "string" &&
    typeof candidate.age === "number" &&
    typeof candidate.days === "number" &&
    typeof candidate.generatedAt === "string" &&
    Array.isArray(candidate.sources) &&
    Array.isArray(candidate.dayPlans) &&
    Boolean(candidate.profile)
  );
}
