"use client";

import { FormEvent, useMemo, useState } from "react";

type Activity = {
  title: string;
  kind: string;
  body: string;
  prompt: string;
};

type DayPlan = {
  day: number;
  theme: string;
  mission: string;
  activities: Activity[];
};

const destinationHints: Record<string, string[]> = {
  beach: ["shell shapes", "wave sounds", "sand patterns", "seabirds"],
  city: ["street signs", "public art", "tall buildings", "train sounds"],
  museum: ["tiny details", "favorite colors", "old objects", "quiet clues"],
  mountain: ["trail markers", "cloud shapes", "rocks", "tree textures"],
  park: ["leaf shapes", "benches", "bird calls", "flower colors"],
  theme: ["ride signs", "music", "costumes", "snack smells"],
};

const dayThemes = [
  "Arrival Detective",
  "Map Maker",
  "Sound Safari",
  "Taste Explorer",
  "Pattern Hunter",
  "Kindness Quest",
  "Memory Keeper",
  "Farewell Reporter",
];

function getAgeBand(age: number) {
  if (age <= 5) {
    return {
      label: "Little Explorer",
      pace: "short, sensory, grown-up assisted",
      challenge: "Draw it, spot it, choose a favorite.",
      minutes: "5-10",
    };
  }

  if (age <= 8) {
    return {
      label: "Junior Adventurer",
      pace: "playful clues and simple scoring",
      challenge: "Find patterns, compare things, ask one question.",
      minutes: "10-15",
    };
  }

  return {
    label: "Field Researcher",
    pace: "independent missions with creative evidence",
    challenge: "Interview, rank, decode, design, and report.",
    minutes: "15-25",
  };
}

function destinationClues(destination: string) {
  const normalized = destination.toLowerCase();
  const match = Object.entries(destinationHints).find(([key]) =>
    normalized.includes(key),
  );

  return match?.[1] ?? ["signs", "colors", "local food", "interesting doors"];
}

function makeActivity(
  day: number,
  age: number,
  destination: string,
  clue: string,
  theme: string,
): Activity[] {
  if (age <= 5) {
    return [
      {
        title: "I Spy Travel Squares",
        kind: "Game",
        body: `Find ${clue}, something round, something loud, and something that makes you smile in ${destination}.`,
        prompt: "Color one square for each thing you spot.",
      },
      {
        title: "Tiny Postcard",
        kind: "Draw",
        body: `Draw the best thing from day ${day}. A grown-up can write your caption.`,
        prompt: "My favorite thing was...",
      },
      {
        title: "Mood Meter",
        kind: "Reflect",
        body: `Point to how ${theme.toLowerCase()} felt today: sleepy, silly, brave, curious, or wow.`,
        prompt: "Circle a face and add one color.",
      },
    ];
  }

  if (age <= 8) {
    return [
      {
        title: "Scavenger Sprint",
        kind: "Game",
        body: `Score 1 point each for ${clue}, a map, a local snack, a funny sign, and a sound you do not hear at home.`,
        prompt: "Bonus: invent a team name for today.",
      },
      {
        title: "Two Truths and a Trip Tale",
        kind: "Story",
        body: `Write two true details about ${destination} and one silly made-up detail. See if someone can guess the silly one.`,
        prompt: "Truth, truth, trick.",
      },
      {
        title: "Souvenir Without Buying",
        kind: "Create",
        body: "Collect a rubbing, sketch, ticket stub, or new word as your memory souvenir.",
        prompt: "Tape or draw it here.",
      },
    ];
  }

  return [
    {
      title: "Field Notes Challenge",
      kind: "Research",
      body: `Observe ${destination} like a reporter. Record one clue about history, one about daily life, and one about nature or design.`,
      prompt: "What changed your mind today?",
    },
    {
      title: "Local Expert Interview",
      kind: "Talk",
      body: "Ask a guide, server, driver, or family member one respectful question about this place.",
      prompt: "Question asked / answer heard.",
    },
    {
      title: "Design a Better Trip Tool",
      kind: "Invent",
      body: `Invent an app, gadget, or rule that would make day ${day} easier or more fun for travelers.`,
      prompt: "Name it, sketch it, pitch it.",
    },
  ];
}

