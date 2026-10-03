import assert from "node:assert/strict";
import { claudeKind, claudeResponse } from "./helpers/claude.ts";
import test from "node:test";
import {
  addRevealPhotos,
  captionNamesPlace,
  distinctivePlaceWords,
  findLandmarkPhoto,
  landmarkPhotoQueries,
  photoCredit,
  previewImageUrl,
  usableCandidate,
  type PhotoCandidate,
} from "../app/lib/generation/landmark-photo.ts";
import type { DayPlan } from "../app/lib/booklet/booklet.ts";

function candidate(overrides: Partial<PhotoCandidate>): PhotoCandidate {
  return {
    id: 1,
    title: "Sagrada Familia, Turtle",
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/a/ae/Sagrada_Familia%2C_Turtle.jpg",
    pageUrl: "https://commons.wikimedia.org/wiki/File:Sagrada_Familia,_Turtle.jpg",
    width: 1237,
    height: 1803,
    license: "CC BY-SA 3.0",
    artist: "Stanislav Kozlovskiy",
    description: "Nativity Façade of Sagrada Familia, Barcelona, Spain",
    categories: "Sculptures of a Turtle in the Nativity Facade of the Sagrada Família",
    ...overrides,
  };
}

function commonsPage(item: PhotoCandidate, index: number) {
  return {
    pageid: item.id,
    index,
    title: `File:${item.title}.jpg`,
    imageinfo: [{
      mime: "image/jpeg",
      thumburl: item.imageUrl,
      descriptionurl: item.pageUrl,
      width: item.width,
      height: item.height,
      extmetadata: {
        LicenseShortName: { value: item.license },
        Artist: { value: `<a href="#">${item.artist}</a>` },
        ImageDescription: { value: item.description },
        Categories: { value: item.categories.split(", ").join("|") },
      },
    }],
  };
}

const turtle = candidate({ id: 11 });
const graffiti = candidate({ id: 12, title: "Nano bevent refresc graffiti", description: "Graffiti", categories: "Graffiti in Barcelona" });
const facade = candidate({ id: 13, title: "Sagrada Familia - Fachada de la Natividad - 016", description: "Fachada de la Natividad", categories: "Nativity Facade of the Sagrada Família" });
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);

// Fakes Commons, image downloads and both Kimi steps: the caption
// shortlist, and the visual check (`looksRight` decides each photo, by the
// order the photos are looked at).
function mockFetch(shortlist: Record<string, unknown>, results: PhotoCandidate[] = [graffiti, turtle, facade], looksRight: boolean[] = [true, true, true]) {
  const calls: string[] = [];
  let looks = 0;
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    calls.push(url);
    if (url.startsWith("https://commons.wikimedia.org/")) {
      return Response.json({ query: { pages: Object.fromEntries(results.map((item, index) => [String(item.id), commonsPage(item, index)])) } });
    }
    if (url.startsWith("https://api.anthropic.com/")) {
      const isShortlist = claudeKind(init) === "tripquest_photo_shortlist";
      return claudeResponse(isShortlist ? shortlist : { shows: looksRight[looks++] ?? false, seen: "a photo" });
    }
    return new Response(jpeg, { status: 200 });
  }) as typeof fetch;
  return { fetchImpl, calls, looked: () => looks };
}

async function withGlobalFetch<T>(fetchImpl: typeof fetch, run: () => Promise<T>) {
  const original = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
}

const subject = { targetLabel: "STONE TURTLE", place: "Basílica de la Sagrada Família", short: "the Sagrada Familia", destination: "Barcelona" };

test("only freely licensed photographs are usable", () => {
  assert.equal(usableCandidate(turtle), true);
  assert.equal(usableCandidate(candidate({ license: "Public domain" })), true);
  assert.equal(usableCandidate(candidate({ license: "CC0" })), true);
  assert.equal(usableCandidate(candidate({ license: "CC BY-NC-SA 2.0" })), false);
  assert.equal(usableCandidate(candidate({ license: "CC BY-ND 4.0" })), false);
  assert.equal(usableCandidate(candidate({ license: "Fair use" })), false);
  assert.equal(usableCandidate(candidate({ title: "Map of the Sagrada Familia" })), false);
  assert.equal(usableCandidate(candidate({ width: 400 })), false);
  assert.equal(usableCandidate(candidate({ imageUrl: "https://example.com/turtle.jpg" })), false);
  assert.equal(usableCandidate(candidate({ title: "Dürer-rhino", categories: "Dürer's Rhinoceros, PD-Art (PD-old-auto-expired), Artworks with known accession number" })), false);
  assert.equal(usableCandidate(candidate({ title: "Belem tower rhino", categories: "Woodcuts by Albrecht Dürer" })), false);
});

test("searches start specific and use the place's everyday name", () => {
  assert.deepEqual(landmarkPhotoQueries("STONE TURTLE", "Basílica de la Sagrada Família", "the Sagrada Familia"), [
    "turtle Sagrada Familia",
    "stone turtle Sagrada Familia",
    "turtle Basílica de la Sagrada Família",
    "Sagrada Familia",
    "Basílica de la Sagrada Família",
  ]);
  assert.deepEqual(distinctivePlaceWords(["Park Güell (Parc Güell)", "Park Güell"], "Barcelona"), ["guell"]);
  assert.equal(captionNamesPlace(graffiti, ["sagrada", "familia"]), false);
  assert.equal(captionNamesPlace(turtle, ["sagrada", "familia"]), true);
});

