"use client";

import { FormEvent, useEffect, useMemo, useState, type CSSProperties } from "react";
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
} from "./booklet";
import {
  type GeneratedBookletData,
  type GeneratedBookletProfile,
  isGeneratedBookletData,
} from "./booklet-ai";
import { ActivityGame } from "./activity-game";
import {
  GenerationStreamError,
  readGenerationResponse,
} from "./generation-stream";
import {
  FULL_PREVIEW_FOR_TESTERS,
  isBookletPageLocked,
} from "./booklet-preview";
import {
  defaultFamilyWorkspace,
  eventsToDailyPlans,
  eventTypeLabel,
  familyChildDisplayName,
  mechanicLabel,
  normalizeFamilyChildren,
  parseFamilyTags,
  parseItineraryText,
  QUEST_MECHANICS,
  readingLevelForAge,
  type FamilyChild,
  type ItineraryEvent,
} from "./family";

type SampleAge = 5 | 7;

type Trip = {
  age: number;
  destination: string;
  days: number;
};

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

const samplePageTitles: Record<SampleAge, string[]> = {
  5: [
    "Cover",
    "Grown-up guide",
    "Merlion Face Finder",
    "MRT Color Parade",
    "Hawker Rainbow Hunt",
    "Garden Move & Match",
    "Shophouse Shape Party",
    "Memory Gallery",
    "Certificate",
  ],
  7: [
    "Cover",
    "Grown-up guide",
    "Merlion Myth Lab",
    "MRT Route Codebreaker",
    "Hawker Centre Reporter",
    "Tropical City Engineer",
    "Neighborhood Pattern Archive",
    "Memory Museum",
    "Certificate",
  ],
};

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

function isSampleAge(value: number): value is SampleAge {
  return value === 5 || value === 7;
}

function clampPage(page: number, pageCount: number) {
  return Math.max(0, Math.min(page, pageCount - 1));
}

