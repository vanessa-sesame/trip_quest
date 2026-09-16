"use client";

import { FormEvent, useMemo, useState } from "react";
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
  const [checkoutNote, setCheckoutNote] = useState("");
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
        "Memory Museum",
        "Certificate",
      ];
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
  const currentPage = clampPage(page, pageTitles.length);
  const currentPageLocked = isBookletPageLocked(currentPage);

  async function handleGenerate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextTrip = {
      age: sanitizeAge(age),
      destination: destination.trim(),
      days: sanitizeDays(days),
      itinerary: itinerary.slice(0, sanitizeDays(days)),
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
    setCheckoutNote("Preparing the print-quality pages…");
    try {
      const response = await fetch("/api/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          age: generatedBooklet.age,
          days: generatedBooklet.days,
          destination: generatedBooklet.destination,
          itinerary: generatedBooklet.itinerary,
        }),
      });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error || "The PDF could not be prepared.");
      }

      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") || "";
      const filename = disposition.match(/filename="([^"]+)"/i)?.[1]
        || `tripquest-${generatedBooklet.destination.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-age-${generatedBooklet.age}.pdf`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
      setCheckoutNote(
        "Your PDF is ready. Choose the TripQuest Library folder if your browser asks where to save it.",
      );
    } catch (error) {
      setCheckoutNote(
        error instanceof Error
          ? error.message
          : "The PDF could not be prepared. Please try again.",
      );
    } finally {
      setPdfState("idle");
    }
  }

  function changePage(direction: number) {
    setPage((value) => clampPage(value + direction, pageTitles.length));
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
          <button className="icon-button" type="button" aria-label="Saved booklets">
            <BookOpenCheck size={19} />
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
            <span className="step-count">1 / 3</span>
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
                  onClick={() => setAge((value) => Math.max(3, value - 1))}
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
                    if (Number.isFinite(value)) setAge(sanitizeAge(value));
                  }}
                />
                <span>years</span>
                <button
                  className="icon-button"
                  type="button"
                  aria-label="Increase age by one year"
                  disabled={age >= 14 || generationState === "generating"}
                  onClick={() => setAge((value) => Math.min(14, value + 1))}
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
                <span aria-hidden="true">•</span> {pageTitles.length} pages
              </p>
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

          <div className="document-stage">
            <button
              className="page-arrow previous"
              type="button"
              aria-label="Previous page"
              disabled={currentPage === 0}
              onClick={() => changePage(-1)}
            >
              <ChevronLeft size={22} />
            </button>

            <div className="paper-frame">
              {currentPageLocked ? (
                <LockedPreviewPage
                  pageNumber={currentPage + 1}
                  onUnlock={() => {
                    setCheckoutNote("");
                    setCheckoutOpen(true);
                  }}
                />
              ) : isSingaporeSample ? (
                <Image
                  src={`/booklets/singapore-age-${trip.age}-page-${currentPage + 1}.png`}
                  alt={`${pageTitles[currentPage]}, page ${currentPage + 1} of the Singapore booklet for age ${trip.age}`}
                  fill
                  priority={currentPage === 0}
                  sizes="(max-width: 760px) 300px, 330px"
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
              disabled={currentPage === pageTitles.length - 1}
              onClick={() => changePage(1)}
            >
              <ChevronRight size={22} />
            </button>
          </div>

          <div className="page-status">
            <strong>
              {currentPageLocked ? "Locked printable page" : pageTitles[currentPage]}
            </strong>
            <span>
              {currentPage + 1} / {pageTitles.length}
            </span>
          </div>

          <div className="thumbnail-strip" aria-label="Booklet pages">
            {pageTitles.map((pageTitle, index) => {
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
                  {isSingaporeSample && !locked ? (
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
              <strong>US$5.99</strong>
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
              <li><Check size={17} /> {generatedBooklet ? generatedBooklet.days * 2 + 5 : pageTitles.length + 1} high-resolution A4 pages</li>
              <li><Check size={17} /> {isSingaporeSample ? trip.days : trip.days * 2} itinerary-matched game pages</li>
              <li><Check size={17} /> Age-matched puzzles, tracing, art, and field games</li>
              <li><Check size={17} /> Grown-up answer notes</li>
              <li><Check size={17} /> Memory page and explorer certificate</li>
              <li><Check size={17} /> Print again for your own family</li>
            </ul>
            <div className="price-row">
              <span>One-time purchase</span>
              <strong>US$5.99</strong>
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
                ? "Preparing printable PDF…"
                : "Continue to secure checkout"}
            </button>
            {checkoutNote ? <p className="checkout-note">{checkoutNote}</p> : null}
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

  if (page === activityPages.length + 3) {
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
      <ActivityGame activity={activity} age={age} />
      <i>{activity.prompt}</i>
    </article>
  );
}
