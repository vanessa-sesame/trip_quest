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
