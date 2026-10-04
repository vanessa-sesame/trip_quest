import type { DayPlan } from "../booklet/booklet.ts";
import type { BookletObjectStorage } from "../storage/booklet-storage.ts";
import { curatedColoringImagePath } from "../booklet/coloring.ts";
import { canGenerateImages, canReadCachedImages, maxAiPageImages, type CostRuntime } from "./cost-controls.ts";
import { DEFAULT_CLAUDE_MODEL, askAboutImage } from "./claude.ts";

const ILLUSTRATION_VERSION = "v2";
const encoder = new TextEncoder();

export type IllustrationRuntime = CostRuntime & {
  BOOKLET_FILES?: BookletObjectStorage;
  OPENAI_API_KEY?: string;
  OPENAI_IMAGE_MODEL?: string;
  // Which style addCoverIllustration asks for. Unset/unrecognized falls back
  // to "line-art" — kept switchable by env var (rather than a hardcoded
  // choice) so both styles can be generated and compared before picking one
  // for good.
  OPENAI_COVER_STYLE?: string;
  // Cloudflare Workers AI credentials for the free image-generation path
  // (see resolveImageProvider below). This project's hosting platform only
  // provisions D1/R2 as Worker *bindings*, not Workers AI, so this goes
  // through Cloudflare's plain REST API instead — a Cloudflare account and
  // an API token with Workers AI Read+Edit, not a binding.
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_API_TOKEN?: string;
  CLOUDFLARE_AI_IMAGE_MODEL?: string;
  // Forces a provider instead of the default auto-detect (Cloudflare first
  // when configured, since it's free, else OpenAI). Set to "openai" or
  // "cloudflare"; any other value is ignored.
  IMAGE_PROVIDER?: string;
  // Claude, which looks at each new cover and rejects ones with lettering.
  ANTHROPIC_API_KEY?: string;
  CLAUDE_MODEL?: string;
};

export type CoverArtStyle = "line-art" | "photo";

function bytesFromBase64(value: string) {
  const decoded = atob(value);
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) bytes[index] = decoded.charCodeAt(index);
  return bytes;
}

// Both providers can return either format (OpenAI's output_format is forced
// to png below, but Cloudflare's flux-1-schnell returns JPEG bytes despite
// the shared "artwork.png" R2 key name, which is just a storage convention,
// not a format guarantee) — sniff the real format from magic bytes rather
// than trusting the source, so storage metadata and PDF embedding
// (app/lib/pdf/booklet-pdf.ts) always match what's actually there.
export function sniffImageContentType(bytes: Uint8Array): "image/png" | "image/jpeg" {
  return bytes[0] === 0xff && bytes[1] === 0xd8 ? "image/jpeg" : "image/png";
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

// The cover's hero illustration, in one of two candidate styles (see
// CoverArtStyle) so a real generated example of each can be compared before
// committing to one — see addCoverIllustration below. "line-art" matches the
// same editorial coloring-book language as the activity-page illustrations
// (printableArtPrompt) so it sits comfortably with the hand-drawn cover
// typography and mascot it would replace; "photo" instead matches the
// reveal page's warm travel-photography style.
function printableCoverArtPrompt(destination: string, style: CoverArtStyle) {
  // Naming the place invites the model to write it into the picture, so the
  // no-writing rule comes first and is repeated last.
  const wordless = "A wordless picture: there is no writing of any kind anywhere in it, no letters, no title, no captions, no signs.";
  if (style === "photo") {
    return [
      wordless,
      "A warm, beautiful travel photograph for the cover of a children's travel activity booklet.",
      `It shows one iconic, immediately recognizable landmark or scene of ${destination}, geographically accurate, not a generic substitute.`,
      "Bright natural daylight, inviting and joyful, shot like a beloved family travel photo, not a stock-photo cliche.",
      "No identifiable faces, no watermark, no logo, no decorative frame or border, no UI.",
      "Landscape composition with generous open sky or open ground.",
      "Remember: absolutely no text or lettering.",
    ].join(" ");
  }
  return [
    wordless,
    "A premium editorial children's-book illustration for the cover of a printable travel activity booklet.",
    `It shows one beautiful, immediately recognizable landmark or scene of ${destination}, geographically accurate, not a generic substitute, large enough to fill most of the picture.`,
    "Hand-drawn editorial line-art style: confident ink outlines, a few flat contemporary colour accents (terracotta, teal, warm yellow, muted green), warm cream paper background, like a beautifully illustrated explorer's field journal, not a cartoon and not photorealistic.",
    "No large saturated ink fills, no dark background, no gradient, no glow, no shadow.",
    "Landscape composition. No decorative frame, no logos, no watermark.",
    "Remember: absolutely no text or lettering.",
  ].join(" ");
}

// Exported for scripts/generate-coloring-library.ts, which reuses this
// same call to batch-generate curated scene art offline.
export async function generatePng(apiKey: string, model: string, prompt: string, size: "1024x1536" | "1536x1024" | "1024x1024" = "1024x1536") {
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
        size,
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

// Cloudflare Workers AI's plain REST API (not a Worker binding — see
// IllustrationRuntime above for why). flux-1-schnell has no width/height
// input (fixed square output), unlike OpenAI's generatePng, so there is no
// size parameter here; callers that need a specific aspect ratio rely on
// the PDF's existing contain-fit image placement instead.
async function generatePngCloudflare(accountId: string, apiToken: string, model: string, prompt: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);
  try {
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt, steps: 8 }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const message = await response.text().catch(() => "");
      throw new Error(`Cloudflare image generation failed (${response.status}): ${message.slice(0, 240)}`);
    }
    const body = await response.json() as {
      result?: { image?: string };
      image?: string;
      errors?: Array<{ message?: string }>;
    };
    const image = body.result?.image || body.image;
    if (!image) {
      const detail = body.errors?.[0]?.message;
      throw new Error(`Cloudflare image generation returned no image.${detail ? ` ${detail}` : ""}`);
    }
    return bytesFromBase64(image);
  } finally {
    clearTimeout(timeout);
  }
}

