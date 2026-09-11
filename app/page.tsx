"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  buildBooklet,
  getAgeBand,
  getDestinationProfile,
  sanitizeAge,
  sanitizeDays,
} from "./booklet";

const destinationSuggestions = [
  "Tokyo",
  "Kyoto",
  "Paris",
  "Singapore",
  "London",
  "Rome",
  "New York",
  "Sydney",
  "Bangkok",
  "Bali",
  "Seoul",
  "Amsterdam",
  "Dubai",
  "Hawaii",
  "Beach holiday",
  "Mountain camping",
  "Theme park",
  "Science museum",
];

export default function Home() {
  const [ageInput, setAgeInput] = useState("7");
  const [destination, setDestination] = useState("Tokyo");
  const [daysInput, setDaysInput] = useState("5");
  const [announcement, setAnnouncement] = useState(
    "Your booklet updates as you change the trip details.",
  );

  const age = sanitizeAge(Number(ageInput));
  const days = sanitizeDays(Number(daysInput));
  const destinationName = destination.trim() || "Your destination";
  const ageBand = getAgeBand(age);
  const destinationProfile = useMemo(
    () => getDestinationProfile(destinationName),
    [destinationName],
  );
  const booklet = useMemo(
    () => buildBooklet(age, destinationName, days),
    [age, destinationName, days],
  );

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAgeInput(String(age));
    setDaysInput(String(days));
    setAnnouncement(
      `Updated: ${days}-day ${destinationName} booklet for age ${age}.`,
    );
    document.getElementById("generated-booklet")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  return (
    <main className="app-shell">
      <section className="planner" aria-labelledby="planner-title">
        <div className="planner-copy">
          <p className="eyebrow">Trip activity builder</p>
          <h1 id="planner-title">Make a kid-ready travel booklet</h1>
          <p>
            Change the age, destination, or trip length and the booklet updates
            with place-specific discoveries and the right challenge level.
          </p>
        </div>

        <form className="trip-form" onSubmit={handleSubmit}>
          <label>
            <span>Kid age</span>
            <input
              min="3"
              max="14"
              inputMode="numeric"
              type="number"
              value={ageInput}
              onBlur={() => setAgeInput(String(age))}
              onChange={(event) => setAgeInput(event.target.value)}
            />
          </label>

          <label>
            <span>Destination</span>
            <input
              list="destination-suggestions"
              type="text"
              value={destination}
              onChange={(event) => setDestination(event.target.value)}
              placeholder="Paris, beach trip, Kyoto..."
            />
            <datalist id="destination-suggestions">
              {destinationSuggestions.map((suggestion) => (
                <option value={suggestion} key={suggestion} />
              ))}
            </datalist>
          </label>

          <label>
            <span>Days</span>
            <input
              min="1"
              max="14"
              inputMode="numeric"
              type="number"
              value={daysInput}
              onBlur={() => setDaysInput(String(days))}
              onChange={(event) => setDaysInput(event.target.value)}
            />
          </label>

          <div className="button-row">
            <button type="submit">Show my booklet</button>
            <button
              type="button"
              className="secondary"
              onClick={() => window.print()}
            >
              Print
            </button>
          </div>
          <p className="live-note" aria-live="polite">
            {announcement}
          </p>
        </form>
      </section>

      <section className="summary-band" aria-label="Generated trip summary">
        <div>
          <span className="summary-kicker">Destination</span>
          <strong>{destinationName}</strong>
        </div>
        <div>
          <span className="summary-kicker">Trip character</span>
          <strong>{destinationProfile.style}</strong>
        </div>
        <div>
          <span className="summary-kicker">Age {age} mode</span>
          <strong>{ageBand.label}</strong>
        </div>
        <div>
          <span className="summary-kicker">Booklet</span>
          <strong>{days} tailored days</strong>
        </div>
      </section>

      <section
        className="booklet"
        id="generated-booklet"
        aria-label={`Generated ${destinationName} booklet for age ${age}`}
      >
        <article className="cover page-card">
          <div className="ticket-art" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <p className="eyebrow">{destinationProfile.style}</p>
          <h2>{destinationName}</h2>
          <p>{destinationProfile.intro}</p>
          <p className="cover-age">
            Made for a {age}-year-old {ageBand.label.toLowerCase()}: {ageBand.pace}.
          </p>
          <div className="destination-highlights" aria-label="Booklet themes">
            <span>{destinationProfile.landmarks[0]}</span>
            <span>{destinationProfile.foods[0]}</span>
            <span>{destinationProfile.transport[0]}</span>
          </div>
          <div className="cover-grid">
            <div>
              <span>Name</span>
            </div>
            <div>
              <span>Trip dates</span>
            </div>
            <div>
              <span>Travel crew</span>
            </div>
          </div>
        </article>

        <article className="page-card kit-card">
          <p className="eyebrow">Made for age {age}</p>
          <h2>{ageBand.label} kit</h2>
          <ul className="check-list">
            {ageBand.kit.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <div className="tailoring-notes">
            <p className="note-line">
              <span>Challenge level</span>
              {ageBand.challenge} Plan about {ageBand.minutes} minutes a day.
            </p>
            <p className="note-line">
              <span>Local care clue</span>
              {destinationProfile.etiquette}
            </p>
          </div>
        </article>

        {booklet.map((plan) => (
          <article className="page-card day-card" key={plan.day}>
            <div className="day-header">
              <div>
                <p className="eyebrow">Day {plan.day}</p>
                <h2>{plan.theme}</h2>
              </div>
              <span className="focus-chip">{plan.focusLabel}</span>
            </div>
            <p className="mission">{plan.mission}</p>
            <div className="activity-list">
              {plan.activities.map((activity) => (
                <section className="activity" key={activity.title}>
                  <span>{activity.kind}</span>
                  <h3>{activity.title}</h3>
                  <p>{activity.body}</p>
                  <div className="write-line">{activity.prompt}</div>
                </section>
              ))}
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
