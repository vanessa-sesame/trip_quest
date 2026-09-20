import type { DayPlan } from "./booklet.ts";
import type { BookletObjectStorage } from "./booklet-storage.ts";
import { curatedColoringImagePath } from "./coloring.ts";

const ILLUSTRATION_VERSION = "v1";
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
    `The exact subject is ${activity.title}, at ${day.theme}, in ${destination}.`,
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
  });
  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(`Image generation failed (${response.status}): ${message.slice(0, 240)}`);
  }
  const body = await response.json() as { data?: Array<{ b64_json?: string }> };
  const image = body.data?.[0]?.b64_json;
  if (!image) throw new Error("Image generation returned no PNG.");
  return bytesFromBase64(image);
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
  let generatedCount = 0;

  const dayPlans: DayPlan[] = [];
  for (const day of input.dayPlans) {
    const activities = [];
    for (const activity of day.activities) {
      if (activity.gameType !== "coloring" && activity.gameType !== "drawing") {
        activities.push(activity);
        continue;
      }
      const context = `${input.destination} | ${day.theme} | ${activity.title}`;
      const curated = curatedColoringImagePath(activity, context);
      if (curated && /\/(?:merlion|supertree|eiffel-tower)-coloring-v1\.png$/.test(curated)) {
        activities.push(activity);
        continue;
      }
      const identity = JSON.stringify({
        version: ILLUSTRATION_VERSION,
        destination: input.destination.toLocaleLowerCase(),
        ageBand: input.age <= 5 ? "preschool" : input.age <= 8 ? "early-reader" : "older-child",
        day: day.theme,
        title: activity.title,
        items: activity.items,
      });
      const hash = await digest(identity);
      const key = `illustrations/${ILLUSTRATION_VERSION}/${hash}/artwork.png`;
      let stored = await storage.get(key);
      if (!stored) {
        if (generatedCount >= 3) {
          activities.push(activity);
          continue;
        }
        publish?.(`Illustrating ${activity.title}…`);
        try {
          const png = await generatePng(apiKey, model, printableArtPrompt(input.destination, day, activity, input.age));
          await storage.put(key, png, {
            httpMetadata: { cacheControl: "public, max-age=31536000, immutable", contentType: "image/png" },
            customMetadata: { destination: input.destination, title: activity.title, model },
          });
          generatedCount += 1;
          stored = await storage.get(key);
        } catch (error) {
          console.error(`[TripQuest illustration] ${activity.title}`, error);
        }
      }
      activities.push(stored
        ? { ...activity, illustrationPath: `/api/illustration?key=${encodeURIComponent(key)}` }
        : activity);
    }
    dayPlans.push({ ...day, activities });
  }
  return dayPlans;
}

export function illustrationStorageKey(path: string) {
  try {
    const url = new URL(path, "https://tripquest.invalid");
    if (url.pathname !== "/api/illustration") return null;
    const key = url.searchParams.get("key") || "";
    return /^illustrations\/v1\/[a-f0-9]{64}\/artwork\.png$/i.test(key) ? key : null;
  } catch {
    return null;
  }
}
