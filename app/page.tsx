"use client";

import { FormEvent, useMemo, useState } from "react";
import Image from "next/image";
import {
  BookOpenCheck,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
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
  sanitizeDays,
} from "./booklet";

type SupportedAge = 5 | 7;

type Trip = {
  age: SupportedAge;
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
];

const samplePageTitles: Record<SupportedAge, string[]> = {
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

function clampPage(page: number, pageCount: number) {
  return Math.max(0, Math.min(page, pageCount - 1));
}

export default function Home() {
  const [age, setAge] = useState<SupportedAge>(5);
  const [destination, setDestination] = useState("Singapore");
  const [days, setDays] = useState(5);
  const [trip, setTrip] = useState<Trip>({
    age: 5,
    destination: "Singapore",
    days: 5,
  });
  const [page, setPage] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutNote, setCheckoutNote] = useState("");
  const [announcement, setAnnouncement] = useState(
    "Singapore preview ready for age 5.",
  );

  const destinationName = trip.destination.trim() || "Your destination";
  const isSingaporeSample =
    destinationName.toLowerCase() === "singapore" && trip.days === 5;
  const destinationProfile = useMemo(
    () => getDestinationProfile(destinationName),
    [destinationName],
  );
  const generatedDays = useMemo(
    () => buildBooklet(trip.age, destinationName, trip.days),
    [trip.age, destinationName, trip.days],
  );
  const pageTitles = isSingaporeSample
    ? samplePageTitles[trip.age]
    : [
        "Cover",
        "Explorer guide",
        ...generatedDays.map((day) => day.theme),
        "Memory Museum",
        "Certificate",
      ];
  const outlineItems = isSingaporeSample
    ? samplePageTitles[trip.age].slice(2, 7)
    : generatedDays.map((day) => day.theme);
  const currentPage = clampPage(page, pageTitles.length);

  function handleGenerate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextTrip = {
      age,
      destination: destination.trim() || "Your destination",
      days: sanitizeDays(days),
    };
    setTrip(nextTrip);
    setDays(nextTrip.days);
    setPage(0);
    setAnnouncement(
      `${nextTrip.destination} preview ready for age ${nextTrip.age}.`,
    );
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

          <form className="trip-form" onSubmit={handleGenerate}>
            <label className="field-label" htmlFor="destination">
              Destination
            </label>
            <div className="input-shell">
              <MapPin size={19} aria-hidden="true" />
              <input
                id="destination"
                list="destination-options"
                value={destination}
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
              <div className="segmented-control">
                {([5, 7] as SupportedAge[]).map((option) => (
                  <button
                    className={age === option ? "segment active" : "segment"}
                    key={option}
                    onClick={() => setAge(option)}
                    type="button"
                    aria-pressed={age === option}
                  >
                    <UserRound size={17} />
                    {option} years
                  </button>
                ))}
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
                  disabled={days <= 1}
                  onClick={() => setDays((value) => Math.max(1, value - 1))}
                >
                  <Minus size={18} />
                </button>
                <output aria-live="polite">{days}</output>
                <button
                  className="icon-button"
                  type="button"
                  aria-label="Add one day"
                  disabled={days >= 14}
                  onClick={() => setDays((value) => Math.min(14, value + 1))}
                >
                  <Plus size={18} />
                </button>
              </div>
            </div>

            <div className="edition-note">
              <Sparkles size={18} aria-hidden="true" />
              <div>
                <strong>{age === 5 ? "Play & Draw" : "Clues & Stories"}</strong>
                <span>
                  {age === 5
                    ? "Grown-up reading, movement, matching, and big drawing spaces."
                    : "Short reading, real evidence, playful writing, and design challenges."}
                </span>
              </div>
            </div>

            <button className="primary-button" type="submit">
              <Sparkles size={19} />
              Create free preview
            </button>
            <p className="privacy-note">
              <ShieldCheck size={15} aria-hidden="true" />
              No child account required
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
              {isSingaporeSample ? (
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
              {currentPage > 2 && !fullscreen ? (
                <div className="preview-lock" aria-label="Page included in the paid PDF">
                  <LockKeyhole size={18} />
                  Included in printable PDF
                </div>
              ) : null}
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
            <strong>{pageTitles[currentPage]}</strong>
            <span>
              {currentPage + 1} / {pageTitles.length}
            </span>
          </div>

          <div className="thumbnail-strip" aria-label="Booklet pages">
            {pageTitles.map((pageTitle, index) => (
              <button
                className={index === currentPage ? "thumbnail active" : "thumbnail"}
                key={`${pageTitle}-${index}`}
                type="button"
                aria-label={`Open ${pageTitle}`}
                aria-current={index === currentPage ? "page" : undefined}
                onClick={() => setPage(index)}
              >
                {isSingaporeSample ? (
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
                {index > 2 ? <LockKeyhole size={12} aria-hidden="true" /> : null}
              </button>
            ))}
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
          <strong>{trip.age === 5 ? "Made to move, notice, and draw" : "Made to investigate, explain, and design"}</strong>
        </div>
        <ol>
          {outlineItems.map((item, index) => (
            <li key={item}>
              <span>{index + 1}</span>
              <strong>{item}</strong>
            </li>
          ))}
        </ol>
      </section>

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
              <li><Check size={17} /> {pageTitles.length} high-resolution A4 pages</li>
              <li><Check size={17} /> {trip.days} different daily missions</li>
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
              onClick={() =>
                setCheckoutNote("Checkout is not connected yet. No charge was made.")
              }
            >
              <LockKeyhole size={18} />
              Continue to secure checkout
            </button>
            {checkoutNote ? <p className="checkout-note">{checkoutNote}</p> : null}
          </section>
        </div>
      ) : null}
    </main>
  );
}

function GeneratedPage({
  age,
  destination,
  page,
  profile,
  days,
}: {
  age: SupportedAge;
  destination: string;
  page: number;
  profile: ReturnType<typeof getDestinationProfile>;
  days: ReturnType<typeof buildBooklet>;
}) {
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
        <p>{getAgeBand(age).challenge}</p>
        <div>
          <strong>{getAgeBand(age).minutes} minutes</strong>
          <strong>{profile.word}</strong>
        </div>
        <h4>Local care clue</h4>
        <p>{profile.etiquette}</p>
      </article>
    );
  }

  if (page === days.length + 2) {
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

  if (page === days.length + 3) {
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

  const day = days[page - 2];
  return (
    <article className="generated-sheet generated-day">
      <span>Day {day.day}</span>
      <h3>{day.theme}</h3>
      <p className="generated-mission">{day.mission}</p>
      {day.activities.slice(0, 2).map((activity) => (
        <div key={activity.title}>
          <small>{activity.kind}</small>
          <h4>{activity.title}</h4>
          <p>{activity.body}</p>
          <i>{activity.prompt}</i>
        </div>
      ))}
    </article>
  );
}
