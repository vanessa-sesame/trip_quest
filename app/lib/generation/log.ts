export function logGenerationTiming(cacheKey: string, stage: string, startedAt: number) {
  console.info(`[TripQuest timing] ${stage} ${Date.now() - startedAt}ms ${cacheKey.slice(0, 10)}`);
}

export function logStorageFailure(operation: string, error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected storage error";
  console.warn(`[TripQuest storage: ${operation}]`, message);
}
