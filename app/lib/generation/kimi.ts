import { KimiRequestError } from "./errors.ts";

export const KIMI_API_BASE = "https://api.moonshot.ai/v1";

const RETRYABLE_STATUS = new Set([429, 502, 503]);
const RETRY_DELAYS_MS = [1_500, 4_000];

// Days compose in parallel, so a burst can briefly hit Moonshot's rate
// limit; wait and retry those instead of failing the day.
export async function kimiRequest(
  path: string,
  apiKey: string,
  body: Record<string, unknown>,
  timeoutMs = 90_000,
) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await kimiRequestOnce(path, apiKey, body, timeoutMs);
    } catch (error) {
      const retryable = error instanceof KimiRequestError && RETRYABLE_STATUS.has(error.status);
      if (!retryable || attempt >= RETRY_DELAYS_MS.length) throw error;
      console.info(`[TripQuest kimi] ${error.status}, retrying in ${RETRY_DELAYS_MS[attempt]}ms`);
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
    }
  }
}

async function kimiRequestOnce(
  path: string,
  apiKey: string,
  body: Record<string, unknown>,
  timeoutMs: number,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${KIMI_API_BASE}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const payload = (await response.json()) as Record<string, unknown>;

    if (!response.ok) {
      const upstreamError = payload.error as { message?: string } | undefined;
      throw new KimiRequestError(
        upstreamError?.message || "Kimi could not complete the request.",
        response.status,
      );
    }

    if (payload.usage) {
      // Cost-tracking hook: a single choke point for every Kimi call
      // (research, composition, and the grounding check all go through
      // kimiRequest), logged raw since Moonshot's usage object shape isn't
      // pinned down anywhere else in this codebase.
      console.info(`[TripQuest usage] model=${body.model} path=${path}`, JSON.stringify(payload.usage));
    }

    return payload;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new KimiRequestError("Kimi timed out while preparing the booklet.", 504);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
