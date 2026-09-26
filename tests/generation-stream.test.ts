import assert from "node:assert/strict";
import test from "node:test";
import {
  GenerationStreamError,
  createGenerationStreamResponse,
  createGenerationTask,
  readGenerationResponse,
} from "../app/lib/generation/stream.ts";

test("generation progress streams before the completed result", async () => {
  const task = createGenerationTask("Starting…", async (publish) => {
    publish("Researching real places…");
    await new Promise((resolve) => setTimeout(resolve, 5));
    publish("Designing age-specific games…");
    return { destination: "Singapore", age: 7 };
  });
  const response = createGenerationStreamResponse(task, () => "Generation failed");
  const progress: string[] = [];

  const result = await readGenerationResponse(response, (message) => {
    progress.push(message);
  });

  assert.deepEqual(result, { destination: "Singapore", age: 7 });
  assert.equal(response.headers.get("content-type"), "text/event-stream; charset=utf-8");
  assert.match(response.headers.get("cache-control") || "", /no-transform/);
  assert.ok(progress.includes("Researching real places…"));
  assert.ok(progress.includes("Designing age-specific games…"));
});

test("generation streams can redact the completed result", async () => {
  const task = createGenerationTask("Starting…", async () => ({
    preview: "safe",
    privateAnswer: "do not send",
  }));
  const response = createGenerationStreamResponse(
    task,
    () => "Generation failed",
    (result) => ({ preview: result.preview }),
  );

  const result = await readGenerationResponse(response, () => undefined);
  assert.deepEqual(result, { preview: "safe" });
});

test("a streamed generation error is not treated as a connection failure", async () => {
  const task = createGenerationTask("Starting…", async () => {
    throw new Error("upstream detail");
  });
  const response = createGenerationStreamResponse(
    task,
    () => "Please check the daily plan.",
  );

  await assert.rejects(
    () => readGenerationResponse(response, () => undefined),
    (error: unknown) => {
      assert.ok(error instanceof GenerationStreamError);
      assert.equal(error.message, "Please check the daily plan.");
      assert.equal(error.retryable, false);
      return true;
    },
  );
});

test("an interrupted event stream is retryable", async () => {
  const response = new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            'event: progress\ndata: {"message":"Researching…"}\n\n',
          ),
        );
        controller.close();
      },
    }),
    { headers: { "Content-Type": "text/event-stream" } },
  );

  await assert.rejects(
    () => readGenerationResponse(response, () => undefined),
    (error: unknown) => {
      assert.ok(error instanceof GenerationStreamError);
      assert.equal(error.retryable, true);
      return true;
    },
  );
});

test("cached JSON responses remain compatible with the stream reader", async () => {
  const response = Response.json({ destination: "Tokyo", age: 5 });
  const result = await readGenerationResponse(response, () => undefined);
  assert.deepEqual(result, { destination: "Tokyo", age: 5 });
});

test("finished days reach the client, and a client that rejoins gets them at once", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const task = createGenerationTask("Starting…", async (publish) => {
    publish("Day 1 of 2 is ready", { profile: { style: "Test" }, dayPlans: [{ day: 1 }] });
    publish("Still designing…");
    await gate;
    return { done: true };
  });
  await Promise.resolve();
  await Promise.resolve();
  // A client that subscribes after the day was published still gets it.
  assert.deepEqual(task.getProgress().partial?.dayPlans, [{ day: 1 }]);

  const seen: Array<{ message: string; days?: number }> = [];
  const response = createGenerationStreamResponse(task, () => "failed");
  const reading = readGenerationResponse(response, (message, partial) => seen.push({ message, days: partial?.dayPlans.length }));
  release();
  assert.deepEqual(await reading, { done: true });
  assert.ok(seen.some((entry) => entry.days === 1), "the rejoining client received the finished day");
});
