import { getRequestExecutionContext } from "vinext/shims/request-context";
import {
  type GeneratedBookletData,
  applySiblingPlan,
  balancedGameTypePlanForTrip,
  normalizeItinerary,
} from "../../lib/generation/booklet-ai";
import {
  type BookletCacheIdentity,
  type BookletDatabase,
  type BookletObjectStorage,
  acquireGenerationLock,
  consumeGenerationRateLimit,
  batchRangeForDay,
  createBookletCacheKey,
  bookletSnapshotFingerprint,
  deleteStoredBookletBatch,
  readStoredBooklet,
  releaseGenerationLock,
  writeStoredBooklet,
} from "../../lib/storage/booklet-storage";
import {
  HttpRequestError,
  assertSameOriginRequest,
  createClientRateLimitKey,
  readJsonObject,
  requireInteger,
} from "../../lib/request-security";
import { createBookletPreview } from "../../lib/booklet/preview";
import {
  familyEditionContext,
  familyPromptSummary,
  interestPlanForTrip,
  mechanicPlanForTrip,
  normalizeFamilyChildren,
  normalizeItineraryEvents,
} from "../../lib/family";
import {
  type GenerationTask,
  createGenerationStreamResponse,
  createGenerationTask,
} from "../../lib/generation/stream";
import { addBookletIllustrations, addCoverIllustration } from "../../lib/generation/illustration-ai";
import { addRevealPhotos } from "../../lib/generation/landmark-photo";
import { addSpotTheDifference, applyDifferencePaths } from "../../lib/generation/spot-difference";
import { assertBookletQa } from "../../lib/booklet/qa";
import { composeBooklet } from "../../lib/generation/compose";
import {
  GenerationBusyError,
  GenerationStageError,
  KimiRequestError,
  UserCorrectionError,
} from "../../lib/generation/errors";
import { logGenerationTiming, logStorageFailure } from "../../lib/generation/log";
import { type CachedValue, getCached, setCached } from "../../lib/generation/memory-cache";
import { assertResearchMatchesRequest, researchDestination } from "../../lib/generation/research";

export const dynamic = "force-dynamic";

type RuntimeEnvironment = {
  MOONSHOT_API_KEY?: string;
  KIMI_RESEARCH_MODEL?: string;
  KIMI_COMPOSER_MODEL?: string;
  OPENAI_API_KEY?: string;
  OPENAI_IMAGE_MODEL?: string;
  OPENAI_COVER_STYLE?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_API_TOKEN?: string;
  CLOUDFLARE_AI_IMAGE_MODEL?: string;
  CLOUDFLARE_AI_EDIT_MODEL?: string;
  IMAGE_PROVIDER?: string;
  DB?: BookletDatabase;
  BOOKLET_FILES?: BookletObjectStorage;
};

type EditionBooklet = GeneratedBookletData & { editionFingerprint: string };

async function withEditionFingerprint(booklet: GeneratedBookletData): Promise<EditionBooklet> {
  const editionFingerprint = await bookletSnapshotFingerprint(booklet);
  return { ...booklet, editionFingerprint };
}

const bookletCache = new Map<string, CachedValue<GeneratedBookletData>>();
const bookletJobs = new Map<string, GenerationTask<GeneratedBookletData>>();
const requestWindows = new Map<string, { count: number; resetAt: number }>();
const MEMORY_BOOKLET_TTL = 6 * 60 * 60 * 1000;
const DURABLE_BOOKLET_TTL = 180 * 24 * 60 * 60 * 1000;
const GENERATION_LOCK_TTL = 45 * 1000;
const GENERATION_LOCK_RENEWAL = 15 * 1000;
const GENERATION_WAIT_TTL = 3 * 60 * 1000;
const RATE_LIMIT_WINDOW = 60 * 60 * 1000;
const CLIENT_GENERATION_LIMIT = 8;
const GLOBAL_GENERATION_LIMIT = 120;
const MAX_ACTIVE_GENERATIONS = 4;

const MAX_MEMORY_BOOKLET_ENTRIES = 64;