export default function Home() {
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
  const [checkoutNote, setCheckoutNote] = useState(() =>
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("checkout") === "cancelled"
      ? "Payment was cancelled. Your booklet is still here whenever you are ready."
      : "",
  );
  const [pdfState, setPdfState] = useState<"idle" | "generating">("idle");
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

  const destinationName = trip.destination.trim() || "Your destination";
  const sampleTitles = isSampleAge(trip.age)
    ? samplePageTitles[trip.age]
    : null;
  const isSingaporeSample =
    generatedBooklet === null &&
    destinationName.toLowerCase() === "singapore" &&
    trip.days === 5 &&
    sampleTitles !== null;
  const destinationProfile = useMemo(
    () => generatedBooklet?.profile ?? getDestinationProfile(destinationName),
    [destinationName, generatedBooklet],
  );
  const generatedDays = useMemo(
    () =>
      generatedBooklet?.dayPlans ??
      buildBooklet(trip.age, destinationName, trip.days),
    [generatedBooklet, trip.age, destinationName, trip.days],
  );
  const pageTitles = isSingaporeSample && sampleTitles
    ? sampleTitles.map((title, index) =>
        isBookletPageLocked(index) ? "Locked printable page" : title,
      )
    : [
        "Cover",
        "Explorer guide",
        ...generatedDays.flatMap((day) =>
          day.activities.slice(0, 2).map((activity) => activity.title),
        ),
        "Grown-up answer notes",
        "Memory Museum",
        "Certificate",
      ];
  const familyPageTitles = [
    "Family relay & interest lens",
    "Family mission map",
    "Mission cards",
    "Badge tracker",
  ];
  const familyPageStart = pageTitles.length;
  const reportPageTitles = [...pageTitles, ...familyPageTitles];
  const outlineItems = (isSingaporeSample && sampleTitles
    ? sampleTitles.slice(2, 7)
    : generatedDays.map((day) => day.theme)
  ).map((title, index) => ({
    title:
      !FULL_PREVIEW_FOR_TESTERS && index > 0
        ? "Included in full booklet"
        : title,
    locked: !FULL_PREVIEW_FOR_TESTERS && index > 0,
  }));
  const currentPage = clampPage(page, reportPageTitles.length);
  const currentPageLocked = isBookletPageLocked(currentPage);
  const leadChild = children[0] || defaultFamilyWorkspace().children[0];
  const familyInterests = [...new Set(children.flatMap((child) => child.interests))];

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

  async function handleGenerate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextTrip = {
      age: sanitizeAge(age),
      destination: destination.trim(),
      days: sanitizeDays(days),
      itinerary: itinerary.slice(0, sanitizeDays(days)).map((plan, index) => {
        const imported = eventsToDailyPlans(structuredEvents, sanitizeDays(days))[index];
        return [plan.trim(), imported].filter(Boolean).join("; ").slice(0, 140);
      }),
      family: children,
    };

    if (!nextTrip.destination) {
      setGenerationState("error");
      setGenerationError("Enter a city, region, or country first.");
      return;
    }

    setGenerationState("generating");
    setGenerationError("");
    setGenerationMessage("Looking for a saved edition…");
    setDays(nextTrip.days);

    try {
      let payload: unknown;
      const requestBody = JSON.stringify(nextTrip);

      for (let attempt = 0; attempt < 3; attempt += 1) {
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
          const canReconnect =
            error instanceof TypeError ||
            error instanceof SyntaxError ||
            (error instanceof GenerationStreamError && error.retryable);
          if (!canReconnect || attempt === 2) throw error;

          setGenerationMessage("Connection paused. Rejoining your saved work…");
          await new Promise((resolve) =>
            setTimeout(resolve, attempt === 0 ? 1_500 : 4_000),
          );
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
    } catch (error) {
      setGenerationState("error");
      setGenerationError(
        error instanceof Error &&
          !/load failed|failed to fetch|networkerror|live connection/i.test(
            error.message,
          )
          ? error.message
          : "The connection could not stay open after reconnecting. Please wait a moment and tap Create again; your saved work will resume.",
      );
    }
  }

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
        family: children,
        events: structuredEvents,
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
              <p className="eyebrow">Your preview</p>
              <h2 id="preview-title">{destinationName} Explorer</h2>
              <p>
                Age {trip.age} <span aria-hidden="true">•</span> {trip.days} days{" "}
                <span aria-hidden="true">•</span> {reportPageTitles.length} report pages
              </p>
              <small className="pack-summary">
                {children.length} explorer{children.length === 1 ? "" : "s"} · family mission map · cards · badge tracker
                {generatedBooklet && familyInterests.length ? ` · interests: ${familyInterests.slice(0, 2).join(", ")}` : ""}
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
                  pageNumber={currentPage + 1}
                  onUnlock={() => {
                    setCheckoutNote("");
                    setCheckoutOpen(true);
                  }}
                />
              ) : currentPage >= familyPageStart ? (
                <FamilyPackPreviewPage
                  destination={destinationName}
                  page={currentPage - familyPageStart}
                  explorers={children}
                  days={trip.days}
                  dayPlans={generatedDays}
                />
              ) : isSingaporeSample ? (
                <Image
                  src={`/booklets/singapore-age-${trip.age}-page-${currentPage + 1}.png`}
                  alt={`${reportPageTitles[currentPage]}, page ${currentPage + 1} of the Singapore booklet for age ${trip.age}`}
                  fill
                  priority={currentPage === 0}
                  sizes="(max-width: 760px) 340px, 400px"
                  unoptimized
                />
              ) : (
                <GeneratedPage
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
                  {isSingaporeSample && index < familyPageStart && !locked ? (
                    <Image
                      src={`/booklets/singapore-age-${trip.age}-page-${index + 1}.png`}
                      alt=""
                      fill
                      sizes="43px"
                      unoptimized
                    />
                  ) : (
                    <span>{index + 1}</span>
                  )}
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
              <li><Check size={17} /> {generatedBooklet ? generatedBooklet.days * 2 + 9 : reportPageTitles.length + 1} high-resolution A4 pages</li>
              <li><Check size={17} /> {isSingaporeSample ? trip.days : trip.days * 2} itinerary-matched game pages</li>
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
      <article className="generated-sheet family-preview-sheet family-preview-relay">
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
      <article className="generated-sheet family-preview-sheet family-map-preview">
        <span>Family mission map</span>
        <h3>{destination} family explorers</h3>
        <p>Same place, different ways to notice it. Each explorer gets a role that matches their age and reading level.</p>
        <div className="family-preview-roles">
          {explorers.map((child, index) => (
            <div key={child.id}>
              <strong>{index === 0 ? "Lead · " : ""}{familyChildDisplayName(child, index)} · age {child.age}</strong>
              <span>{child.age <= 5 ? "Point, find, count, or draw" : child.age <= 8 ? "Read clues and spot patterns" : "Compare, solve, and explain"}</span>
              {child.interests.length ? <small>Interest missions: {child.interests.slice(0, 3).join(", ")}</small> : null}
            </div>
          ))}
        </div>
        <small>{days} adventure days · share the place, not every answer</small>
      </article>
    );
  }

  if (page === 2) {
    const cards = [
      "Spot one tiny local detail.",
      "Draw a shape, texture, or pattern.",
      "Solve a clue, then find the real evidence.",
      "Work together to tell one trip story.",
    ];
    return (
      <article className="generated-sheet family-preview-sheet family-cards-preview">
        <span>Mission cards</span>
        <h3>Pick a family spark</h3>
        <p>Use one card when the day needs a small, screen-free challenge.</p>
        <div className="family-preview-card-grid">
          {cards.map((card, index) => <div key={card}><strong>MISSION {index + 1}</strong><span>{card}</span></div>)}
        </div>
      </article>
    );
  }

  return page === 3 ? (
    <article className="generated-sheet family-preview-sheet family-badges-preview">
      <span>Badge tracker</span>
      <h3>Collect the way you traveled</h3>
      <p>Give each explorer a tick, sticker, or tiny drawing when the family earns a badge.</p>
      <div className="family-preview-badges">
        {["Keen observer", "Kind traveler", "Pattern finder", "Team player", "Story keeper", "Route helper"].map((badge) => <div key={badge}><b>OK</b><span>{badge}</span></div>)}
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
  const activityPages = days.flatMap((day) =>
    day.activities.slice(0, 2).map((activity, activityIndex) => ({
      activity,
      activityIndex,
      day,
    })),
  );

  if (page === 0) {
    return (
      <article className="generated-sheet generated-cover">
        <span>TripQuest Explorer Book</span>
        <h3>{destination}</h3>
        <p>{profile.style}</p>
        <strong>Made especially for age {age}</strong>
        <div className="cover-motif" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </article>
    );
  }

  if (page === 1) {
    return (
      <article className="generated-sheet generated-guide">
        <span>Grown-up guide</span>
        <h3>{getAgeBand(age).label}</h3>
        <p>{profile.intro}</p>
        <div>
          <strong>{getAgeBand(age).minutes} minutes</strong>
          <strong>{profile.word}</strong>
        </div>
        <h4>Local care clue</h4>
        <p>{profile.etiquette}</p>
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

  const { activity, activityIndex, day } = activityPages[page - 2];
  return (
    <article className="generated-sheet generated-day generated-game-page">
      <span>Day {day.day} · Game {activityIndex + 1} of 2</span>
      <p className="game-place">{day.theme}</p>
      <h3>{activity.title}</h3>
      <small className="game-kind">{activity.kind}</small>
      <p className="game-instructions">{activity.body}</p>
      {activityIndex === 0 && (day.interestHook || day.siblingMission) ? (
        <div className="day-briefing" aria-label="Daily family briefing">
          {day.interestHook ? (
            <p>
              <strong>Interest lens</strong>
              <span>{day.interestHook}</span>
            </p>
          ) : null}
          {day.siblingMission ? (
            <p className="family-briefing-line">
              <strong>Family roles</strong>
              <span>{day.siblingMission}</span>
            </p>
          ) : null}
        </div>
      ) : null}
      <ActivityGame activity={activity} age={age} />
      <i>{activity.prompt}</i>
    </article>
  );
}
