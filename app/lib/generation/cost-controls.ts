export type CostMode = "full" | "balanced" | "lean";
export type ImageBudget = "full" | "cached" | "none";

export type CostRuntime = {
  TRIPQUEST_COST_MODE?: string;
  TRIPQUEST_IMAGE_BUDGET?: string;
  TRIPQUEST_MAX_AI_PAGE_IMAGES?: string;
};

export function costModeFrom(runtime: CostRuntime): CostMode {
  const value = runtime.TRIPQUEST_COST_MODE?.trim().toLowerCase();
  return value === "lean" || value === "balanced" || value === "full" ? value : "full";
}

export function imageBudgetFrom(runtime: CostRuntime): ImageBudget {
  const forced = runtime.TRIPQUEST_IMAGE_BUDGET?.trim().toLowerCase();
  if (forced === "none" || forced === "cached" || forced === "full") return forced;
  return costModeFrom(runtime) === "lean" ? "cached" : "full";
}

export function canGenerateImages(runtime: CostRuntime) {
  return imageBudgetFrom(runtime) === "full";
}

export function canGenerateImageExtras(runtime: CostRuntime) {
  return canGenerateImages(runtime) && costModeFrom(runtime) === "full";
}

export function canReadCachedImages(runtime: CostRuntime) {
  return imageBudgetFrom(runtime) !== "none";
}

export function maxAiPageImages(runtime: CostRuntime, fallback: number) {
  if (!canGenerateImages(runtime)) return 0;
  const value = Number(runtime.TRIPQUEST_MAX_AI_PAGE_IMAGES);
  if (Number.isInteger(value) && value >= 0) return Math.min(value, 8);
  return costModeFrom(runtime) === "balanced" ? Math.min(1, fallback) : fallback;
}
