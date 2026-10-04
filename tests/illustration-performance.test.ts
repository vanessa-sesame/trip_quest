import assert from "node:assert/strict";
import test from "node:test";
import { addBookletIllustrations } from "../app/lib/generation/illustration-ai.ts";
import { canGenerateImageExtras, maxAiPageImages } from "../app/lib/generation/cost-controls.ts";
import { buildBooklet, type Activity } from "../app/lib/booklet/booklet.ts";

test("balanced cost mode keeps one generated page image and skips expensive extras", () => {
  assert.equal(maxAiPageImages({ TRIPQUEST_COST_MODE: "balanced" }, 3), 1);
  assert.equal(canGenerateImageExtras({ TRIPQUEST_COST_MODE: "balanced" }), false);
  assert.equal(canGenerateImageExtras({ TRIPQUEST_COST_MODE: "full" }), true);
});

test("uncached custom illustrations are generated concurrently and capped at three", async () => {
  const dayPlans = buildBooklet(7, "Reykjavik", 2).map((day, dayIndex) => {
    const activities = day.activities.map((activity, activityIndex): Activity => ({
      ...activity,
      title: `Iceland sketch ${dayIndex + 1}-${activityIndex + 1}`,
      gameType: activityIndex === 0 ? "drawing" : "coloring",
    }));
    return {
      ...day,
      theme: `Iceland landscape ${dayIndex + 1}`,
      landmark: {
        display: `Iceland landscape ${dayIndex + 1}`,
        short: "the landscape",
        place: `Iceland landmark ${dayIndex + 1}`,
      },
      activities,
      slots: { ...day.slots, inThePlace: activities[0], sitDown: activities[1] },
    };
  });
  let active = 0;
  let maximumActive = 0;
  let generated = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    generated += 1;
    await new Promise((resolve) => setTimeout(resolve, 15));
    active -= 1;
    return Response.json({ data: [{ b64_json: btoa("png") }] });
  };

  try {
    const result = await addBookletIllustrations({
      OPENAI_API_KEY: "test-key",
      BOOKLET_FILES: {
        async get() {
          return null;
        },
        async put() {
          return undefined;
        },
        async delete() {
          return undefined;
        },
      },
    }, { destination: "Reykjavik", age: 7, dayPlans });

    assert.equal(generated, 3);
    assert.equal(maximumActive, 3);
    assert.equal(result.flatMap((day) => day.activities).filter((activity) => activity.illustrationPath).length, 3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("custom illustration cap can be lowered by environment", async () => {
  const dayPlans = buildBooklet(7, "Reykjavik", 2).map((day, dayIndex) => {
    const activities = day.activities.map((activity, activityIndex): Activity => ({
      ...activity,
      title: `Iceland sketch ${dayIndex + 1}-${activityIndex + 1}`,
      gameType: activityIndex === 0 ? "drawing" : "coloring",
    }));
    return {
      ...day,
      theme: `Iceland landscape ${dayIndex + 1}`,
      landmark: {
        display: `Iceland landscape ${dayIndex + 1}`,
        short: "the landscape",
        place: `Iceland landmark ${dayIndex + 1}`,
      },
      activities,
      slots: { ...day.slots, inThePlace: activities[0], sitDown: activities[1] },
    };
  });
  let generated = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    generated += 1;
    return Response.json({ data: [{ b64_json: btoa("png") }] });
  };

  try {
    const result = await addBookletIllustrations({
      OPENAI_API_KEY: "test-key",
      TRIPQUEST_MAX_AI_PAGE_IMAGES: "1",
      BOOKLET_FILES: {
        async get() {
          return null;
        },
        async put() {
          return undefined;
        },
        async delete() {
          return undefined;
        },
      },
    }, { destination: "Reykjavik", age: 7, dayPlans });

    assert.equal(generated, 1);
    assert.equal(result.flatMap((day) => day.activities).filter((activity) => activity.illustrationPath).length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("lean cost mode attaches cached page art but does not generate missing art", async () => {
  const dayPlans = buildBooklet(7, "Reykjavik", 1).map((day) => {
    const activities = day.activities.map((activity, activityIndex): Activity => ({
      ...activity,
      title: `Cached sketch ${activityIndex + 1}`,
      gameType: activityIndex === 0 ? "drawing" : "coloring",
    }));
    return {
      ...day,
      landmark: {
        display: "Cached landmark",
        short: "the landmark",
        place: "Cached landmark",
      },
      activities,
      slots: { ...day.slots, inThePlace: activities[0], sitDown: activities[1] },
    };
  });
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = async (input) => {
    calls.push(String(input));
    return Response.json({ data: [{ b64_json: btoa("png") }] });
  };
  let first = true;

  try {
    const result = await addBookletIllustrations({
      TRIPQUEST_COST_MODE: "lean",
      OPENAI_API_KEY: "test-key",
      BOOKLET_FILES: {
        async get() {
          if (!first) return null;
          first = false;
          return { async text() { return ""; } };
        },
        async put() {
          throw new Error("lean mode must not write new page art");
        },
        async delete() {
          return undefined;
        },
      },
    }, { destination: "Reykjavik", age: 7, dayPlans });

    assert.equal(calls.length, 0);
    assert.equal(result.flatMap((day) => day.activities).filter((activity) => activity.illustrationPath).length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
