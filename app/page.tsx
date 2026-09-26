"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Image from "next/image";
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
  enrichOfflinePreviewGameplay,
  type GeneratedBookletData,
  type GeneratedBookletProfile,
  isGeneratedBookletData,
} from "./lib/generation/booklet-ai";
import { ActivityGame } from "./components/activity-game";
import { DoodleCloud, DoodleMapPin, DoodleSparkle, DoodleStar } from "./components/doodles";
import { activityContext, bookletCorePageTitles, bookletDayPageEntries } from "./lib/booklet/pages";
import {
  GenerationStreamError,
  readGenerationResponse,
} from "./lib/generation/stream";
import {
  FULL_PREVIEW_FOR_TESTERS,
  isBookletPageLocked,
} from "./lib/booklet/preview";
import {
  defaultFamilyWorkspace,
  eventsToDailyPlans,
  eventTypeLabel,
  FAMILY_BADGES,
  familyChildDisplayName,
  familyRoleDescription,
  mechanicLabel,
  mechanicMissionPrompt,
  mechanicPlanForTrip,
  normalizeFamilyChildren,
  parseFamilyTags,
  parseItineraryText,
  QUEST_MECHANICS,
  readingLevelForAge,
  type FamilyChild,
  type ItineraryEvent,
} from "./lib/family";

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

