import { writeFile } from "node:fs/promises";
import { createBookletPdf } from "../app/booklet-pdf.ts";
import { sampleGeneratedBooklet } from "../tests/fixtures/generated-booklet.ts";

const source = sampleGeneratedBooklet();
const dayPlans = source.dayPlans.slice(0, 2).map((day, index) => {
  const inThePlace = { ...day.activities[1], requiresPresence: true, answerMode: "open" as const };
  const sitDown = {
    ...day.activities[0],
    requiresPresence: false,
    answerMode: day.activities[0].gameType === "word_search" ? "closed" as const : "open" as const,
  };
  const landmark = index === 0
    ? { display: "Supertree Grove: Vertical Garden Giants", short: "the Supertrees", place: "Supertree Grove" }
    : { display: "Chinatown: Shophouse Colour Trail", short: "the shophouses", place: "Chinatown" };
  return {
    ...day,
    architectureVersion: 2 as const,
    landmark,
    slots: {
      beforeYouGo: index === 0
        ? "Grown-up: point out the tallest Supertree first."
        : "Grown-up: promise one close look at the windows.",
      whileYouWait: {
        title: "Count While You Wait",
        instruction: index === 0
          ? "How many giant tree shapes can you see?"
          : "Count the shuttered windows you can see.",
        countLabel: "I counted",
        countTo: 10,
        required: index === 0,
      },
      inThePlace,
      sitDown,
      factCard: index === 0
        ? [
            "The tallest Supertree is 50 metres high.",
            "Eighteen Supertrees stand across Gardens by the Bay.",
            "Some Supertrees collect solar energy for their lights.",
          ]
        : [],
    },
    activities: [inThePlace, sitDown],
  };
});

const booklet = {
  ...source,
  days: 2,
  itinerary: source.itinerary.slice(0, 2),
  dayPlans,
};
const pdf = await createBookletPdf(booklet);
await writeFile(new URL("../output/pdf/TripQuest-Five-Slot-Architecture-QA.pdf", import.meta.url), pdf);
