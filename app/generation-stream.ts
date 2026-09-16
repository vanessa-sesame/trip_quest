export type GenerationProgress = {
  message: string;
};

export type GenerationTask<T> = {
  promise: Promise<T>;
  getProgress(): GenerationProgress;
  subscribe(listener: (progress: GenerationProgress) => void): () => void;
};

type StreamEvent = "progress" | "complete" | "error";

export class GenerationStreamError extends Error {
  readonly retryable: boolean;

  constructor(message: string, retryable: boolean) {
    super(message);
    this.name = "GenerationStreamError";
    this.retryable = retryable;
  }
}

export function createGenerationTask<T>(
  initialMessage: string,
  run: (publish: (message: string) => void) => Promise<T>,
): GenerationTask<T> {
  let progress = { message: initialMessage };
  const listeners = new Set<(nextProgress: GenerationProgress) => void>();
  const publish = (message: string) => {
    progress = { message };
    for (const listener of listeners) listener(progress);
  };
  const promise = Promise.resolve().then(() => run(publish));

  return {
    promise,
    getProgress: () => progress,
    subscribe(listener) {
      listeners.add(listener);
      listener(progress);
      return () => listeners.delete(listener);
    },
  };
}

function encodeEvent(event: StreamEvent, payload: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

export function createGenerationStreamResponse<T, TResult = T>(
  task: GenerationTask<T>,
  errorMessage: (error: unknown) => string,
  transformResult: (result: T) => TResult = (result) => result as unknown as TResult,
) {
  const encoder = new TextEncoder();
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let unsubscribe: (() => void) | undefined;
  let disconnected = false;

  const response = new Response(
    new ReadableStream({
      start(controller) {
        const send = (event: StreamEvent, payload: unknown) => {
          if (disconnected) return;
          try {
            controller.enqueue(encoder.encode(encodeEvent(event, payload)));
          } catch {
            disconnected = true;
          }
        };
        const sendPadding = () => {
          if (disconnected) return;
          try {
            // A full chunk prevents mobile and proxy buffering of tiny keep-alives.
            controller.enqueue(encoder.encode(`: ${" ".repeat(4096)}\n\n`));
          } catch {
            disconnected = true;
          }
        };
        const cleanUp = () => {
          if (heartbeat) clearInterval(heartbeat);
          unsubscribe?.();
        };

        unsubscribe = task.subscribe((progress) => send("progress", progress));
        sendPadding();
        heartbeat = setInterval(() => {
          send("progress", task.getProgress());
          sendPadding();
        }, 4_000);

        void task.promise
          .then((result) => send("complete", transformResult(result)))
          .catch((error) => send("error", { message: errorMessage(error) }))
          .finally(() => {
            cleanUp();
            if (!disconnected) controller.close();
          });
      },
      cancel() {
        disconnected = true;
        if (heartbeat) clearInterval(heartbeat);
        unsubscribe?.();
      },
    }),
    {
      headers: {
        "Cache-Control": "private, no-cache, no-store, no-transform",
        "Content-Encoding": "identity",
        "Content-Type": "text/event-stream; charset=utf-8",
        "X-Accel-Buffering": "no",
        "X-Content-Type-Options": "nosniff",
        "X-TripQuest-Cache": "miss-or-inflight",
      },
    },
  );

  return response;
}

function parseFrame(frame: string) {
  if (!frame || frame.startsWith(":")) return null;
  let event = "message";
  const data: string[] = [];

  for (const line of frame.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
  }

  if (!data.length) return null;
  return { event, data: data.join("\n") };
}

export async function readGenerationResponse(
  response: Response,
  onProgress: (message: string) => void,
): Promise<unknown> {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/event-stream")) {
    return response.json();
  }

  if (!response.body) {
    throw new GenerationStreamError("The live response could not be opened.", true);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done }).replace(/\r\n/g, "\n");

      let boundary = buffer.indexOf("\n\n");
      while (boundary >= 0) {
        const frame = parseFrame(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf("\n\n");
        if (!frame) continue;

        let payload: unknown;
        try {
          payload = JSON.parse(frame.data);
        } catch {
          continue;
        }

        if (frame.event === "progress") {
          const message = (payload as { message?: unknown })?.message;
          if (typeof message === "string") onProgress(message);
        } else if (frame.event === "complete") {
          return payload;
        } else if (frame.event === "error") {
          const message = (payload as { message?: unknown })?.message;
          throw new GenerationStreamError(
            typeof message === "string" ? message : "The booklet could not be generated.",
            false,
          );
        }
      }

      if (done) break;
    }
  } catch (error) {
    if (error instanceof GenerationStreamError) throw error;
    throw new GenerationStreamError(
      "The live connection ended while the booklet was being made.",
      true,
    );
  } finally {
    reader.releaseLock();
  }

  throw new GenerationStreamError(
    "The live connection ended before the booklet arrived.",
    true,
  );
}