function buildBooklet(age: number, destination: string, days: number): DayPlan[] {
  const clues = destinationClues(destination);

  return Array.from({ length: days }, (_, index) => {
    const day = index + 1;
    const theme = dayThemes[index % dayThemes.length];
    const clue = clues[index % clues.length];

    return {
      day,
      theme,
      mission: `Today in ${destination}, your mission is to notice ${clue} and turn it into a story clue.`,
      activities: makeActivity(day, age, destination, clue, theme),
    };
  });
}

function sanitizeDays(value: number) {
  return Math.min(14, Math.max(1, Math.round(value || 1)));
}

function sanitizeAge(value: number) {
  return Math.min(14, Math.max(3, Math.round(value || 6)));
}

export default function Home() {
  const [age, setAge] = useState(7);
  const [destination, setDestination] = useState("Tokyo");
  const [days, setDays] = useState(5);
  const [submitted, setSubmitted] = useState({
    age: 7,
    destination: "Tokyo",
    days: 5,
  });

  const ageBand = getAgeBand(submitted.age);
  const booklet = useMemo(
    () =>
      buildBooklet(
        submitted.age,
        submitted.destination.trim() || "your destination",
        submitted.days,
      ),
    [submitted],
  );

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted({
      age: sanitizeAge(age),
      destination: destination.trim() || "your destination",
      days: sanitizeDays(days),
    });
  }

  return (
    <main className="app-shell">
      <section className="planner" aria-labelledby="planner-title">
        <div className="planner-copy">
          <p className="eyebrow">Trip activity builder</p>
          <h1 id="planner-title">Make a kid-ready travel booklet</h1>
          <p>
            Enter an age, destination, and number of days to generate daily
            games, drawing prompts, and little missions for the journey.
          </p>
        </div>

        <form className="trip-form" onSubmit={handleSubmit}>
          <label>
            <span>Kid age</span>
            <input
              min="3"
              max="14"
              type="number"
              value={age}
              onChange={(event) => setAge(Number(event.target.value))}
            />
          </label>

          <label>
            <span>Destination</span>
            <input
              type="text"
              value={destination}
              onChange={(event) => setDestination(event.target.value)}
              placeholder="Paris, beach trip, Kyoto..."
            />
          </label>

          <label>
            <span>Days</span>
            <input
              min="1"
              max="14"
              type="number"
              value={days}
              onChange={(event) => setDays(Number(event.target.value))}
            />
          </label>

          <div className="button-row">
            <button type="submit">Generate booklet</button>
            <button
              type="button"
              className="secondary"
              onClick={() => window.print()}
            >
              Print
            </button>
          </div>
        </form>
      </section>

      <section className="summary-band" aria-label="Generated trip summary">
        <div>
          <span className="summary-kicker">Destination</span>
          <strong>{submitted.destination}</strong>
        </div>
        <div>
          <span className="summary-kicker">Age mode</span>
          <strong>{ageBand.label}</strong>
        </div>
        <div>
          <span className="summary-kicker">Daily pace</span>
          <strong>{ageBand.minutes} min</strong>
        </div>
        <div>
          <span className="summary-kicker">Booklet size</span>
          <strong>{submitted.days} days</strong>
        </div>
      </section>

      <section className="booklet" aria-label="Generated booklet">
        <article className="cover page-card">
          <div className="ticket-art" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <p className="eyebrow">Travel game booklet</p>
          <h2>{submitted.destination}</h2>
          <p>
            Made for a {submitted.age}-year-old {ageBand.label.toLowerCase()}:
            {` ${ageBand.pace}.`}
          </p>
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
          <p className="eyebrow">Before you go</p>
          <h2>Explorer kit</h2>
          <ul className="check-list">
            <li>Something to draw with</li>
            <li>One envelope for paper treasures</li>
            <li>A tiny daily score goal</li>
            <li>A grown-up helper for questions</li>
          </ul>
          <p className="note-line">{ageBand.challenge}</p>
        </article>

        {booklet.map((plan) => (
          <article className="page-card day-card" key={plan.day}>
            <div className="day-header">
              <p className="eyebrow">Day {plan.day}</p>
              <h2>{plan.theme}</h2>
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
