"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  BookOpenCheck,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  LoaderCircle,
  LockKeyhole,
  MapPin,
  Package,
  Maximize2,
  Minus,
  Plus,
  ShieldCheck,
  Sparkles,
  UserRound,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  buildBooklet,
  getAgeBand,
  getDestinationProfile,
  sanitizeAge,
  sanitizeDays,
} from "./lib/booklet/booklet";
import {
  applySiblingPlan,
  enrichOfflinePreviewGameplay,
  type GeneratedBookletData,
  type GeneratedBookletProfile,
  isGeneratedBookletData,
} from "./lib/generation/booklet-ai";
import { PdfPreview } from "./components/pdf-preview";
import { bookletPdfPageTitles } from "./lib/pdf/plan";
import {
  GenerationStreamError,
  readGenerationResponse,
} from "./lib/generation/stream";
import {
  capAtWordBoundary,
  defaultFamilyWorkspace,
  eventsToDailyPlans,
  eventTypeLabel,
  familyPackFor,
  familyChildDisplayName,
  mechanicLabel,
  mergeDailyPlans,
  normalizeFamilyChildren,
  parseFamilyTags,
  parseItineraryText,
  QUEST_MECHANICS,
  readingLevelForAge,
  type FamilyChild,
  type ItineraryEvent,
} from "./lib/family";
import { KIT_CONTENTS, KIT_SHIPS_WITHIN_DAYS, PRODUCTS, purchaseProductFrom, type PurchaseProduct } from "./lib/products";

type FreePdfKind = "booklet" | "stickers";

type Trip = {
  age: number;
  destination: string;
  days: number;
};

type PaidDownloadState = "idle" | "preparing" | "ready" | "error";

const destinationSuggestions = [
  "Singapore",
  "Tokyo",
  "Kyoto",
  "Paris",
  "London",
  "Seoul",
  "Sydney",
  "Bangkok",
  "Chongqing",
];

const agePreviewCopy: Record<number, string> = {
  3: "Pointing, naming, movement, and choices with a grown-up reading aloud.",
  4: "Counting, matching, pretend play, tracing, and generous drawing space.",
  5: "Sound play, simple sequences, movement, and short draw-or-tell prompts.",
  6: "Early-reader clues, picture maps, labels, and quick write-or-draw answers.",
  7: "Short independent reading, playful codes, map logic, and concrete comparisons.",
  8: "Multi-step hunts, simple scoring, captions, symbols, and explain-one-reason prompts.",
  9: "Field notes, categorizing, estimation, and evidence-based comparisons.",
  10: "Mini investigations, annotated sketches, route reasoning, and two-part explanations.",
  11: "Cultural connections, scale puzzles, respectful questions, and concise reporting.",
  12: "Self-directed fieldwork, visual analysis, practical planning, and editorial choices.",
  13: "Design critique, ethical travel choices, mini journalism, and supported opinions.",
  14: "Cultural context, trade-off analysis, independent research, and lively travel writing.",
};

function clampPage(page: number, pageCount: number) {
  return Math.max(0, Math.min(page, pageCount - 1));
}

function kitShippingNote() {
  return `Your explorer kit will be printed and posted within ${KIT_SHIPS_WITHIN_DAYS} working days.`;
}

function checkoutContext() {
  const idle = { state: "idle" as PaidDownloadState, sessionId: "", pdfUrl: "", note: "", product: "pdf" as PurchaseProduct };
  if (typeof window === "undefined") return idle;
  const params = new URLSearchParams(window.location.search);
  const checkout = params.get("checkout");
  const product = purchaseProductFrom(params.get("product"));
  if (checkout === "cancelled") {
    return { ...idle, note: "Payment was cancelled. Your booklet is still here whenever you are ready." };
  }
  if (checkout !== "success") return idle;
  const sessionId = params.get("session_id")?.trim() || "";
  if (!sessionId) {
    return {
      ...idle,
      state: "error" as PaidDownloadState,
      product,
      note: "Payment returned without a checkout session. Please start checkout again or contact support.",
    };
  }
  return {
    state: "preparing" as PaidDownloadState,
    sessionId,
    pdfUrl: `/api/pdf?session_id=${encodeURIComponent(sessionId)}`,
    note: product === "kit"
      ? `Payment received. ${kitShippingNote()} Preparing your free PDF and sticker sheets…`
      : "Payment received. Preparing your PDF…",
    product,
  };
}

type GenerateRequestBody = {
  age: number;
  destination: string;
  days: number;
  itinerary: string[];
  family: FamilyChild[];
  events: ItineraryEvent[];
};

// A suspended or discarded tab loses all in-memory state, so an in-progress
// request is mirrored here and resumed on reload instead of restarting the
// whole (expensive) generation from scratch.
const PENDING_GENERATION_KEY = "tripquest-pending-generation";
const PENDING_GENERATION_MAX_AGE_MS = 45 * 60 * 1000;

function isGenerateRequestBody(value: unknown): value is GenerateRequestBody {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.age === "number" &&
    typeof record.destination === "string" &&
    typeof record.days === "number" &&
    Array.isArray(record.itinerary) &&
    Array.isArray(record.family) &&
    Array.isArray(record.events)
  );
}

function readPendingGeneration(): GenerateRequestBody | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PENDING_GENERATION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { trip?: unknown; startedAt?: unknown };
    if (typeof parsed.startedAt !== "number") return null;
    if (Date.now() - parsed.startedAt > PENDING_GENERATION_MAX_AGE_MS) return null;
    return isGenerateRequestBody(parsed.trip) ? parsed.trip : null;
  } catch {
    return null;
  }
}

function writePendingGeneration(trip: GenerateRequestBody) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      PENDING_GENERATION_KEY,
      JSON.stringify({ trip, startedAt: Date.now() }),
    );
  } catch {
    // Private browsing or a full quota can block storage; resuming after a
    // suspended tab just will not be available this time.
  }
}

function clearPendingGeneration() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(PENDING_GENERATION_KEY);
  } catch {
    // Ignore.
  }
}

function isConnectionIssue(error: unknown) {
  return (
    error instanceof TypeError ||
    error instanceof SyntaxError ||
    (error instanceof GenerationStreamError && error.retryable)
  );
}

