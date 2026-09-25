export type CachedValue<T> = {
  expiresAt: number;
  value: T;
};

export function getCached<T>(cache: Map<string, CachedValue<T>>, key: string) {
  const cached = cache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  cache.delete(key);
  cache.set(key, cached);
  return cached.value;
}

export function setCached<T>(
  cache: Map<string, CachedValue<T>>,
  key: string,
  value: CachedValue<T>,
  maximumEntries: number,
) {
  const now = Date.now();
  for (const [storedKey, storedValue] of cache) {
    if (storedValue.expiresAt <= now) cache.delete(storedKey);
  }
  cache.delete(key);
  while (cache.size >= maximumEntries) {
    const oldestKey = cache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    cache.delete(oldestKey);
  }
  cache.set(key, value);
}
