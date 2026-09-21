import type { DayPlan } from "./booklet.ts";
import type { BookletObjectStorage } from "./booklet-storage.ts";
import { curatedColoringImagePath } from "./coloring.ts";

const ILLUSTRATION_VERSION = "v2";
const encoder = new TextEncoder();

export type IllustrationRuntime = {
  BOOKLET_FILES?: BookletObjectStorage;
  OPENAI_API_KEY?: string;
  OPENAI_IMAGE_MODEL?: string;
};

function bytesFromBase64(value: string) {
  const decoded = atob(value);
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) bytes[index] = decoded.charCodeAt(index);
  return bytes;
}

async function digest(value: string) {
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function printableArtPrompt(destination: string, day: DayPlan, activity: DayPlan["activities"][number], age: number) {
  const details = (activity.items || []).map((item) => `${item.label}: ${item.clue}`).join("; ");
  return [
    "Create a premium black-and-white printable children's travel-booklet illustration.",
    `The exact place is ${day.landmark?.place || day.theme}, in ${destination}. The page activity is ${activity.title}.`,
    `It is for a ${age}-year-old child.`,
    `Use these researched local details where visually accurate: ${details}.`,
    "The real landmark or local subject must be immediately recognizable and geographically accurate, not a generic substitute.",
    "Editorial coloring-book line art printed on pure white paper: confident dark teal-black outlines, varied line weight, elegant small details, and large closed white areas that can be colored.",
    "Absolutely no black or gray background, no dark sky, no gradient, no glow, no shadow, and no large filled areas.",
    "Portrait composition with one dominant landmark and only a few accurate contextual objects. No decorative frame.",
    "Do not include words, letters, numbers, logos, watermarks, captions, UI, bingo squares, or colored fills.",
  ].join(" ");
}

async function generatePng(apiKey: string, model: string, prompt: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);
  try {
    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        prompt,
        n: 1,
        size: "1024x1536",
        quality: "medium",
        background: "opaque",
        output_format: "png",
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const message = await response.text().catch(() => "");
      throw new Error(`Image generation failed (${response.status}): ${message.slice(0, 240)}`);
    }
    const body = await response.json() as { data?: Array<{ b64_json?: string }> };
    const image = body.data?.[0]?.b64_json;
    if (!image) throw new Error("Image generation returned no PNG.");
    return bytesFromBase64(image);
  } finally {
    clearTimeout(timeout);
  }
}

export async function addBookletIllustrations(
  runtime: IllustrationRuntime,
  input: { destination: string; age: number; dayPlans: DayPlan[] },
  publish?: (message: string) => void,
) {
  const storage = runtime.BOOKLET_FILES;
  const apiKey = runtime.OPENAI_API_KEY?.trim();
  if (!storage || !apiKey) return input.dayPlans;
  const model = runtime.OPENAI_IMAGE_MODEL?.trim() || "gpt-image-1-mini";
  const candidates: Array<{
    dayIndex: number;
    activityIndex: number;
    key: string;
    prompt: string;
    title: string;
  }> = [];

  for (let dayIndex = 0; dayIndex < input.dayPlans.length; dayIndex += 1) {
    const day = input.dayPlans[dayIndex];
    for (let activityIndex = 0; activityIndex < day.activities.length; activityIndex += 1) {
      const activity = day.activities[activityIndex];
      if (activity.gameType !== "coloring" && activity.gameType !== "drawing") {
        continue;
      }
      const context = `${input.destination} | ${day.theme} | ${activity.title}`;
      const curated = curatedColoringImagePath(activity, context);
      if (curated && /\/(?:merlion|supertree|eiffel-tower)-coloring-v1\.png$/.test(curated)) {
        continue;
      }
      const identity = JSON.stringify({
        version: ILLUSTRATION_VERSION,
        destination: input.destination.toLocaleLowerCase(),
        ageBand: input.age <= 5 ? "preschool" : input.age <= 8 ? "early-reader" : "older-child",
        day: day.theme,
        landmark: day.landmark?.place,
        title: activity.title,
        items: activity.items,
      });
      const hash = await digest(identity);
      const key = `illustrations/${ILLUSTRATION_VERSION}/${hash}/artwork.png`;
      candidates.push({
        dayIndex,
        activityIndex,
        key,
        title: activity.title,
        prompt: printableArtPrompt(input.destination, day, activity, input.age),
      });
    }
  }

  const availability = await Promise.all(candidates.map(async (candidate) => {
    try {
      return { candidate, available: Boolean(await storage.get(candidate.key)) };
    } catch (error) {
      console.error(`[TripQuest illustration cache] ${candidate.title}`, error);
      return { candidate, available: false };
    }
  }));
  const availableKeys = new Set(
    availability.filter((item) => item.available).map((item) => item.candidate.key),
  );
  const missing = availability.filter((item) => !item.available).slice(0, 3);
  if (missing.length) {
    publish?.(`Illustrating ${missing.length} custom page${missing.length === 1 ? "" : "s"}…`);
    await Promise.all(missing.map(async ({ candidate }) => {
      try {
        const png = await generatePng(apiKey, model, candidate.prompt);
        await storage.put(candidate.key, png, {
          httpMetadata: { cacheControl: "public, max-age=31536000, immutable", contentType: "image/png" },
          customMetadata: { destination: input.destination, title: candidate.title, model },
        });
        availableKeys.add(candidate.key);
      } catch (error) {
        console.error(`[TripQuest illustration] ${candidate.title}`, error);
      }
    }));
  }

  const keyByActivity = new Map(
    candidates
      .filter((candidate) => availableKeys.has(candidate.key))
      .map((candidate) => [`${candidate.dayIndex}:${candidate.activityIndex}`, candidate.key]),
  );
  return input.dayPlans.map((day, dayIndex): DayPlan => {
    const activities = day.activities.map((activity, activityIndex) => {
      const key = keyByActivity.get(`${dayIndex}:${activityIndex}`);
      return key
        ? { ...activity, illustrationPath: `/api/illustration?key=${encodeURIComponent(key)}` }
        : activity;
    });
    return {
      ...day,
      activities,
      slots: {
        ...day.slots,
        inThePlace: activities[0],
        sitDown: activities[1],
      },
    };
  });
}

export function illustrationStorageKey(path: string) {
  try {
    const url = new URL(path, "https://tripquest.invalid");
    if (url.pathname !== "/api/illustration") return null;
    const key = url.searchParams.get("key") || "";
    return /^illustrations\/v(?:1|2)\/[a-f0-9]{64}\/artwork\.png$/i.test(key) ? key : null;
  } catch {
    return null;
  }
}