function checkoutContext() {
  if (typeof window === "undefined") {
    return { state: "idle" as PaidDownloadState, sessionId: "", pdfUrl: "", note: "" };
  }
  const params = new URLSearchParams(window.location.search);
  const checkout = params.get("checkout");
  if (checkout === "cancelled") {
    return {
      state: "idle" as PaidDownloadState,
      sessionId: "",
      pdfUrl: "",
      note: "Payment was cancelled. Your booklet is still here whenever you are ready.",
    };
  }
  if (checkout !== "success") {
    return { state: "idle" as PaidDownloadState, sessionId: "", pdfUrl: "", note: "" };
  }
  const sessionId = params.get("session_id")?.trim() || "";
  if (!sessionId) {
    return {
      state: "error" as PaidDownloadState,
      sessionId: "",
      pdfUrl: "",
      note: "Payment returned without a checkout session. Please start checkout again or contact support.",
    };
  }
  return {
    state: "preparing" as PaidDownloadState,
    sessionId,
    pdfUrl: `/api/pdf?session_id=${encodeURIComponent(sessionId)}`,
    note: "Payment received. Preparing your PDF…",
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
  const initialCheckout = checkoutContext();
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
  const [checkoutNote, setCheckoutNote] = useState(initialCheckout.note);
  const [pdfState, setPdfState] = useState<"idle" | "generating">("idle");
  const [paidDownloadState, setPaidDownloadState] = useState<PaidDownloadState>(initialCheckout.state);
  const [paidPdfUrl] = useState(initialCheckout.pdfUrl);
  const [paidPdfObjectUrl, setPaidPdfObjectUrl] = useState("");
  const [checkoutSessionId] = useState(initialCheckout.sessionId);
  const autoDownloadAttempted = useRef(false);
  const generationInFlight = useRef(false);
  const resumeAttempted = useRef(false);
  const [generatedBooklet, setGeneratedBooklet] =
    useState<GeneratedBookletData | null>(null);
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
            setCheckoutNote("Payment received. Your PDF is ready. If it does not download automatically, use the button below.");
            if (!autoDownloadAttempted.current) {
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
  }, [checkoutSessionId, paidPdfUrl]);

  useEffect(() => () => {
    if (paidPdfObjectUrl) URL.revokeObjectURL(paidPdfObjectUrl);
  }, [paidPdfObjectUrl]);

  const destinationName = trip.destination.trim() || "Your destination";
  const destinationProfile = useMemo(
    () => generatedBooklet?.profile ?? getDestinationProfile(destinationName),
    [destinationName, generatedBooklet],
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
    [generatedBooklet, trip.age, destinationName, trip.days],
  );
  const pageTitles = bookletCorePageTitles(generatedDays);
  const familyPageTitles = [
    "Family relay & interest lens",
    "Family mission map",
    "Mission cards",
    "Badge tracker",
  ];
  const familyPageStart = pageTitles.length;
  const reportPageTitles = [...pageTitles, ...familyPageTitles];
  const outlineItems = generatedDays.map((day) => day.theme).map((title, index) => ({
    title:
      !FULL_PREVIEW_FOR_TESTERS && index > 0
        ? "Included in full booklet"
        : title,
    locked: !FULL_PREVIEW_FOR_TESTERS && index > 0,
  }));
  const currentPage = clampPage(page, reportPageTitles.length);
  const currentPageLocked = isBookletPageLocked(currentPage);
  const leadChild = children[0] || defaultFamilyWorkspace().children[0];
  const editionChildren = generatedBooklet?.family?.length
    ? generatedBooklet.family
    : children;
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
              payload = await readGenerationResponse(response, setGenerationMessage);
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
      itinerary: itinerary.slice(0, sanitizeDays(days)).map((plan, index) => {
        const imported = eventsToDailyPlans(structuredEvents, sanitizeDays(days))[index];
        return [plan.trim(), imported].filter(Boolean).join("; ").slice(0, 140);
      }),
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
    if (familyLoading || resumeAttempted.current || generatedBooklet) return;
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

  async function handlePdfDownload() {
    if (!generatedBooklet) {
      setCheckoutNote(
        "Create a custom AI booklet above before preparing its PDF. No charge was made.",
      );
      return;
    }

    setPdfState("generating");
    setCheckoutNote("Opening secure checkout…");
    try {
      const requestPayload = JSON.stringify({
        age: generatedBooklet.age,
        days: generatedBooklet.days,
        destination: generatedBooklet.destination,
        itinerary: generatedBooklet.itinerary,
        family: generatedBooklet.family || children,
        events: generatedBooklet.events || structuredEvents,
        editionFingerprint: generatedBooklet.editionFingerprint,
      });
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
            <p className="eyebrow">Printable keepsake</p>
            <h2>
              {paidDownloadState === "preparing"
                ? "Your payment went through."
                : paidDownloadState === "ready"
                  ? "Your booklet is ready."
                  : "Your payment is safe."
              }
            </h2>
            <p>{checkoutNote}</p>
          </div>
          {checkoutSessionId && paidPdfUrl && paidDownloadState !== "preparing" ? (
            <a className="unlock-button paid-download-link" href={paidPdfObjectUrl || paidPdfUrl} download="TripQuest-booklet.pdf">
              <Download size={18} />
              {paidDownloadState === "ready" ? "Download your PDF" : "Try download again"}
            </a>
          ) : (
            <LoaderCircle className="payment-result-loader spin" size={24} aria-label="Preparing PDF" />
          )}
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
                          [current[index] || "", importedPlans[index] || ""].filter(Boolean).join("; ").slice(0, 140),
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
                {generationMessage} A new place can take up to two minutes.
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
              <p className="eyebrow">{generatedBooklet ? "Your exact edition" : "Sample preview"}</p>
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
              {currentPageLocked ? (
                <LockedPreviewPage
                  key={`locked-${currentPage}`}
                  pageNumber={currentPage + 1}
                  onUnlock={() => {
                    setCheckoutNote("");
                    setCheckoutOpen(true);
                  }}
                />
              ) : currentPage >= familyPageStart ? (
                <FamilyPackPreviewPage
                  key={`family-${currentPage - familyPageStart}`}
                  destination={destinationName}
                  page={currentPage - familyPageStart}
                  explorers={editionChildren}
                  days={trip.days}
                  dayPlans={generatedDays}
                />
              ) : (
                <GeneratedPage
                  key={`generated-${currentPage}`}
                  age={trip.age}
                  destination={destinationName}
                  page={currentPage}
                  profile={destinationProfile}
                  days={generatedDays}
                />
              )}
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
            <strong>
              {currentPageLocked ? "Locked printable page" : reportPageTitles[currentPage]}
            </strong>
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
            {reportPageTitles.map((pageTitle, index) => {
              const locked = isBookletPageLocked(index);
              return (
                <button
                  className={`thumbnail${index === currentPage ? " active" : ""}${locked ? " locked" : ""}`}
                  key={`${pageTitle}-${index}`}
                  type="button"
                  aria-label={locked ? `Open locked page ${index + 1}` : `Open ${pageTitle}`}
                  aria-current={index === currentPage ? "page" : undefined}
                  onClick={() => setPage(index)}
                >
                  <span>{index + 1}</span>
                  {locked ? <LockKeyhole size={12} aria-hidden="true" /> : null}
                </button>
              );
            })}
          </div>

          <div className="purchase-bar">
            <div>
              <span>Printable A4 PDF</span>
              <strong>S$0.99</strong>
            </div>
            {paidDownloadState === "preparing" ? (
              <span className="payment-inline-status" role="status">
                <LoaderCircle className="spin" size={17} />
                Preparing PDF…
              </span>
            ) : paidDownloadState !== "idle" && paidPdfUrl ? (
              <a className="unlock-button paid-download-link" href={paidPdfObjectUrl || paidPdfUrl} download="TripQuest-booklet.pdf">
                <Download size={18} />
                {paidDownloadState === "ready" ? "Download your PDF" : "Try download again"}
              </a>
            ) : (
              <button
                className="unlock-button"
                type="button"
                onClick={() => {
                  setCheckoutNote("");
                  setCheckoutOpen(true);
                }}
              >
                <Download size={18} />
                Unlock download
              </button>
            )}
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
            <li className={item.locked ? "outline-item-locked" : undefined} key={`${index}-${item.title}`}>
              <span>{index + 1}</span>
              <strong>
                {item.locked ? <LockKeyhole size={13} aria-hidden="true" /> : null}
                {item.title}
              </strong>
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
            <p className="eyebrow">Printable keepsake</p>
            <h2 id="checkout-title">Unlock {destinationName} Explorer</h2>
            <p className="modal-subtitle">
              The complete age-{trip.age} booklet, ready to print before the trip.
            </p>
            <ul className="included-list">
              <li><Check size={17} /> {reportPageTitles.length} high-resolution A4 pages</li>
              <li><Check size={17} /> {trip.days * 3} itinerary-matched activity pages</li>
              <li><Check size={17} /> Age-matched puzzles, tracing, art, and field games</li>
              <li><Check size={17} /> Grown-up answer notes</li>
              <li><Check size={17} /> Memory page and explorer certificate</li>
              <li><Check size={17} /> Family relay, mission map, cards, badge tracker, and reward page</li>
              <li><Check size={17} /> Print again for your own family</li>
            </ul>
            <div className="price-row">
              <span>Early tester price</span>
              <strong>S$0.99</strong>
            </div>
            <button
              className="primary-button checkout-button"
              type="button"
              disabled={pdfState === "generating"}
              aria-busy={pdfState === "generating"}
              onClick={handlePdfDownload}
            >
              {pdfState === "generating" ? (
                <LoaderCircle className="spin" size={18} />
              ) : (
                <LockKeyhole size={18} />
              )}
              {pdfState === "generating"
                ? "Opening secure checkout…"
                : "Continue to secure payment"}
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

function LockedPreviewPage({
  pageNumber,
  onUnlock,
}: {
  pageNumber: number;
  onUnlock: () => void;
}) {
  return (
    <article className="generated-sheet locked-preview-page">
      <LockKeyhole size={30} aria-hidden="true" />
      <span>Full booklet</span>
      <h3>Page {pageNumber}</h3>
      <p>Included in the printable PDF</p>
      <button type="button" onClick={onUnlock}>
        <Download size={14} aria-hidden="true" />
        Unlock PDF
      </button>
    </article>
  );
}

function FamilyPackPreviewPage({
  destination,
  page,
  explorers,
  days,
  dayPlans,
}: {
  destination: string;
  page: number;
  explorers: FamilyChild[];
  days: number;
  dayPlans: Array<{
    day: number;
    theme: string;
    interestHook?: string;
    siblingMission?: string;
  }>;
}) {
  if (page === 0) {
    return (
      <article className="generated-sheet family-preview-sheet family-preview-relay" data-preview-page="family-relay">
        <span>Family relay &amp; interest lens</span>
        <h3>Every day gets a handoff</h3>
        <p>Interests and sibling roles appear on the day they matter, then move to a different child the next day.</p>
        <div className="family-relay-preview-list">
          {dayPlans.slice(0, 6).map((day) => (
            <div className="family-relay-preview-row" key={day.day}>
              <strong>DAY {day.day}</strong>
              <span>{day.theme}</span>
              <small>{day.interestHook || day.siblingMission || "Share one local discovery."}</small>
            </div>
          ))}
        </div>
        <small>{days} adventure days · roles change, the place stays shared</small>
      </article>
    );
  }

  if (page === 1) {
    return (
      <article className="generated-sheet family-preview-sheet family-map-preview" data-preview-page="family-map">
        <span>Family mission map</span>
        <h3>{destination} family explorers</h3>
        <p>Same place, different ways to notice it. Each explorer gets a role that matches their age and reading level.</p>
        <div className="family-preview-roles">
          {explorers.map((child, index) => (
            <div key={child.id}>
              <strong>{index === 0 ? "Lead · " : ""}{familyChildDisplayName(child, index)} · age {child.age}</strong>
              <span>{familyRoleDescription(child, index)}</span>
              {child.interests.length ? <small>Interest missions: {child.interests.slice(0, 3).join(", ")}</small> : null}
            </div>
          ))}
        </div>
        <small>{days} adventure days · share the place, not every answer</small>
      </article>
    );
  }

  if (page === 2) {
    const mechanicsByDay = mechanicPlanForTrip(explorers, days);
    const cards = Array.from({ length: 4 }, (_, index) => {
      const dayIndex = index % Math.max(1, dayPlans.length);
      const day = dayPlans[dayIndex] || { day: index + 1, theme: destination };
      const plan = mechanicsByDay[dayIndex]?.mechanics || ["spot" as const];
      const mechanic = plan[index % plan.length] || "spot";
      return {
        label: `DAY ${day.day} / ${mechanicLabel(mechanic).toUpperCase()}`,
        prompt: mechanicMissionPrompt(mechanic, day.theme),
      };
    });
    return (
      <article className="generated-sheet family-preview-sheet family-cards-preview" data-preview-page="mission-cards">
        <span>Mission cards</span>
        <h3>Pick a family spark</h3>
        <p>Use one card when the day needs a small, screen-free challenge.</p>
        <div className="family-preview-card-grid">
          {cards.map((card) => <div key={card.label}><strong>{card.label}</strong><span>{card.prompt}</span></div>)}
        </div>
      </article>
    );
  }

  return page === 3 ? (
    <article className="generated-sheet family-preview-sheet family-badges-preview" data-preview-page="badge-tracker">
      <span>Badge tracker</span>
      <h3>Collect the way you traveled</h3>
      <p>Give each explorer a tick, sticker, or tiny drawing when the family earns a badge.</p>
      <div className="family-preview-badges">
        {FAMILY_BADGES.map((badge) => <div key={badge}><b>OK</b><span>{badge}</span></div>)}
      </div>
    </article>
  ) : (
    <article className="generated-sheet family-preview-sheet family-cards-preview">
      <span>Mission cards</span>
      <h3>Pick a family spark</h3>
      <p>Use one card when the day needs a small, screen-free challenge.</p>
      <div className="family-preview-card-grid">
        {["Spot one tiny local detail.", "Draw a shape, texture, or pattern.", "Solve a clue, then find the evidence.", "Work together to tell one trip story."].map((card, index) => <div key={card}><strong>MISSION {index + 1}</strong><span>{card}</span></div>)}
      </div>
    </article>
  );
}

// Label prefix for the queue page's secret-target badge, keyed by
// QueueTargetKind. Purely presentational (never AI-authored), mirrors
// queueTargetKindCopy in app/lib/pdf/booklet-pdf.ts; an unexpected kind falls back
// to a neutral default rather than showing nothing.
const queueTargetKindPrefix: Record<string, string> = {
  shape: "Your secret shape:",
  colour: "Your secret colour:",
  object: "Your secret object:",
  sound: "Your secret sound:",
  person: "Who to spot:",
};

function GeneratedPage({
  age,
  destination,
  page,
  profile,
  days,
}: {
  age: number;
  destination: string;
  page: number;
  profile: GeneratedBookletProfile;
  days: ReturnType<typeof buildBooklet>;
}) {
  const activityPages = bookletDayPageEntries(days);

  if (page === 0) {
    return (
      <article className="generated-sheet generated-cover">
        <span>TripQuest Explorer Book</span>
        <p className="cover-subtitle">A trip made for curious hands</p>
        <h3>{destination}</h3>
        <p>{profile.style}</p>
        <div className="cover-stamps">
          <span className="jt-stamp">Age {age}</span>
          <span className="jt-stamp cover-stamp-days">{days.length === 1 ? "1 day" : `${days.length} days`}</span>
        </div>
        <div className="cover-motif" aria-hidden="true">
          <DoodleMapPin className="jt-doodle" />
          <DoodleStar className="jt-doodle" />
          <DoodleCloud className="jt-doodle" />
        </div>
        <div className="cover-sign-area">
          <p className="cover-section-label">Draw your explorer mark</p>
          <div className="cover-sign-box" />
        </div>
        <div className="cover-dates-area">
          <p className="cover-section-label">Trip dates</p>
          <div className="cover-dates-line" />
        </div>
        <div className="cover-tagline">
          <p className="cover-tagline-text">Pack a pencil. Notice everything.</p>
          <p className="cover-tagline-sub">Games, drawing spaces, local clues, and family missions made for this exact trip.</p>
        </div>
      </article>
    );
  }

  if (page === 1) {
    return (
      <article className="generated-sheet generated-guide">
        <span>A quick note for grown-ups</span>
        <h3>{getAgeBand(age).label}</h3>
        <p>{profile.intro}</p>
        <div>
          <strong>{getAgeBand(age).minutes} minutes</strong>
          <strong>{profile.word}</strong>
        </div>
        <h4>Local care clue</h4>
        <p>{profile.etiquette}</p>
        <h4>Using this booklet</h4>
        <p>What to bring: pencils or colored pencils, this booklet, and about {getAgeBand(age).minutes} unhurried minutes at each stop.</p>
        <p>How it works: a quick game while you wait in line, two hands-on games once you arrive, then a calm page to unwind after — no reading required until your child is ready.</p>
        <p className="guide-pitch">Real places become real adventures — that&apos;s the whole idea.</p>
      </article>
    );
  }

  if (page === activityPages.length + 2) {
    return (
      <article className="generated-sheet generated-guide generated-answer">
        <span>Grown-up answer notes</span>
        <h3>Keep this page tucked away</h3>
        <p>Use it after the child has had a proper go. Observation and imagination pages can have more than one good answer.</p>
        <div className="answer-preview-list">
          {days.slice(0, 5).map((day) => (
            <strong key={day.day}>Day {day.day}: {day.activities[0]?.title || "Open observation"}</strong>
          ))}
        </div>
      </article>
    );
  }

  if (page === activityPages.length + 3) {
    return (
      <article className="generated-sheet generated-memory">
        <span>Memory museum</span>
        <h3>{destination} moments worth keeping</h3>
        <p>Draw the details that made your family stop, laugh, taste, or look twice.</p>
        <div>
          <strong>Smallest detail</strong>
          <strong>Biggest surprise</strong>
          <strong>Kindest moment</strong>
          <strong>Most {destination}</strong>
        </div>
      </article>
    );
  }

  if (page === activityPages.length + 4) {
    return (
      <article className="generated-sheet generated-certificate">
        <span>Official TripQuest certificate</span>
        <h3>{destination} Explorer</h3>
        <p>Awarded for curious noticing and kind traveling.</p>
        <div aria-hidden="true" />
        <strong>Explorer name</strong>
      </article>
    );
  }

  const pageEntry = activityPages[page - 2];
  if (pageEntry.kind === "queue") {
    const { day } = pageEntry;
    const queue = day.slots.whileYouWait;
    // Surfaced here (the day's first activity page) rather than only on the
    // family-relay summary page near the back, which is the only place this
    // content used to appear.
    const cueText = day.interestHook || day.siblingMission;
    const reveal = day.slots.questReveal;
    return (
      <article className="generated-sheet generated-day generated-queue-page">
        <span>Day {day.day} · Before you go</span>
        {day.mission ? (
          <span className="queue-mission-pill">
            <b>Mission</b> {day.mission}
          </span>
        ) : null}
        <p className="grown-up-line">{day.slots.beforeYouGo}</p>
        {cueText ? (
          <p className="family-cue">
            <strong>Family lens</strong> {cueText}
          </p>
        ) : null}
        <p className="game-place">{day.landmark.display}</p>
        <h3>{day.theme}</h3>
        {reveal?.targetLabel ? (
          <p className="queue-target">
            <strong>{queueTargetKindPrefix[reveal.targetKind || ""] || "Your secret target:"}</strong>
            <span>{reveal.targetLabel.toUpperCase()}</span>
          </p>
        ) : null}
        {reveal?.bonusQuest ? (
          <p className="queue-bonus-quest">
            <strong>Bonus quest</strong> {reveal.bonusQuest}
          </p>
        ) : null}
        {/* With a queue game, its own page carries the instruction. */}
        <p className="game-instructions">{queue.gameType && queue.items ? queue.countLabel : queue.instruction}</p>
        <div className="queue-counter" aria-label={`${queue.countLabel}, up to ${queue.countTo}`}>
          {Array.from({ length: Math.min(20, queue.countTo) }, (_, index) => (
            <span key={index} aria-hidden="true" />
          ))}
        </div>
        {/* Facts move to the reveal page when there is one. */}
        {!reveal && day.slots.factCard.length === 3 ? (
          <section className="fact-card">
            <strong>Did you know?</strong>
            <ul>{day.slots.factCard.map((fact) => <li key={fact}>{fact}</li>)}</ul>
          </section>
        ) : null}
      </article>
    );
  }
  if (pageEntry.kind === "reveal") {
    const { day } = pageEntry;
    const reveal = day.slots.questReveal;
    if (!reveal) return null;
    return (
      <article className="generated-sheet generated-day generated-reveal-page">
        <span>Day {day.day} · At the destination</span>
        <h3>Found It!</h3>
        {reveal.photoPath ? (
          <div className="reveal-photo">
            <Image src={reveal.photoPath} alt="" fill sizes="(max-width: 760px) 340px, 400px" unoptimized />
          </div>
        ) : null}
        <p className="game-instructions">{reveal.revealText}</p>
        <section className="reveal-chat">
          <strong>Chat about it</strong>
          <ul>{reveal.chatPrompts.map((prompt) => <li key={prompt}>{prompt}</li>)}</ul>
        </section>
        {day.slots.factCard.length === 3 ? (
          <section className="fact-card">
            <strong>Did you know?</strong>
            <ul>{day.slots.factCard.map((fact) => <li key={fact}>{fact}</li>)}</ul>
          </section>
        ) : null}
        <p className="reveal-badge"><DoodleSparkle className="jt-doodle" />Quest complete</p>
        <div className="reveal-photo-box" aria-hidden="true">
          <span>Draw or stick a photo of your discovery here</span>
        </div>
      </article>
    );
  }
  const { activity, day } = pageEntry;
  const slot = pageEntry.kind === "queueGame" ? "queueGame" : pageEntry.slot;
  const kicker = slot === "queueGame" ? "While you wait" : slot === "sitDown" ? "Sit-down page" : "In the place";
  // One game per page, matching the printed A5 booklet page for page.
  return (
    <article className="generated-sheet generated-day generated-game-page">
      <span>Day {day.day} · {kicker}</span>
      <p className="game-place">{day.landmark.place}</p>
      <h3>{activity.title}</h3>
      {/* Spot-the-difference skips its intro, matching the printed page. */}
      {activity.body && activity.gameType !== "spot_the_difference" ? <p className="game-instructions">{activity.body}</p> : null}
      <ActivityGame activity={activity} age={age} context={activityContext(day, slot)} />
      {activity.gameType === "coloring" || !activity.prompt ? null : <i>{activity.prompt}</i>}
    </article>
  );
}