type GenerationLockLease = {
  assertOwned(): void;
  stop(): Promise<void>;
};

async function getRuntimeEnvironment(): Promise<RuntimeEnvironment> {
  try {
    const workers = await import("cloudflare:workers");
    return workers.env as unknown as RuntimeEnvironment;
  } catch {
    return process.env as RuntimeEnvironment;
  }
}

function normalizeDestination(value: unknown) {
  if (typeof value !== "string") {
    throw new Error("Enter a destination.");
  }

  const destination = value.replace(/\s+/g, " ").trim();
  if (destination.length < 2 || destination.length > 70) {
    throw new Error("Enter a destination between 2 and 70 characters.");
  }

  if (!/^[\p{L}\p{M}\d .,'’()&/-]+$/u.test(destination)) {
    throw new Error("Use a city, region, or country name only.");
  }

  return destination;
}

function consumeMemoryRateLimit(key: string, limit: number, now: number) {
  const current = requestWindows.get(key);

  if (!current || current.resetAt <= now) {
    if (requestWindows.size >= 1_000) {
      for (const [storedKey, value] of requestWindows) {
        if (value.resetAt <= now) requestWindows.delete(storedKey);
      }
      if (requestWindows.size >= 1_000) {
        requestWindows.delete(requestWindows.keys().next().value as string);
      }
    }
    requestWindows.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (current.count >= limit) {
    return false;
  }

  current.count += 1;
  return true;
}

async function consumeRateLimit(
  request: Request,
  runtime: RuntimeEnvironment,
  apiKey: string,
) {
  const now = Date.now();
  const clientKey = await createClientRateLimitKey(request, apiKey);
  if (!runtime.DB) {
    return consumeMemoryRateLimit(`client:${clientKey}`, CLIENT_GENERATION_LIMIT, now)
      && consumeMemoryRateLimit("global", GLOBAL_GENERATION_LIMIT, now);
  }

  const clientAllowed = await consumeGenerationRateLimit(
    runtime.DB,
    `client:${clientKey}`,
    now,
    CLIENT_GENERATION_LIMIT,
    RATE_LIMIT_WINDOW,
  );
  if (!clientAllowed) return false;
  return consumeGenerationRateLimit(
    runtime.DB,
    "global",
    now,
    GLOBAL_GENERATION_LIMIT,
    RATE_LIMIT_WINDOW,
  );
}

async function readDurableBooklet(
  runtime: RuntimeEnvironment,
  cacheKey: string,
  identity: BookletCacheIdentity,
) {
  if (!runtime.DB || !runtime.BOOKLET_FILES) return null;
  try {
    return await readStoredBooklet(
      runtime.DB,
      runtime.BOOKLET_FILES,
      cacheKey,
      identity,
    );
  } catch (error) {
    logStorageFailure("read booklet", error);
    throw new GenerationBusyError(
      "Saved booklets are temporarily unavailable. Please try again shortly.",
    );
  }
}

async function waitForDurableBookletOrLock(
  runtime: RuntimeEnvironment,
  cacheKey: string,
  identity: BookletCacheIdentity,
  lockOwner: string,
  publish: (message: string) => void,
) {
  const deadline = Date.now() + GENERATION_WAIT_TTL;
  publish("Rejoining the copy already being created…");

  while (Date.now() < deadline) {
    const stored = await readDurableBooklet(runtime, cacheKey, identity);
    if (stored) return { booklet: stored, ownsLock: false };

    if (!runtime.DB) break;
    const now = Date.now();
    try {
      const ownsLock = await acquireGenerationLock(
        runtime.DB,
        cacheKey,
        lockOwner,
        now,
        now + GENERATION_LOCK_TTL,
      );
      if (ownsLock) return { booklet: null, ownsLock: true };
    } catch (error) {
      logStorageFailure("reacquire generation lock", error);
      throw new GenerationBusyError(
        "The travel studio is temporarily unavailable. Please try again shortly.",
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 3_000));
  }

  throw new GenerationBusyError(
    "This booklet is still being finished. Please try Create again in a moment.",
  );
}

function keepGenerationLockAlive(
  database: BookletDatabase,
  cacheKey: string,
  ownerId: string,
): GenerationLockLease {
  let stopped = false;
  let ownershipLost = false;
  let confirmedUntil = Date.now() + GENERATION_LOCK_TTL;
  let pending = Promise.resolve();
  const interval = setInterval(() => {
    pending = pending.then(async () => {
      if (stopped) return;
      const now = Date.now();
      try {
        const renewed = await acquireGenerationLock(
          database,
          cacheKey,
          ownerId,
          now,
          now + GENERATION_LOCK_TTL,
        );
        if (!renewed) {
          ownershipLost = true;
          console.warn("[TripQuest storage: renew generation lock] Lock ownership changed");
        } else {
          confirmedUntil = now + GENERATION_LOCK_TTL;
        }
      } catch (error) {
        logStorageFailure("renew generation lock", error);
      }
    });
  }, GENERATION_LOCK_RENEWAL);

  return {
    assertOwned() {
      if (
        ownershipLost ||
        Date.now() + GENERATION_LOCK_RENEWAL >= confirmedUntil
      ) {
        throw new GenerationBusyError(
          "The saved-edition lock could not be renewed. Please try again shortly.",
        );
      }
    },
    async stop() {
      stopped = true;
      clearInterval(interval);
      await pending;
    },
  };
}

function generationErrorMessage(error: unknown) {
  if (error instanceof UserCorrectionError || error instanceof GenerationBusyError) {
    return error.message;
  }

  if (error instanceof KimiRequestError) {
    return error.status === 429
      ? "The travel studio is busy right now. Please try again shortly."
      : "Kimi could not finish this booklet. Please try again.";
  }

  if (error instanceof GenerationStageError) {
    console.error(`[TripQuest ${error.stage}]`, error.message);
    return error.stage === "research"
      ? "Destination research could not be completed after two attempts. Please try again shortly."
      : "The destination research succeeded, but one or more printable games did not pass the quality checks. Please try again.";
  }

  const message = error instanceof Error
    ? error.message
    : "The booklet could not be generated.";
  console.error("[TripQuest generation]", message);
  return "The destination research was incomplete. Please try the place again.";
}

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const body = await readJsonObject(request);
    const destination = normalizeDestination(body.destination);
    const age = requireInteger(body.age, 3, 14, "Age");
    const days = requireInteger(body.days, 1, 14, "Trip length");
    const itinerary = normalizeItinerary(body.itinerary, days);
    const family = normalizeFamilyChildren(body.family);
    const events = normalizeItineraryEvents(body.events, days);
    const familyContext = familyPromptSummary(family);
    const hasSiblings = family.length > 1;
    const balancePlan = mechanicPlanForTrip(family, days)
      .map((plan) => `Day ${plan.day}: ${plan.mechanics.join(" + ")}`)
      .join("\n");
    const interestPlan = interestPlanForTrip(family, days);
    // Rotated by destination so different trips don't all land on the exact
    // same day-1 game pair for a given age band — see
    // balancedGameTypePlanForTrip's own comment for why.
    const gameTypePlan = balancedGameTypePlanForTrip(age, days, interestPlan, destination);
    const runtime = await getRuntimeEnvironment();
    const researchModel = runtime.KIMI_RESEARCH_MODEL?.trim() || "kimi-k3";
    const composerModel = runtime.KIMI_COMPOSER_MODEL?.trim() || "kimi-k2.6";
    const identity: BookletCacheIdentity = {
      destination,
      age,
      days,
      itinerary,
      researchModel,
      composerModel,
      familyContext,
      familySize: family.length,
      editionContext: familyEditionContext(family, events),
    };
    const cacheKey = await createBookletCacheKey(identity);
    const cached = getCached(bookletCache, cacheKey);
    if (cached) {
      const edition = await withEditionFingerprint(cached);
      return Response.json(createBookletPreview(applySiblingPlan(edition, family)), {
        headers: {
          "Cache-Control": "private, no-store",
          "X-TripQuest-Cache": "memory",
        },
      });
    }

    const stored = await readDurableBooklet(runtime, cacheKey, identity);
    if (stored) {
      const edition = await withEditionFingerprint(stored);
      setCached(bookletCache, cacheKey, {
        expiresAt: Date.now() + MEMORY_BOOKLET_TTL,
        value: edition,
      }, MAX_MEMORY_BOOKLET_ENTRIES);
      return Response.json(createBookletPreview(applySiblingPlan(edition, family)), {
        headers: {
          "Cache-Control": "private, no-store",
          "X-TripQuest-Cache": "durable",
        },
      });
    }

    const apiKey = runtime.MOONSHOT_API_KEY?.trim();
    if (!apiKey) {
      return Response.json(
        { error: "The travel studio is not connected yet." },
        { status: 503 },
      );
    }

    let task = bookletJobs.get(cacheKey);
    if (!task && bookletJobs.size >= MAX_ACTIVE_GENERATIONS) {
      return Response.json(
        { error: "The travel studio is busy. Please try again shortly." },
        { status: 503 },
      );
    }
    let rateLimitAllowed = true;
    if (!task) {
      try {
        rateLimitAllowed = await consumeRateLimit(request, runtime, apiKey);
      } catch (error) {
        logStorageFailure("check generation rate limit", error);
        return Response.json(
          { error: "The travel studio is temporarily unavailable. Please try again shortly." },
          { status: 503 },
        );
      }
    }
    if (!task) task = bookletJobs.get(cacheKey);
    if (!task && bookletJobs.size >= MAX_ACTIVE_GENERATIONS) {
      return Response.json(
        { error: "The travel studio is busy. Please try again shortly." },
        { status: 503 },
      );
    }
    if (!task && !rateLimitAllowed) {
      return Response.json(
        {
          error:
            "You’ve made several new previews recently. Saved booklets remain available; please try a new one later.",
        },
        { status: 429 },
      );
    }

    if (!task) {
      task = createGenerationTask(
        "Starting destination research…",
        async (publish) => {
          const generationStartedAt = Date.now();
          const lockOwner = crypto.randomUUID();
          let ownsLock = false;
          let lockAvailable = false;
          let lockLease: GenerationLockLease | undefined;

          if (runtime.DB) {
            publish("Checking for a saved or in-progress edition…");
            try {
              const now = Date.now();
              ownsLock = await acquireGenerationLock(
                runtime.DB,
                cacheKey,
                lockOwner,
                now,
                now + GENERATION_LOCK_TTL,
              );
              lockAvailable = true;
            } catch (error) {
              logStorageFailure("acquire generation lock", error);
              throw new GenerationBusyError(
                "The travel studio is temporarily unavailable. Please try again shortly.",
              );
            }
          }

          if (runtime.DB && runtime.BOOKLET_FILES && lockAvailable && !ownsLock) {
            const shared = await waitForDurableBookletOrLock(
              runtime,
              cacheKey,
              identity,
              lockOwner,
              publish,
            );
            if (shared.booklet) {
              const edition = await withEditionFingerprint(shared.booklet);
              setCached(bookletCache, cacheKey, {
                expiresAt: Date.now() + MEMORY_BOOKLET_TTL,
                value: edition,
              }, MAX_MEMORY_BOOKLET_ENTRIES);
              return edition;
            }
            ownsLock = shared.ownsLock;
          }

          if (ownsLock && runtime.DB) {
            lockLease = keepGenerationLockAlive(
              runtime.DB,
              cacheKey,
              lockOwner,
            );
          }

          try {
            const rechecked = await readDurableBooklet(runtime, cacheKey, identity);
            if (rechecked) return withEditionFingerprint(rechecked);

            publish("Researching real landmarks, culture, and local details…");
            let stageStartedAt = Date.now();
            const research = await researchDestination(
              destination,
              itinerary,
              apiKey,
              researchModel,
              runtime.DB,
            ).catch((error) => {
              if (error instanceof GenerationBusyError) throw error;
              throw new GenerationStageError("research", error);
            });
            logGenerationTiming(cacheKey, "research", stageStartedAt);
            lockLease?.assertOwned();
            assertResearchMatchesRequest(research);

            publish(`Designing printable games specifically for age ${age}…`);
            stageStartedAt = Date.now();
            let draft = await composeBooklet(
              destination,
              age,
              days,
              itinerary,
              research,
              apiKey,
              composerModel,
              familyContext,
              hasSiblings,
              balancePlan,
              gameTypePlan,
              interestPlan,
              runtime.BOOKLET_FILES,
              cacheKey,
              publish,
            ).catch((error) => {
              throw new GenerationStageError("composition", error);
            });
            logGenerationTiming(cacheKey, "composition", stageStartedAt);
            lockLease?.assertOwned();
            let preparedDraft = applySiblingPlan(draft, family);
            let provisionalResult: GeneratedBookletData = {
              destination,
              age,
              days,
              itinerary,
              ...preparedDraft,
              sources: research.sources,
              generatedAt: new Date().toISOString(),
              family,
              events,
            };
            // Reject bad model output before paying the latency and cost of
            // images. A live 50-scenario test run found a single repair
            // attempt is sometimes not enough — Kimi can occasionally miss
            // the same whole-booklet rule twice in a row even when told
            // what to avoid — so this allows a couple of repair rounds,
            // mirroring the "extra attempt is cheap insurance" reasoning
            // composeBookletBatch's own schema-validation retries already
            // use, rather than failing the entire generation over one
            // stubborn day.
            const MAX_QA_REPAIRS = 2;
            for (let repairAttempt = 0; ; repairAttempt += 1) {
              try {
                assertBookletQa(provisionalResult);
                break;
              } catch (qaError) {
                // A whole-booklet rule can fail even when every batch passed
                // its own checks (for example a duplicate mission card
                // across two batches). Recompose only the offending day's
                // batch instead of discarding all the already-valid
                // composed work; give up if the day cannot be identified or
                // the repair budget is exhausted.
                const failedDay = qaError instanceof Error
                  ? Number(qaError.message.match(/^Day (\d+)/)?.[1])
                  : NaN;
                console.info("[TripQuest qa] whole-booklet check failed:", qaError instanceof Error ? qaError.message : qaError);
                if (!Number.isInteger(failedDay) || repairAttempt >= MAX_QA_REPAIRS) throw qaError;

                const { offset, dayCount } = batchRangeForDay(failedDay, days);
                publish(`Repairing day ${failedDay}…`);
                try {
                  await deleteStoredBookletBatch(runtime.BOOKLET_FILES, cacheKey, offset, dayCount);
                } catch (error) {
                  logStorageFailure("delete invalid booklet batch", error);
                }

                stageStartedAt = Date.now();
                // Tell the repair exactly what the previous attempt got
                // wrong — recomposing blind can hit the same whole-booklet
                // QA rule again and waste the repair budget.
                const repairGuidance = qaError instanceof Error
                  ? `The previous version of this booklet was rejected: ${qaError.message} Avoid that specific problem this time.`
                  : undefined;
                draft = await composeBooklet(
                  destination,
                  age,
                  days,
                  itinerary,
                  research,
                  apiKey,
                  composerModel,
                  familyContext,
                  hasSiblings,
                  balancePlan,
                  gameTypePlan,
                  interestPlan,
                  runtime.BOOKLET_FILES,
                  cacheKey,
                  publish,
                  repairGuidance,
                ).catch((error) => {
                  throw new GenerationStageError("composition", error);
                });
                logGenerationTiming(cacheKey, `composition-repair-${repairAttempt + 1}`, stageStartedAt);
                lockLease?.assertOwned();
                preparedDraft = applySiblingPlan(draft, family);
                provisionalResult = {
                  destination,
                  age,
                  days,
                  itinerary,
                  ...preparedDraft,
                  sources: research.sources,
                  generatedAt: new Date().toISOString(),
                  family,
                  events,
                };
              }
            }
            stageStartedAt = Date.now();
            // Run in parallel, not chained: each generates a disjoint set of
            // images (coloring/drawing activities vs. one reveal photo vs.
            // one cover hero image) and touches disjoint fields, so there is
            // no reason to pay any one's latency on top of another's.
            const [illustratedDayPlans, revealPhotoDayPlans, coverIllustrationPath, spotPictures] = await Promise.all([
              addBookletIllustrations(runtime, {
                destination,
                age,
                dayPlans: preparedDraft.dayPlans,
              }, publish),
              addRevealPhotos(runtime, {
                destination,
                dayPlans: preparedDraft.dayPlans,
              }, publish),
              addCoverIllustration(runtime, { destination }, publish),
              addSpotTheDifference(runtime, { destination, dayPlans: preparedDraft.dayPlans }, publish),
            ]);
            const revealedDayPlans = applyDifferencePaths(illustratedDayPlans, spotPictures).map((day, index) => {
              const photoReveal = revealPhotoDayPlans[index]?.slots?.questReveal;
              if (!photoReveal?.photoPath || !day.slots.questReveal) return day;
              return {
                ...day,
                slots: {
                  ...day.slots,
                  questReveal: { ...day.slots.questReveal, photoPath: photoReveal.photoPath, photoCredit: photoReveal.photoCredit },
                },
              };
            });
            logGenerationTiming(cacheKey, "illustrations", stageStartedAt);
            lockLease?.assertOwned();
            const result: GeneratedBookletData = {
              ...provisionalResult,
              dayPlans: revealedDayPlans,
              coverIllustrationPath,
            };
            assertBookletQa(result);
            const edition = await withEditionFingerprint(result);
            setCached(bookletCache, cacheKey, {
              expiresAt: Date.now() + MEMORY_BOOKLET_TTL,
              value: edition,
            }, MAX_MEMORY_BOOKLET_ENTRIES);

            if (runtime.DB && runtime.BOOKLET_FILES) {
              publish("Saving this edition for instant reuse…");
              stageStartedAt = Date.now();
              try {
                await writeStoredBooklet(runtime.DB, runtime.BOOKLET_FILES, {
                  cacheKey,
                  booklet: edition,
                  researchModel,
                  composerModel,
                  expiresAt: Date.now() + DURABLE_BOOKLET_TTL,
                });
              } catch (error) {
                logStorageFailure("write booklet", error);
              }
              logGenerationTiming(cacheKey, "storage", stageStartedAt);
            }

            logGenerationTiming(cacheKey, "total", generationStartedAt);
            return edition;
          } finally {
            await lockLease?.stop();
            if (ownsLock && runtime.DB) {
              try {
                await releaseGenerationLock(runtime.DB, cacheKey, lockOwner);
              } catch (error) {
                logStorageFailure("release generation lock", error);
              }
            }
          }
        },
      );
      bookletJobs.set(cacheKey, task);
      void task.promise
        .finally(() => bookletJobs.delete(cacheKey))
        .catch(() => undefined);
    }

    getRequestExecutionContext()?.waitUntil(
      task.promise.then(
        () => undefined,
        () => undefined,
      ),
    );
    return createGenerationStreamResponse(
      task,
      generationErrorMessage,
      (booklet) => createBookletPreview(applySiblingPlan(booklet, family)),
    );
  } catch (error) {
    if (error instanceof HttpRequestError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof GenerationBusyError) {
      return Response.json({ error: error.message }, { status: 503 });
    }

    const message = error instanceof Error ? error.message : "The booklet could not be generated.";
    console.error("[TripQuest generation]", message);
    const isInputError = /enter a destination|city, region|characters|daily plans|day \d+ plan/i.test(message);
    return Response.json(
      {
        error: isInputError
          ? message
          : "The destination research was incomplete. Please try the place again.",
      },
      { status: isInputError ? 400 : 502 },
    );
  }
}