export type ImageProvider =
  | { kind: "cloudflare"; accountId: string; apiToken: string; model: string }
  | { kind: "openai"; apiKey: string; model: string };

// Picks which image provider to use, or null when neither is configured
// (every caller below already degrades gracefully to "no illustration" in
// that case). Cloudflare wins when both are configured and IMAGE_PROVIDER
// does not force a choice, since it is the free option — flip
// IMAGE_PROVIDER=openai to prefer the paid one instead (e.g. for quality
// comparison) without unsetting credentials.
export function resolveImageProvider(runtime: IllustrationRuntime): ImageProvider | null {
  const forced = runtime.IMAGE_PROVIDER?.trim().toLowerCase();
  const cloudflare = (): ImageProvider | null => {
    const accountId = runtime.CLOUDFLARE_ACCOUNT_ID?.trim();
    const apiToken = runtime.CLOUDFLARE_API_TOKEN?.trim();
    if (!accountId || !apiToken) return null;
    return {
      kind: "cloudflare",
      accountId,
      apiToken,
      model: runtime.CLOUDFLARE_AI_IMAGE_MODEL?.trim() || "@cf/black-forest-labs/flux-1-schnell",
    };
  };
  const openai = (): ImageProvider | null => {
    const apiKey = runtime.OPENAI_API_KEY?.trim();
    if (!apiKey) return null;
    return { kind: "openai", apiKey, model: runtime.OPENAI_IMAGE_MODEL?.trim() || "gpt-image-1-mini" };
  };
  if (forced === "openai") return openai() || cloudflare();
  if (forced === "cloudflare") return cloudflare() || openai();
  return cloudflare() || openai();
}

export async function generateIllustrationPng(provider: ImageProvider, prompt: string, size: "1024x1536" | "1536x1024" | "1024x1024" = "1024x1536") {
  if (provider.kind === "cloudflare") return generatePngCloudflare(provider.accountId, provider.apiToken, provider.model, prompt);
  return generatePng(provider.apiKey, provider.model, prompt, size);
}