export default function Home() {
  // A return from Stripe is read after hydration (the server never sees the
  // query), so the first client render matches the server's HTML.
  const [checkoutReturn, setCheckoutReturn] = useState<ReturnType<typeof checkoutContext>>(() => ({
    state: "idle",
    sessionId: "",
    pdfUrl: "",
    note: "",
    product: "pdf",
  }));
  const [age, setAge] = useState(5);
  const [destination, setDestination] = useState("Singapore");
  const [days, setDays] = useState(5);
  const [itinerary, setItinerary] = useState<string[]>(() => Array(14).fill(""));
  const [itineraryOpen, setItineraryOpen] = useState(false);
  const [trip, setTrip] = useState<Trip>({
    age: 5,
    destination: "Singapore",
    days: 5,
  });
  const [page, setPage] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutNote, setCheckoutNote] = useState("");
  const [pdfState, setPdfState] = useState<"idle" | "generating">("idle");
  const [freePdfState, setFreePdfState] = useState<"idle" | FreePdfKind>("idle");
  const [freePdfNote, setFreePdfNote] = useState("");
  const [paidDownloadState, setPaidDownloadState] = useState<PaidDownloadState>("idle");
  const { pdfUrl: paidPdfUrl, product: paidProduct, sessionId: checkoutSessionId } = checkoutReturn;
  const [paidPdfObjectUrl, setPaidPdfObjectUrl] = useState("");
  useEffect(() => {
    const context = checkoutContext();
    if (context.state === "idle" && !context.note) return;
    // Reading the Stripe return once on mount is this effect's whole job.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCheckoutReturn(context);
    setCheckoutNote(context.note);
    setPaidDownloadState(context.state);
  }, []);
  const autoDownloadAttempted = useRef(false);
  const generationInFlight = useRef(false);
  const resumeAttempted = useRef(false);
  const [generatedBooklet, setGeneratedBooklet] =
    useState<GeneratedBookletData | null>(null);
  // Days that finished while the rest of the booklet is still composing,
  // shown in the preview so the wait has something to look at.
  const [partialPreview, setPartialPreview] = useState<{
    profile: GeneratedBookletProfile;
    dayPlans: GeneratedBookletData["dayPlans"];
  } | null>(null);
  const [generationState, setGenerationState] = useState<
    "idle" | "generating" | "error"
  >("idle");
  const [generationError, setGenerationError] = useState("");
  const [generationMessage, setGenerationMessage] = useState(
    "Preparing the travel studio…",
  );
  const [announcement, setAnnouncement] = useState(
    "Singapore preview ready for age 5.",
  );
  const [children, setChildren] = useState<FamilyChild[]>(defaultFamilyWorkspace().children);
  const [familyDraft, setFamilyDraft] = useState<FamilyChild[]>(defaultFamilyWorkspace().children);
  const [interestInputs, setInterestInputs] = useState<Record<string, string>>({});
  const [avoidInputs, setAvoidInputs] = useState<Record<string, string>>({});
  const [familyPanelOpen, setFamilyPanelOpen] = useState(false);
  const [familyStatus, setFamilyStatus] = useState("");
  const [familyLoading, setFamilyLoading] = useState(true);
  const [familyNeedsRegeneration, setFamilyNeedsRegeneration] = useState(false);
  const [itineraryText, setItineraryText] = useState("");
  const [structuredEvents, setStructuredEvents] = useState<ItineraryEvent[]>([]);
  const [previewZoom, setPreviewZoom] = useState(1);

  useEffect(() => {
    let active = true;
    void fetch("/api/family", { headers: { Accept: "application/json" } })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Family profiles are unavailable.")))
      .then((payload: unknown) => {
        if (!active) return;
        const record = payload && typeof payload === "object" ? payload as { workspace?: unknown } : {};
        const loaded = normalizeFamilyChildren((record.workspace as { children?: unknown } | undefined)?.children);
        setChildren(loaded);
        setFamilyDraft(loaded);
        setAge(loaded[0]?.age || 5);
      })
      .catch(() => {
        if (active) setFamilyStatus("Using this device's temporary family profile until it reconnects.");
      })
      .finally(() => {
        if (active) setFamilyLoading(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const sessionId = checkoutSessionId;
    const pdfUrl = paidPdfUrl;
    if (!sessionId || !pdfUrl) return;
    let active = true;

    async function preparePaidDownload() {
      let lastStatus = 0;
      for (let attempt = 0; attempt < 8 && active; attempt += 1) {
        try {
          const response = await fetch(pdfUrl, {
            headers: { Accept: "application/pdf" },
            cache: "no-store",
          });
          lastStatus = response.status;
          const contentType = response.headers.get("content-type") || "";
          if (response.ok && contentType.includes("application/pdf")) {
            const objectUrl = URL.createObjectURL(await response.blob());
            if (!active) {
              URL.revokeObjectURL(objectUrl);
              return;
            }
            setPaidPdfObjectUrl((previous) => {
              if (previous) URL.revokeObjectURL(previous);
              return objectUrl;
            });
            setPaidDownloadState("ready");
            setCheckoutNote(
              paidProduct === "kit"
                ? `Payment received. ${kitShippingNote()} The printable PDF and sticker sheets are free to download below while you wait.`
                : "Payment received. Your PDF is ready. If it does not download automatically, use the button below.",
            );
            // A kit buyer paid for the post, not the file: offer the free
            // PDF without pushing a download at them.
            if (paidProduct !== "kit" && !autoDownloadAttempted.current) {
              autoDownloadAttempted.current = true;
              window.setTimeout(() => {
                if (!active) return;
                const link = document.createElement("a");
                link.href = objectUrl;
                link.download = "TripQuest-booklet.pdf";
                link.rel = "noopener";
                link.click();
              }, 50);
            }
            return;
          }
          if (![402, 404, 409, 429, 500, 502, 503, 504].includes(response.status)) break;
        } catch {
          lastStatus = 0;
        }
        await new Promise((resolve) => window.setTimeout(resolve, attempt < 2 ? 1_000 : 2_000));
      }

      if (!active) return;
      setPaidDownloadState("error");
      setCheckoutNote(
        lastStatus === 403
          ? "Payment may have completed, but this browser did not retain the purchase session. Please return to checkout and try again in the same browser."
          : "Payment was received, but the PDF is not ready yet. Use Try download again below in a moment; you will not be charged again.",
      );
    }

    void preparePaidDownload();
    return () => {
      active = false;
    };
  }, [checkoutSessionId, paidPdfUrl, paidProduct]);

  useEffect(() => () => {
    if (paidPdfObjectUrl) URL.revokeObjectURL(paidPdfObjectUrl);
  }, [paidPdfObjectUrl]);

  const destinationName = trip.destination.trim() || "Your destination";
  const destinationProfile = useMemo(
    () => generatedBooklet?.profile ?? partialPreview?.profile ?? getDestinationProfile(destinationName),
    [destinationName, generatedBooklet, partialPreview],
  );
  // Before a real booklet exists, this falls back to buildBooklet's
  // deterministic offline generator — the same live GeneratedPage
  // component and current page/CSS styling render either way, so the
  // pre-generation preview always matches what generating for real would
  // produce, instead of drifting out of sync the way a hardcoded static
  // sample (this used to special-case Singapore with pre-baked PNGs) does
  // the moment the page architecture or design changes.
  const generatedDays = useMemo(
    () =>
      generatedBooklet?.dayPlans ??
      partialPreview?.dayPlans ??
      // buildBooklet varies each day's theme/landmark/titles but never
      // assigns a gameType or items to inThePlace/sitDown — enrich it with
      // the same destination-rotated variety a real generation gets so the
      // preview actually shows different games, not every activity
      // silently falling back to the same "story" board.
      enrichOfflinePreviewGameplay(
        buildBooklet(trip.age, destinationName, trip.days),
        trip.age,
        destinationName,
      ),
    [generatedBooklet, partialPreview, trip.age, destinationName, trip.days],
  );
  const editionChildren = generatedBooklet?.family?.length
    ? generatedBooklet.family
    : children;
  // The booklet the preview draws: the finished edition, the days finished
  // so far while generating, or the offline sample before either.
  // Before generating, the sample uses a neutral explorer at the sample's
  // age, not the saved family (whose age may not match the sample).
  const previewChildren = useMemo(
    () => (generatedBooklet || partialPreview ? editionChildren : [{ ...defaultFamilyWorkspace().children[0], age: trip.age }]),
    [generatedBooklet, partialPreview, editionChildren, trip.age],
  );
  const previewBooklet = useMemo((): GeneratedBookletData => {
    if (generatedBooklet) return applySiblingPlan(generatedBooklet, generatedBooklet.family || children);
    // Days still streaming in have not had their sibling missions fitted to
    // the family yet; without this a one-child preview fails the PDF's
    // quality check until the whole booklet arrives.
    return applySiblingPlan({
      destination: destinationName,
      age: trip.age,
      days: generatedDays.length,
      itinerary: Array(generatedDays.length).fill(""),
      profile: destinationProfile,
      dayPlans: generatedDays,
      sources: [],
      generatedAt: "2026-01-01T00:00:00.000Z",
      family: previewChildren,
    }, previewChildren);
  }, [generatedBooklet, generatedDays, destinationName, destinationProfile, trip.age, children, previewChildren]);
  const previewFamilyPack = useMemo(
    () => familyPackFor(previewChildren, generatedBooklet?.events || structuredEvents, previewBooklet.days),
    [previewChildren, generatedBooklet, structuredEvents, previewBooklet.days],
  );
  const previewKey = generatedBooklet?.editionFingerprint
    ?? `${partialPreview ? "partial" : "sample"}-${destinationName}-${trip.age}-${generatedDays.length}-${generatedDays.map((day) => day.theme).join("|")}-${previewChildren.map((child) => `${child.name}:${child.age}`).join(",")}`;
  // One title per printed page, from the same page plan the PDF uses.
  const reportPageTitles = useMemo(() => {
    try {
      return bookletPdfPageTitles(previewBooklet, true);
    } catch {
      return ["Cover"];
    }
  }, [previewBooklet]);
  // The PDF is free, so every page and day of the edition is shown.
  const outlineItems = generatedDays.map((day) => ({ title: day.theme }));
  const currentPage = clampPage(page, reportPageTitles.length);
  const leadChild = children[0] || defaultFamilyWorkspace().children[0];
  const familyInterests = [...new Set(editionChildren.flatMap((child) => child.interests))];

  function updateLeadAge(value: number) {
    const nextAge = sanitizeAge(value);
    setAge(nextAge);
    setChildren((current) => current.map((child, index) => index === 0
      ? { ...child, age: nextAge, readingLevel: readingLevelForAge(nextAge) }
      : child));
  }

  function openFamilyPanel() {
    setFamilyDraft(children.map((child) => ({
      ...child,
      interests: [...child.interests],
      avoid: [...child.avoid],
      preferredMechanics: [...child.preferredMechanics],
    })));
    setInterestInputs({});
    setAvoidInputs({});
    setFamilyPanelOpen(true);
  }

  function addInterest(childId: string, rawValue = interestInputs[childId] || "") {
    const tags = parseFamilyTags(rawValue);
    if (!tags.length) return;
    setFamilyDraft((current) => current.map((child) => child.id === childId
      ? { ...child, interests: parseFamilyTags([...child.interests, ...tags].join(",")) }
      : child));
    setInterestInputs((current) => ({ ...current, [childId]: "" }));
  }

  function removeInterest(childId: string, interest: string) {
    setFamilyDraft((current) => current.map((child) => child.id === childId
      ? { ...child, interests: child.interests.filter((item) => item !== interest) }
      : child));
  }

  function addAvoid(childId: string, rawValue = avoidInputs[childId] || "") {
    const tags = parseFamilyTags(rawValue);
    if (!tags.length) return;
    setFamilyDraft((current) => current.map((child) => child.id === childId
      ? { ...child, avoid: parseFamilyTags([...child.avoid, ...tags].join(",")) }
      : child));
    setAvoidInputs((current) => ({ ...current, [childId]: "" }));
  }

  function removeAvoid(childId: string, avoid: string) {
    setFamilyDraft((current) => current.map((child) => child.id === childId
      ? { ...child, avoid: child.avoid.filter((item) => item !== avoid) }
      : child));
  }

  async function saveFamilyProfiles() {
    const withPendingInterests = familyDraft.map((child) => ({
      ...child,
      interests: parseFamilyTags([
        ...child.interests,
        ...(parseFamilyTags(interestInputs[child.id] || "")),
      ].join(",")),
      avoid: parseFamilyTags([
        ...child.avoid,
        ...(parseFamilyTags(avoidInputs[child.id] || "")),
      ].join(",")),
    }));
    const normalized = normalizeFamilyChildren(withPendingInterests);
    setChildren(normalized);
    setAge(normalized[0]?.age || age);
    setFamilyNeedsRegeneration(true);
    setFamilyStatus("Saving family profiles…");
    try {
      const response = await fetch("/api/family", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ workspace: { children: normalized } }),
      });
      if (!response.ok) throw new Error("Family profiles could not be saved.");
      setFamilyStatus("Family saved. Create a new booklet to apply these interests and preferences.");
      setFamilyPanelOpen(false);
    } catch (error) {
      setFamilyStatus(error instanceof Error ? error.message : "Family profiles could not be saved.");
    }
  }

  const runGeneration = useCallback(async (nextTrip: GenerateRequestBody) => {
    if (generationInFlight.current) return;
    generationInFlight.current = true;
    setGenerationState("generating");
    setGenerationError("");
    setGenerationMessage("Looking for a saved edition…");
    setPartialPreview(null);
    setDays(nextTrip.days);
    writePendingGeneration(nextTrip);

    // A dropped connection is common when a tab is backgrounded or the app is
    // switched away from; the server keeps working regardless (it runs the
    // generation independently of this stream), so it is worth reconnecting
    // for several minutes rather than failing after a few seconds.
    const retryDelaysMs = [1_500, 3_000, 6_000, 10_000, 15_000, 20_000, 30_000];
    const requestBody = JSON.stringify(nextTrip);
    let lastError: unknown;

    try {
      // A hard content failure (Kimi's output failed validation) is not a
      // connection problem, but checkpointed batches make a retry cheap: the
      // server reuses every batch that already validated and only
      // recomposes the one that failed. Give it one automatic retry before
      // asking the parent to notice and try again themselves.
      contentRetry: for (let contentAttempt = 0; contentAttempt < 2; contentAttempt += 1) {
        try {
          let payload: unknown;

          for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
            try {
              const response = await fetch("/api/generate", {
                method: "POST",
                headers: {
                  Accept: "text/event-stream, application/json",
                  "Content-Type": "application/json",
                },
                body: requestBody,
              });
              let showedPartial = false;
              payload = await readGenerationResponse(response, (message, partial) => {
                setGenerationMessage(message);
                if (!partial) return;
                setPartialPreview({
                  profile: partial.profile as GeneratedBookletProfile,
                  dayPlans: partial.dayPlans as GeneratedBookletData["dayPlans"],
                });
                if (!showedPartial) {
                  // First finished day: switch the preview to this trip.
                  showedPartial = true;
                  setGeneratedBooklet(null);
                  setTrip({ age: nextTrip.age, destination: nextTrip.destination, days: nextTrip.days });
                  setPage(0);
                }
              });
              const errorPayload = payload as { error?: string };

              if (!response.ok || typeof errorPayload?.error === "string") {
                throw new GenerationStreamError(
                  errorPayload.error || "The booklet could not be generated.",
                  false,
                );
              }
              break;
            } catch (error) {
              if (!isConnectionIssue(error) || attempt === retryDelaysMs.length) throw error;

              setGenerationMessage("Connection paused. Rejoining your saved work…");
              await new Promise((resolve) => setTimeout(resolve, retryDelaysMs[attempt]));
            }
          }

          if (!isGeneratedBookletData(payload)) {
            throw new Error("The booklet arrived in an unexpected format.");
          }

          setGeneratedBooklet(payload);
          setPartialPreview(null);
          setTrip({
            age: payload.age,
            destination: payload.destination,
            days: payload.days,
          });
          setAge(payload.age);
          setDays(payload.days);
          setItinerary([
            ...payload.itinerary,
            ...Array(Math.max(0, 14 - payload.itinerary.length)).fill(""),
          ]);
          setPage(0);
          setGenerationState("idle");
          setFamilyNeedsRegeneration(false);
          setAnnouncement(
            `${payload.destination} AI preview ready for age ${payload.age}.`,
          );
          clearPendingGeneration();
          return;
        } catch (error) {
          lastError = error;
          if (!isConnectionIssue(error) && contentAttempt === 0) {
            setGenerationMessage("That attempt didn't pass quality checks. Trying once more…");
            continue contentRetry;
          }
          break contentRetry;
        }
      }

      throw lastError;
    } catch (error) {
      if (!isConnectionIssue(error)) clearPendingGeneration();
      setPartialPreview(null);
      setGenerationState("error");
      setGenerationError(
        error instanceof Error &&
          !/load failed|failed to fetch|networkerror|live connection/i.test(
            error.message,
          )
          ? error.message
          : "The connection could not stay open after reconnecting. Reopening this page will pick up where it left off.",
      );
    } finally {
      generationInFlight.current = false;
    }
  }, []);

  async function handleGenerate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextTrip: GenerateRequestBody = {
      age: sanitizeAge(age),
      destination: destination.trim(),
      days: sanitizeDays(days),
      // An import already wrote its plans into the day fields (which the
      // family may have edited since), so they are not appended again.
      itinerary: itinerary.slice(0, sanitizeDays(days)).map((plan) => capAtWordBoundary(plan, 140)),
      family: children,
      events: structuredEvents,
    };

    if (!nextTrip.destination) {
      setGenerationState("error");
      setGenerationError("Enter a city, region, or country first.");
      return;
    }

    await runGeneration(nextTrip);
  }

  useEffect(() => {
    // generationInFlight: the preview clears the old booklet when the first
    // finished day of a new one arrives, which is not a reopened page.
    if (familyLoading || resumeAttempted.current || generatedBooklet || generationInFlight.current) return;
    const pendingTrip = readPendingGeneration();
    if (!pendingTrip) return;
    resumeAttempted.current = true;

    void (async () => {
      setAge(pendingTrip.age);
      setDestination(pendingTrip.destination);
      setDays(pendingTrip.days);
      setItinerary([
        ...pendingTrip.itinerary,
        ...Array(Math.max(0, 14 - pendingTrip.itinerary.length)).fill(""),
      ]);
      setChildren(pendingTrip.family);
      setFamilyDraft(pendingTrip.family);
      setStructuredEvents(pendingTrip.events);
      setGenerationMessage("Reopening this trip — resuming where it left off…");
      await runGeneration(pendingTrip);
    })();
  }, [familyLoading, generatedBooklet, runGeneration]);

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState !== "visible") return;
      if (generationInFlight.current || generatedBooklet) return;
      const pendingTrip = readPendingGeneration();
      if (!pendingTrip) return;
      setGenerationMessage("Reconnecting — resuming this trip…");
      void runGeneration(pendingTrip);
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [generatedBooklet, runGeneration]);

  // The exact edition in the preview, as /api/pdf and /api/checkout read it.
  function editionRequest(booklet: GeneratedBookletData) {
    return {
      age: booklet.age,
      days: booklet.days,
      destination: booklet.destination,
      itinerary: booklet.itinerary,
      family: booklet.family || children,
      events: booklet.events || structuredEvents,
      editionFingerprint: booklet.editionFingerprint,
    };
  }

  const exactPdfPreviewRequest = useMemo(
    () => generatedBooklet?.editionFingerprint
      ? { url: "/api/pdf", body: { ...editionRequest(generatedBooklet), kind: "booklet" } }
      : undefined,
    [generatedBooklet, children, structuredEvents],
  );
  const defaultSingaporeSamplePdf =
    !generatedBooklet &&
    !partialPreview &&
    destinationName.toLocaleLowerCase() === "singapore" &&
    trip.age === 5 &&
    trip.days === 5 &&
    !itineraryText.trim() &&
    structuredEvents.length === 0
      ? "/samples/tripquest-singapore-age-5-preview.pdf"
      : undefined;

  // The printable PDF and its sticker sheets are free for a created
  // booklet; the server renders the stored edition matching the preview.
  async function downloadFreePdf(kind: FreePdfKind) {
    if (!generatedBooklet?.editionFingerprint) {
      setFreePdfNote("Create a custom booklet above first. Its PDF and sticker sheets are then free to download.");
      return;
    }
    setFreePdfState(kind);
    setFreePdfNote(kind === "booklet" ? "Preparing your free booklet PDF…" : "Preparing your free sticker sheets…");
    try {
      const response = await fetch("/api/pdf", {
        method: "POST",
        headers: { Accept: "application/pdf", "Content-Type": "application/json" },
        body: JSON.stringify({ ...editionRequest(generatedBooklet), kind }),
      });
      if (!response.ok || !(response.headers.get("content-type") || "").includes("application/pdf")) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || "The PDF could not be prepared. Please try again.");
      }
      const filename = /filename="([^"]+)"/.exec(response.headers.get("content-disposition") || "")?.[1]
        || (kind === "stickers" ? "TripQuest-stickers.pdf" : "TripQuest-booklet.pdf");
      const objectUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = filename;
      link.rel = "noopener";
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      setFreePdfNote(
        kind === "booklet"
          ? "Your booklet PDF is downloading. Print it at home, as many copies as you like."
          : "Your sticker sheets are downloading. Print them on A5 sticker paper at 100% scale.",
      );
    } catch (error) {
      setFreePdfNote(error instanceof Error ? error.message : "The PDF could not be prepared. Please try again.");
    } finally {
      setFreePdfState("idle");
    }
  }

  async function handleKitCheckout() {
    if (!generatedBooklet) {
      setCheckoutNote(
        "Create a custom booklet above first, so we print and post exactly that edition. No charge was made.",
      );
      return;
    }

    setPdfState("generating");
    setCheckoutNote("Opening secure checkout…");
    try {
      const requestPayload = JSON.stringify({ ...editionRequest(generatedBooklet), product: "kit" });
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Accept": "application/json", "Content-Type": "application/json" },
        body: requestPayload,
      });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(
          response.status === 503
            ? "Secure payment is not connected yet. Please try again after Stripe is configured."
            : payload.error || "Secure checkout could not be started.",
        );
      }
      const payload = (await response.json()) as { url?: string };
      if (!payload.url) throw new Error("Secure checkout did not return a payment link.");
      window.location.assign(payload.url);
    } catch (error) {
      setCheckoutNote(
        error instanceof Error
          ? error.message
          : "Secure checkout could not be started. Please try again.",
      );
    } finally {
      setPdfState("idle");
    }
  }

  function changePage(direction: number) {
    setPage((value) => clampPage(value + direction, reportPageTitles.length));
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#builder" aria-label="TripQuest home">
          <span className="brand-mark" aria-hidden="true">
            <BookOpenCheck size={21} strokeWidth={2.4} />
          </span>
          <span>TripQuest</span>
        </a>
        <div className="topbar-meta">
          <span>Family travel studio</span>
          <button className="icon-button" type="button" aria-label="Family profiles" onClick={openFamilyPanel}>
            <UserRound size={19} />
          </button>
        </div>
      </header>

      {paidDownloadState !== "idle" ? (
        <section className={`payment-result payment-result-${paidDownloadState}`} role="status" aria-live="polite">
          <div className="payment-result-copy">
            <p className="eyebrow">{paidProduct === "kit" ? "Explorer kit ordered" : "Printable keepsake"}</p>
            <h2>
              {paidDownloadState === "error"
                ? "Your payment is safe."
                : paidProduct === "kit"
                  ? "Your explorer kit is on its way."
                  : paidDownloadState === "ready"
                    ? "Your booklet is ready."
                    : "Your payment went through."
              }
            </h2>
            <p>{checkoutNote}</p>
          </div>
          <div className="payment-result-actions">
            {checkoutSessionId && paidPdfUrl && paidDownloadState !== "preparing" ? (
              <a className="unlock-button paid-download-link" href={paidPdfObjectUrl || paidPdfUrl} download="TripQuest-booklet.pdf">
                <Download size={18} />
                {paidDownloadState !== "ready"
                  ? "Try download again"
                  : paidProduct === "kit" ? "Download free PDF" : "Download your PDF"}
              </a>
            ) : (
              <LoaderCircle className="payment-result-loader spin" size={24} aria-label="Preparing PDF" />
            )}
            {checkoutSessionId && paidPdfUrl && paidDownloadState === "ready" ? (
              <a className="paid-extra-link" href={`${paidPdfUrl}&kind=stickers`} download="TripQuest-stickers.pdf">
                <Download size={15} />
                Sticker sheets PDF: print on A5 sticker paper
              </a>
            ) : null}
            {checkoutSessionId && paidPdfUrl && paidDownloadState === "ready" ? (
              <a className="paid-extra-link" href={`${paidPdfUrl}&kind=parent-guide`} download="TripQuest-parent-guide.pdf">
                <Download size={15} />
                Parent guide and answer sheet
              </a>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="workspace" id="builder">
        <aside className="builder-panel" aria-labelledby="builder-title">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">New booklet</p>
              <h1 id="builder-title">Build a trip they can hold onto.</h1>
            </div>
          </div>

          <form
            className="trip-form"
            onSubmit={handleGenerate}
            aria-busy={generationState === "generating"}
          >
            <label className="field-label" htmlFor="destination">
              Destination
            </label>
            <div className="input-shell">
              <MapPin size={19} aria-hidden="true" />
              <input
                id="destination"
                list="destination-options"
                value={destination}
                disabled={generationState === "generating"}
                onChange={(event) => setDestination(event.target.value)}
                placeholder="City or destination"
              />
            </div>
            <datalist id="destination-options">
              {destinationSuggestions.map((suggestion) => (
                <option key={suggestion} value={suggestion} />
              ))}
            </datalist>

            <fieldset className="field-group">
              <legend className="field-label">Child&apos;s age</legend>
              <div className="age-control">
                <UserRound size={19} aria-hidden="true" />
                <button
                  className="icon-button"
                  type="button"
                  aria-label="Reduce age by one year"
                  disabled={age <= 3 || generationState === "generating"}
                  onClick={() => updateLeadAge(age - 1)}
                >
                  <Minus size={17} />
                </button>
                <input
                  aria-label="Child's age in years"
                  type="number"
                  min="3"
                  max="14"
                  inputMode="numeric"
                  value={age}
                  disabled={generationState === "generating"}
                  onChange={(event) => {
                    const value = event.target.valueAsNumber;
                    if (Number.isFinite(value)) updateLeadAge(value);
                  }}
                />
                <span>years</span>
                <button
                  className="icon-button"
                  type="button"
                  aria-label="Increase age by one year"
                  disabled={age >= 14 || generationState === "generating"}
                  onClick={() => updateLeadAge(age + 1)}
                >
                  <Plus size={17} />
                </button>
              </div>
            </fieldset>

            <div className="days-row">
              <div>
                <span className="field-label">Trip length</span>
                <p>{days === 1 ? "One adventure day" : `${days} adventure days`}</p>
              </div>
              <div className="stepper" aria-label="Trip length in days">
                <button
                  className="icon-button"
                  type="button"
                  aria-label="Remove one day"
                  disabled={days <= 1 || generationState === "generating"}
                  onClick={() => setDays((value) => Math.max(1, value - 1))}
                >
                  <Minus size={18} />
                </button>
                <output aria-live="polite">{days}</output>
                <button
                  className="icon-button"
                  type="button"
                  aria-label="Add one day"
                  disabled={days >= 14 || generationState === "generating"}
                  onClick={() => setDays((value) => Math.min(14, value + 1))}
                >
                  <Plus size={18} />
                </button>
              </div>
            </div>

            <div className="family-section">
              <div className="family-summary">
                <div>
                  <span className="field-label">Lead explorer <small>same child as age above</small></span>
                  <p>
                    {familyLoading
                      ? "Loading saved profile…"
                      : <><strong>{familyChildDisplayName(leadChild, 0)}</strong> · age {leadChild.age}{children.length > 1 ? ` · ${children.length - 1} sibling${children.length === 2 ? "" : "s"}` : " · no siblings added"}</>}
                  </p>
                  {!familyLoading && familyInterests.length ? (
                    <small className="family-interest-summary">Interests: {familyInterests.slice(0, 3).join(", ")}{familyInterests.length > 3 ? ` +${familyInterests.length - 3}` : ""}</small>
                  ) : null}
                </div>
                <button className="text-button" type="button" onClick={openFamilyPanel} disabled={generationState === "generating"}>
                  <UserRound size={16} />
                  Edit child & siblings
                </button>
              </div>
              {familyNeedsRegeneration ? (
                <p className="family-refresh-note" role="status">Profile updated. Tap Create custom booklet to rebuild the missions.</p>
              ) : null}
            </div>

            <div className="itinerary-editor">
              <button
                className="itinerary-toggle"
                type="button"
                aria-expanded={itineraryOpen}
                aria-controls="daily-plans"
                disabled={generationState === "generating"}
                onClick={() => setItineraryOpen((value) => !value)}
              >
                <CalendarDays size={19} aria-hidden="true" />
                <span>
                  <strong>Customize daily plans</strong>
                  <small>
                    {itinerary.slice(0, days).filter(Boolean).length
                      ? `${itinerary.slice(0, days).filter(Boolean).length} of ${days} days planned`
                      : "Optional"}
                  </small>
                </span>
                <ChevronDown
                  className={itineraryOpen ? "open" : ""}
                  size={18}
                  aria-hidden="true"
                />
              </button>
              {itineraryOpen ? (
                <div id="daily-plans" className="daily-plans">
                  <div className="itinerary-import">
                    <label className="field-label" htmlFor="itinerary-paste">Paste a booking or trip outline</label>
                    <textarea
                      id="itinerary-paste"
                      value={itineraryText}
                      maxLength={4_000}
                      disabled={generationState === "generating"}
                      onChange={(event) => setItineraryText(event.target.value)}
                      placeholder="Day 1: airport and hotel\nDay 2: museum, lunch, river walk"
                    />
                    <button
                      className="secondary-button import-button"
                      type="button"
                      disabled={!itineraryText.trim() || generationState === "generating"}
                      onClick={() => {
                        const events = parseItineraryText(itineraryText, days);
                        setStructuredEvents(events);
                        const importedPlans = eventsToDailyPlans(events, days);
                        setItinerary((current) => Array.from({ length: 14 }, (_, index) =>
                          mergeDailyPlans(current[index] || "", importedPlans[index] || ""),
                        ));
                      }}
                    >
                      <CalendarDays size={16} />
                      Build trip timeline
                    </button>
                    {structuredEvents.length ? (
                      <div className="event-list" aria-label="Imported itinerary events">
                        {structuredEvents.slice(0, 12).map((event) => (
                          <span className="event-chip" key={event.id}>Day {event.day} · {eventTypeLabel(event.type)} · {event.title}</span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  {itinerary.slice(0, days).map((plan, index) => (
                    <label key={index}>
                      <span>Day {index + 1}</span>
                      <input
                        value={plan}
                        maxLength={140}
                        disabled={generationState === "generating"}
                        placeholder={
                          index === 0
                            ? "e.g. old town and river cruise"
                            : "Places or plans for this day"
                        }
                        onChange={(event) => {
                          const nextItinerary = [...itinerary];
                          nextItinerary[index] = event.target.value;
                          setItinerary(nextItinerary);
                        }}
                      />
                    </label>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="edition-note">
              <Sparkles size={18} aria-hidden="true" />
              <div>
                <strong>
                  Age {age} · {getAgeBand(age).label}
                </strong>
                <span>{agePreviewCopy[age]}</span>
              </div>
            </div>

            <button
              className="primary-button"
              type="submit"
              disabled={generationState === "generating"}
            >
              {generationState === "generating" ? (
                <LoaderCircle className="spin" size={19} />
              ) : (
                <Sparkles size={19} />
              )}
              {generationState === "generating"
                ? "Building custom booklet…"
                : "Create custom booklet"}
            </button>
            {generationState === "generating" ? (
              <p className="generation-note" role="status">
                {generationMessage} Usually under a minute; a destination we have not researched before adds about a minute.
              </p>
            ) : null}
            {generationError ? (
              <p className="form-error" role="alert">
                {generationError}
              </p>
            ) : null}
            <p className="privacy-note">
              <ShieldCheck size={15} aria-hidden="true" />
              No child name or account required
            </p>
            <p className="sr-only" aria-live="polite">
              {announcement}
            </p>
          </form>
        </aside>

        <section
          className={fullscreen ? "preview-panel fullscreen" : "preview-panel"}
          aria-labelledby="preview-title"
        >
          <div className="preview-toolbar">
            <div>
              <p className="eyebrow">
                {generatedBooklet
                  ? "Your exact edition"
                  : partialPreview
                    ? `Your booklet · ${partialPreview.dayPlans.length} of ${trip.days} days ready`
                    : "Sample preview"}
              </p>
              <h2 id="preview-title">{destinationName} Explorer</h2>
              <p>
                Age {trip.age} <span aria-hidden="true">•</span> {trip.days} days{" "}
                <span aria-hidden="true">•</span> {reportPageTitles.length} report pages
              </p>
              <small className="pack-summary">
                grown-up guide · {editionChildren.length} explorer{editionChildren.length === 1 ? "" : "s"} · family mission map · cards · badge tracker
                {generatedBooklet && familyInterests.length ? ` · interests: ${familyInterests.slice(0, 2).join(", ")}` : ""}
                {generatedBooklet?.editionFingerprint ? ` · edition ${generatedBooklet.editionFingerprint.slice(0, 8).toUpperCase()}` : ""}
              </small>
            </div>
            <button
              className="icon-button"
              type="button"
              aria-label={fullscreen ? "Exit full preview" : "Open full preview"}
              onClick={() => setFullscreen((value) => !value)}
            >
              {fullscreen ? <X size={19} /> : <Maximize2 size={19} />}
            </button>
          </div>

          <div
            className="document-stage"
            style={{ "--preview-zoom": previewZoom } as CSSProperties}
          >
            <button
              className="page-arrow previous"
              type="button"
              aria-label="Previous page"
              disabled={currentPage === 0}
              onClick={() => changePage(-1)}
            >
              <ChevronLeft size={22} />
            </button>

            <div className={`paper-frame${previewZoom > 1 ? " zoomed" : ""}`}>
              <PdfPreview
                booklet={previewBooklet}
                familyPack={previewFamilyPack}
                documentKey={previewKey}
                page={currentPage}
                zoom={previewZoom}
                serverPdfRequest={exactPdfPreviewRequest}
                staticPdfUrl={defaultSingaporeSamplePdf}
              />
            </div>

            <button
              className="page-arrow next"
              type="button"
              aria-label="Next page"
              disabled={currentPage === reportPageTitles.length - 1}
              onClick={() => changePage(1)}
            >
              <ChevronRight size={22} />
            </button>
          </div>

          <div className="page-status">
            <strong>{reportPageTitles[currentPage]}</strong>
            <span>
              {currentPage + 1} / {reportPageTitles.length}
            </span>
          </div>

          <div className="preview-zoom-controls" aria-label="Preview zoom controls">
            <button
              className="icon-button"
              type="button"
              aria-label="Zoom out"
              title="Zoom out"
              disabled={previewZoom <= 1}
              onClick={() => setPreviewZoom((value) => Math.max(1, Number((value - 0.15).toFixed(2))))}
            >
              <ZoomOut size={17} />
            </button>
            <output>{Math.round(previewZoom * 100)}%</output>
            <button
              className="icon-button"
              type="button"
              aria-label="Zoom in"
              title="Zoom in"
              disabled={previewZoom >= 1.8}
              onClick={() => setPreviewZoom((value) => Math.min(1.8, Number((value + 0.15).toFixed(2))))}
            >
              <ZoomIn size={17} />
            </button>
          </div>

          <div className="thumbnail-strip" aria-label="Booklet pages">
            {reportPageTitles.map((pageTitle, index) => (
              <button
                className={`thumbnail${index === currentPage ? " active" : ""}`}
                key={`${pageTitle}-${index}`}
                type="button"
                aria-label={`Open ${pageTitle}`}
                aria-current={index === currentPage ? "page" : undefined}
                onClick={() => setPage(index)}
              >
                <span>{index + 1}</span>
              </button>
            ))}
          </div>

          <div className="purchase-bar">
            <div className="purchase-bar-copy">
              <span>Printable PDF · free</span>
              <strong>Print it at home, or we post the kit</strong>
            </div>
            <div className="purchase-actions">
              <button
                className="unlock-button"
                type="button"
                disabled={freePdfState !== "idle"}
                aria-busy={freePdfState === "booklet"}
                onClick={() => void downloadFreePdf("booklet")}
              >
                {freePdfState === "booklet" ? <LoaderCircle className="spin" size={18} /> : <Download size={18} />}
                Download free PDF
              </button>
              <button
                className="secondary-button kit-button"
                type="button"
                onClick={() => {
                  setCheckoutNote("");
                  setCheckoutOpen(true);
                }}
              >
                <Package size={17} />
                Mail me the explorer kit · {PRODUCTS.kit.priceLabel}
              </button>
            </div>
            <div className="purchase-bar-extra">
              <button
                className="paid-extra-link link-button"
                type="button"
                disabled={freePdfState !== "idle"}
                aria-busy={freePdfState === "stickers"}
                onClick={() => void downloadFreePdf("stickers")}
              >
                {freePdfState === "stickers" ? <LoaderCircle className="spin" size={15} /> : <Download size={15} />}
                Sticker sheets PDF, free: print on A5 sticker paper
              </button>
              {freePdfNote ? <p className="free-pdf-note" role="status">{freePdfNote}</p> : null}
            </div>
          </div>
        </section>
      </section>

      <section
        className="trip-outline"
        aria-label={`${trip.days}-day ${destinationName} booklet outline`}
      >
        <div className="outline-heading">
          <p className="eyebrow">Inside this edition</p>
          <strong>
            Age {trip.age}: {getAgeBand(trip.age).pace}
          </strong>
        </div>
        <ol>
          {outlineItems.map((item, index) => (
            <li key={`${index}-${item.title}`}>
              <span>{index + 1}</span>
              <strong>{item.title}</strong>
            </li>
          ))}
        </ol>
      </section>

      {generatedBooklet?.sources.length ? (
        <section className="research-strip" aria-label="Destination research">
          <div>
            <ShieldCheck size={18} aria-hidden="true" />
            <span>Place research</span>
            <strong>
              {generatedBooklet.sources
                .slice(0, 3)
                .map((source) => source.title)
                .join(" · ")}
            </strong>
          </div>
          <span>{generatedBooklet.sources.length} current sources checked</span>
        </section>
      ) : null}

      {checkoutOpen ? (
        <div className="modal-backdrop" role="presentation">
          <section
            className="checkout-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="checkout-title"
          >
            <button
              className="icon-button modal-close"
              type="button"
              aria-label="Close purchase window"
              onClick={() => setCheckoutOpen(false)}
            >
              <X size={19} />
            </button>
            <p className="eyebrow">Explorer kit</p>
            <h2 id="checkout-title">Mail me the {destinationName} kit</h2>
            <p className="modal-subtitle">
              We print this age-{trip.age} booklet ({reportPageTitles.length} A5 pages of itinerary-matched games, a treat trail and a certificate) and post it with everything below.
            </p>
            <div className="product-options">
              <div className="product-option kit-summary">
                <span className="product-option-head">
                  <strong>Explorer kit, posted to you</strong>
                  <span className="product-option-price">{PRODUCTS.kit.priceLabel}</span>
                </span>
                <span className="product-option-note">{PRODUCTS.kit.note} · posted within {KIT_SHIPS_WITHIN_DAYS} working days</span>
                <ul>
                  {KIT_CONTENTS.map((item) => (
                    <li key={item}><Check size={14} /> {item}</li>
                  ))}
                </ul>
              </div>
            </div>
            <p className="kit-free-pdf-note">
              Only want to print at home? The PDF and sticker sheets are free: close this and use Download free PDF.
            </p>
            <button
              className="primary-button checkout-button"
              type="button"
              disabled={pdfState === "generating"}
              aria-busy={pdfState === "generating"}
              onClick={handleKitCheckout}
            >
              {pdfState === "generating" ? (
                <LoaderCircle className="spin" size={18} />
              ) : (
                <LockKeyhole size={18} />
              )}
              {pdfState === "generating"
                ? "Opening secure checkout…"
                : `Pay ${PRODUCTS.kit.priceLabel} and add delivery address`}
            </button>
            {checkoutNote ? <p className="checkout-note">{checkoutNote}</p> : null}
          </section>
        </div>
      ) : null}

      {familyPanelOpen ? (
        <div className="modal-backdrop" role="presentation">
          <section className="family-modal" role="dialog" aria-modal="true" aria-labelledby="family-title">
            <button className="icon-button modal-close" type="button" aria-label="Close family profiles" onClick={() => setFamilyPanelOpen(false)}>
              <X size={19} />
            </button>
            <p className="eyebrow">Saved family</p>
            <h2 id="family-title">Make every explorer count</h2>
            <p className="modal-subtitle">The lead explorer is the same child as the age on the main form. Add siblings only when they are sharing this booklet. Add each child’s real name or nickname so family missions can address everyone accurately.</p>
            <div className="family-profile-list">
              {familyDraft.map((child, index) => (
                <article className="family-profile-card" key={child.id}>
                  <div className="profile-card-heading">
                    <div>
                      <strong>{index === 0 ? "Lead explorer" : `Sibling ${index}`}</strong>
                      {index === 0 ? <small>Uses the child age shown on the main form</small> : null}
                    </div>
                    {index > 0 ? (
                      <button className="text-button danger-button" type="button" onClick={() => setFamilyDraft((current) => current.filter((item) => item.id !== child.id))}>Remove</button>
                    ) : null}
                  </div>
                  <div className="profile-grid">
                    <label>
                      <span>Name or nickname</span>
                      <input value={child.name} placeholder={index === 0 ? "e.g. Maya" : "e.g. Leo"} maxLength={40} onChange={(event) => setFamilyDraft((current) => current.map((item) => item.id === child.id ? { ...item, name: event.target.value } : item))} />
                      {index > 0 ? <small className="field-help">Used by the family relay and family pages.</small> : null}
                    </label>
                    <label>
                      <span>Age</span>
                      <input type="number" min="3" max="14" value={child.age} onChange={(event) => {
                        const nextAge = sanitizeAge(event.target.valueAsNumber);
                        setFamilyDraft((current) => current.map((item) => item.id === child.id ? { ...item, age: nextAge, readingLevel: readingLevelForAge(nextAge) } : item));
                      }} />
                    </label>
                  </div>
                  <label>
                    <span>Reading level</span>
                    <select value={child.readingLevel} onChange={(event) => setFamilyDraft((current) => current.map((item) => item.id === child.id ? { ...item, readingLevel: event.target.value as FamilyChild["readingLevel"] } : item))}>
                      <option value="pre-reader">Pre-reader / read aloud</option>
                      <option value="early-reader">Early reader</option>
                      <option value="independent-reader">Independent reader</option>
                      <option value="confident-reader">Confident reader</option>
                    </select>
                  </label>
                  <div className="interest-editor">
                    <div className="interest-editor-heading">
                      <div>
                        <span className="profile-label">What does this child love?</span>
                        <small>Each interest becomes a real game lens, clue, or drawing mission.</small>
                      </div>
                      <span className="interest-count">{child.interests.length}/8</span>
                    </div>
                    <div className="interest-input-row">
                      <input
                        id={`interest-${child.id}`}
                        value={interestInputs[child.id] || ""}
                        placeholder="Type one, e.g. dinosaurs"
                        maxLength={32}
                        aria-label={`Add an interest for ${familyChildDisplayName(child, index)}`}
                        onChange={(event) => setInterestInputs((current) => ({ ...current, [child.id]: event.target.value }))}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === "," || event.key === ";") {
                            event.preventDefault();
                            addInterest(child.id);
                          }
                        }}
                      />
                      <button
                        className="icon-button interest-add-button"
                        type="button"
                        aria-label="Add interest"
                        title="Add interest"
                        disabled={!parseFamilyTags(interestInputs[child.id] || "").length || child.interests.length >= 8}
                        onClick={() => addInterest(child.id)}
                      >
                        <Plus size={17} />
                      </button>
                    </div>
                    <small className="field-help">Press Enter or tap + after each interest. Try the examples below.</small>
                    <small className="field-help">Brand names become original generic themes; official characters and logos are not generated.</small>
                    {child.interests.length ? (
                      <div className="interest-tag-list" aria-label="Saved interests">
                        {child.interests.map((interest) => (
                          <span className="interest-tag" key={interest}>
                            {interest}
                            <button type="button" aria-label={`Remove interest ${interest}`} onClick={() => removeInterest(child.id, interest)}>
                              <X size={12} />
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <div className="interest-suggestions" aria-label="Interest examples">
                      {["dinosaurs", "drawing", "trains", "animals", "space"].map((suggestion) => (
                        <button
                          className="interest-suggestion"
                          type="button"
                          key={suggestion}
                          disabled={child.interests.includes(suggestion) || child.interests.length >= 8}
                          onClick={() => addInterest(child.id, suggestion)}
                        >
                          + {suggestion}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="avoid-editor">
                    <div className="avoid-editor-heading">
                      <span className="profile-label">Things to avoid</span>
                      <small>Optional</small>
                    </div>
                    <div className="avoid-input-row">
                      <input
                        id={`avoid-${child.id}`}
                        value={avoidInputs[child.id] || ""}
                        placeholder="e.g. loud places"
                        maxLength={32}
                        aria-label={`Add something to avoid for ${familyChildDisplayName(child, index)}`}
                        onChange={(event) => setAvoidInputs((current) => ({ ...current, [child.id]: event.target.value }))}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === "," || event.key === ";") {
                            event.preventDefault();
                            addAvoid(child.id);
                          }
                        }}
                      />
                      <button
                        className="icon-button avoid-add-button"
                        type="button"
                        aria-label="Add thing to avoid"
                        title="Add thing to avoid"
                        disabled={!parseFamilyTags(avoidInputs[child.id] || "").length || child.avoid.length >= 8}
                        onClick={() => addAvoid(child.id)}
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                    {child.avoid.length ? (
                      <div className="avoid-tag-list" aria-label="Saved things to avoid">
                        {child.avoid.map((avoid) => (
                          <span className="avoid-tag" key={avoid}>
                            {avoid}
                            <button type="button" aria-label={`Remove thing to avoid ${avoid}`} onClick={() => removeAvoid(child.id, avoid)}>
                              <X size={11} />
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div>
                    <span className="profile-label">Favorite quest moves</span>
                    <div className="mechanic-picker">
                      {QUEST_MECHANICS.map((mechanic) => {
                        const selected = child.preferredMechanics.includes(mechanic);
                        return <button className={`mechanic-chip${selected ? " selected" : ""}`} type="button" key={mechanic} onClick={() => setFamilyDraft((current) => current.map((item) => item.id === child.id ? { ...item, preferredMechanics: selected ? item.preferredMechanics.filter((value) => value !== mechanic) : [...item.preferredMechanics, mechanic].slice(0, 4) } : item))}>{mechanicLabel(mechanic)}</button>;
                      })}
                    </div>
                  </div>
                </article>
              ))}
            </div>
            <div className="family-modal-actions">
              <button className="secondary-button" type="button" disabled={familyDraft.length >= 6} onClick={() => setFamilyDraft((current) => [...current, { id: `child-${Date.now()}`, name: `Sibling ${current.length}`, age: 7, readingLevel: "early-reader", interests: [], avoid: [], preferredMechanics: [] }])}>
                <Plus size={17} /> Add sibling
              </button>
              <button className="primary-button" type="button" onClick={() => void saveFamilyProfiles()}>
                <Check size={17} /> Save family
              </button>
            </div>
            {familyStatus ? <p className="checkout-note">{familyStatus}</p> : null}
          </section>
        </div>
      ) : null}
    </main>
  );
}