test("a photo that names the target and the place is used as the target photo", async () => {
  const { fetchImpl } = mockFetch({ targetPick: 11, targetEvidence: "Turtle", placePicks: [13] });
  const found = await withGlobalFetch(fetchImpl, () => findLandmarkPhoto(subject, { apiKey: "key", model: "claude-sonnet-5-5", fetchImpl }));
  assert.equal(found?.match, "target");
  assert.equal(found?.candidate.id, 11);
  assert.equal(photoCredit(found!.candidate), "Photo: Stanislav Kozlovskiy / CC BY-SA 3.0 / Wikimedia Commons");
});

test("a target pick without its words in the caption falls back to the place photo", async () => {
  const { fetchImpl } = mockFetch({ targetPick: 13, targetEvidence: "tortoise", placePicks: [13] });
  const found = await withGlobalFetch(fetchImpl, () => findLandmarkPhoto(subject, { apiKey: "key", model: "claude-sonnet-5-5", fetchImpl }));
  assert.equal(found?.match, "place");
  assert.equal(found?.candidate.id, 13);
});

test("a photo that does not look right is skipped for the next one on the shortlist", async () => {
  // The caption says turtle, but the picture shows something else: the
  // place photo that does look right is used instead.
  const { fetchImpl, looked } = mockFetch({ targetPick: 11, targetEvidence: "Turtle", placePicks: [13] }, [turtle, facade], [false, true]);
  const found = await withGlobalFetch(fetchImpl, () => findLandmarkPhoto(subject, { apiKey: "key", model: "claude-sonnet-5-5", fetchImpl }));
  assert.equal(found?.match, "place");
  assert.equal(found?.candidate.id, 13);
  assert.equal(looked(), 2);
});

test("no photo is used when none looks right", async () => {
  const { fetchImpl } = mockFetch({ targetPick: 11, targetEvidence: "Turtle", placePicks: [13] }, [turtle, facade], [false, false]);
  const found = await withGlobalFetch(fetchImpl, () => findLandmarkPhoto(subject, { apiKey: "key", model: "claude-sonnet-5-5", fetchImpl }));
  assert.equal(found, null);
});

test("the visual check looks at a small rendition", () => {
  assert.equal(
    previewImageUrl("https://thumb.wikimedia.org/wikipedia/commons/thumb/8/8d/Sagrada_Familia_Barcelona_2.jpg/1280px-Sagrada_Familia_Barcelona_2.jpg?utm_source=x"),
    "https://thumb.wikimedia.org/wikipedia/commons/thumb/8/8d/Sagrada_Familia_Barcelona_2.jpg/500px-Sagrada_Familia_Barcelona_2.jpg?utm_source=x",
  );
  assert.equal(previewImageUrl(turtle.imageUrl), turtle.imageUrl);
});

test("photos whose caption never names the place are never picked", async () => {
  const { fetchImpl } = mockFetch({ targetPick: 12, targetEvidence: "graffiti", placePicks: [12] }, [graffiti]);
  const found = await withGlobalFetch(fetchImpl, () => findLandmarkPhoto(subject, { apiKey: "key", model: "claude-sonnet-5-5", fetchImpl }));
  assert.equal(found, null);
});

test("reveal photos are stored with their credit and reused from the cache", async () => {
  const objects = new Map<string, { customMetadata?: Record<string, string> }>();
  const storage = {
    async get(key: string) {
      const object = objects.get(key);
      return object ? { ...object, async text() { return ""; } } : null;
    },
    async put(key: string, _value: unknown, options?: { customMetadata?: Record<string, string> }) {
      objects.set(key, { customMetadata: options?.customMetadata });
    },
  };
  const day = {
    day: 1,
    landmark: { display: "Sagrada Familia", short: "the Sagrada Familia", place: "Basílica de la Sagrada Família" },
    slots: { questReveal: { targetLabel: "STONE TURTLE", revealText: "Here it is!", chatPrompts: ["Why?", "How?"] } },
  } as unknown as DayPlan;
  const runtime = { BOOKLET_FILES: storage as never, ANTHROPIC_API_KEY: "key", CLAUDE_MODEL: "claude-sonnet-5-5" };

  const first = mockFetch({ targetPick: 11, targetEvidence: "Turtle", placePicks: [] });
  const [withPhoto] = await withGlobalFetch(first.fetchImpl, () => addRevealPhotos(runtime, { destination: "Barcelona", dayPlans: [day] }, undefined, first.fetchImpl));
  assert.match(withPhoto.slots.questReveal?.photoPath ?? "", /^\/api\/illustration\?key=illustrations%2Fv2%2F[a-f0-9]{64}%2Fartwork\.png$/);
  assert.equal(withPhoto.slots.questReveal?.photoCredit, "Photo: Stanislav Kozlovskiy / CC BY-SA 3.0 / Wikimedia Commons");

  const second = mockFetch({ targetPick: 0, targetEvidence: "", placePicks: [] });
  const [cached] = await withGlobalFetch(second.fetchImpl, () => addRevealPhotos(runtime, { destination: "Barcelona", dayPlans: [day] }, undefined, second.fetchImpl));
  assert.equal(cached.slots.questReveal?.photoCredit, withPhoto.slots.questReveal?.photoCredit);
  assert.equal(second.calls.length, 0, "a cached photo needs no search");
});