export async function addBookletIllustrations(
  runtime: IllustrationRuntime,
  input: { destination: string; age: number; dayPlans: DayPlan[] },
  publish?: (message: string) => void,
) {
  const storage = runtime.BOOKLET_FILES;
  const provider = resolveImageProvider(runtime);
  if (!storage || !canReadCachedImages(runtime)) return input.dayPlans;
  const canGenerate = canGenerateImages(runtime);
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
  const missing = canGenerate
    ? availability.filter((item) => !item.available).slice(0, maxAiPageImages(runtime, 3))
    : [];
  if (missing.length) {
    publish?.(`Illustrating ${missing.length} custom page${missing.length === 1 ? "" : "s"}…`);
    await Promise.all(missing.map(async ({ candidate }) => {
      try {
        const png = await generateIllustrationPng(provider, candidate.prompt);
        await storage.put(candidate.key, png, {
          httpMetadata: { cacheControl: "public, max-age=31536000, immutable", contentType: sniffImageContentType(png) },
          customMetadata: { destination: input.destination, title: candidate.title, model: provider.model },
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

// Generates one hero illustration for the cover page, cached per
// destination+style (not per-booklet, so every booklet for the same
// destination reuses it — unlike the per-activity art, a cover does not
// depend on the day's researched content). Deliberately separate from
// addBookletIllustrations/addRevealPhoto: it does not share or count
// against addBookletIllustrations' up-to-3-image cap, so this always costs
// at most one extra image generation call per NEW destination+style pair,
// not per booklet.
export async function addCoverIllustration(
  runtime: IllustrationRuntime,
  input: { destination: string },
  publish?: (message: string) => void,
): Promise<string | undefined> {
  const storage = runtime.BOOKLET_FILES;
  const provider = resolveImageProvider(runtime);
  if (!storage || !canReadCachedImages(runtime)) return undefined;
  const style: CoverArtStyle = runtime.OPENAI_COVER_STYLE?.trim() === "photo" ? "photo" : "line-art";

  const identity = JSON.stringify({
    version: ILLUSTRATION_VERSION,
    kind: "cover-art",
    style,
    destination: input.destination.toLocaleLowerCase(),
    // Covers made before the lettering and flaw check could have the city's
    // name or hole-punch dots in the picture; this draws every one afresh.
    check: "clean-2",
  });
  const hash = await digest(identity);
  const key = `illustrations/${ILLUSTRATION_VERSION}/${hash}/artwork.png`;

  let available = false;
  try {
    available = Boolean(await storage.get(key));
  } catch (error) {
    console.error("[TripQuest illustration cache] cover art", error);
  }

  if (!available && provider && canGenerateImages(runtime)) {
    publish?.("Illustrating the cover…");
    try {
      const prompt = printableCoverArtPrompt(input.destination, style);
      // Image models often write the place's name into the picture despite
      // the prompt, so Claude looks at each attempt; up to three tries, then
      // the last attempt is used anyway (lettering beats no cover).
      let png = await generateIllustrationPng(provider, prompt, "1536x1024");
      for (let attempt = 1; attempt < 3 && await coverHasLettering(runtime, png); attempt += 1) {
        console.info(`[TripQuest illustration] cover art had lettering, redrawing (${attempt})`);
        png = await generateIllustrationPng(provider, prompt, "1536x1024");
      }
      await storage.put(key, png, {
        httpMetadata: { cacheControl: "public, max-age=31536000, immutable", contentType: sniffImageContentType(png) },
        customMetadata: { destination: input.destination, title: `Cover art (${style})`, model: provider.model },
      });
      available = true;
    } catch (error) {
      console.error("[TripQuest illustration] cover art", error);
    }
  }

  return available ? `/api/illustration?key=${encodeURIComponent(key)}` : undefined;
}

// True when Claude sees any writing in the picture. Without Claude, or when
// the check fails, the picture is accepted.
async function coverHasLettering(runtime: IllustrationRuntime, bytes: Uint8Array) {
  const apiKey = runtime.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return false;
  try {
    const verdict = await askAboutImage(
      { bytes, contentType: sniffImageContentType(bytes) },
      "Does this picture have any writing (letters, words, numbers, a title, a signature or a sign) or any printing flaw: hole-punch dots, stray black dots or blobs, a border or frame, or a torn or cropped paper edge? Answer hasText true if either is present.",
      {
        type: "object",
        additionalProperties: false,
        properties: { hasText: { type: "boolean" }, text: { type: "string" } },
        required: ["hasText", "text"],
      },
      { apiKey, model: runtime.CLAUDE_MODEL?.trim() || DEFAULT_CLAUDE_MODEL, timeoutMs: 30_000 },
    );
    return verdict.hasText === true;
  } catch (error) {
    console.error("[TripQuest illustration] cover lettering check", error instanceof Error ? error.message : error);
    return false;
  }
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
