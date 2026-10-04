// Fifty varied booklets for the matrix run (scripts/matrix-run.ts): every
// age from 3 to 14, trips of 1 to 7 days, destinations on every continent,
// open days, typed plans, pasted itinerary tables with travel days, single
// children and siblings, interests (including a brand) and avoid notes.

export type MatrixScenario = {
  name: string;
  destination: string;
  age: number;
  days: number;
  itinerary?: string[];
  pastedItinerary?: string;
  family?: Array<{ name: string; age: number; interests?: string[]; avoid?: string[] }>;
};

const table = (rows: string[][]) => ["| Date | Plan |", "|---|---|", ...rows.map(([date, plan]) => `| **${date}** | ${plan} |`)].join("\n");

export const matrixScenarios: MatrixScenario[] = [
  // Ages 3-4: colouring, matching, bingo, simple mazes.
  { name: "m01-singapore-3-1d", destination: "Singapore", age: 3, days: 1 },
  { name: "m02-tokyo-3-2d-trains", destination: "Tokyo", age: 3, days: 2, family: [{ name: "Kai", age: 3, interests: ["trains"] }] },
  { name: "m03-penang-3-3d-travel", destination: "Penang", age: 3, days: 3, pastedItinerary: table([
    ["Fri 6 Dec", "✈️ AirAsia AK6106 KL → Penang 09:10–10:05, check in at the hotel, pool time"],
    ["Sat 7 Dec", "🐒 Penang Hill funicular and The Habitat → Armenian Street murals"],
    ["Sun 8 Dec", "Breakfast → pack → ✈️ flight home 13:30"],
  ]) },
  { name: "m04-copenhagen-4-2d", destination: "Copenhagen", age: 4, days: 2, itinerary: ["Tivoli Gardens", "Nyhavn and the Little Mermaid"] },
  { name: "m05-bali-4-4d-siblings", destination: "Bali", age: 4, days: 4, family: [{ name: "Nia", age: 4 }, { name: "Ari", age: 8, interests: ["surfing"] }] },
  { name: "m06-dubai-4-1d-avoid", destination: "Dubai", age: 4, days: 1, family: [{ name: "Zara", age: 4, avoid: ["loud noises", "heights"] }] },
  // Ages 5-6: tracing, counting, word searches start at 6.
  { name: "m07-paris-5-3d", destination: "Paris", age: 5, days: 3 },
  { name: "m08-ipoh-5-4d-travel", destination: "Ipoh", age: 5, days: 4, pastedItinerary: table([
    ["Sat 10 Oct", "✈️ **Scoot TR484** Singapore → Ipoh **12:35–13:50**. Check in at the hotel"],
    ["Sun 11 Oct", "🌿 **Kek Lok Tong + gardens** in the morning → 🍜 **Old Town** for lunch → short Old Town wander / street art"],
    ["Mon 12 Oct", "🐯 **Lost World of Tambun** from around **11:00am**. Focus on animals and kids' rides"],
    ["Tue 13 Oct", "🥐 Breakfast → pack and enjoy the hotel a little → leave around **11:30am** → ✈️ **Scoot TR485** Ipoh → Singapore"],
  ]), family: [{ name: "Edwin", age: 5, interests: ["dinosaurs", "drawing"] }, { name: "Chris", age: 7, interests: ["space", "pokemon"] }] },
  { name: "m09-sydney-5-2d", destination: "Sydney", age: 5, days: 2, family: [{ name: "Ollie", age: 5, interests: ["sharks"] }] },
  { name: "m10-cape-town-5-3d", destination: "Cape Town", age: 5, days: 3, itinerary: ["Boulders Beach penguins", "Table Mountain cableway", ""] },
  { name: "m11-hong-kong-6-3d", destination: "Hong Kong", age: 6, days: 3 },
  { name: "m12-kyoto-6-2d-siblings", destination: "Kyoto", age: 6, days: 2, family: [{ name: "Mia", age: 6 }, { name: "Ren", age: 10, interests: ["samurai"] }] },
  { name: "m13-london-6-5d", destination: "London", age: 6, days: 5 },
  { name: "m14-mexico-city-6-2d", destination: "Mexico City", age: 6, days: 2, itinerary: ["Chapultepec Castle and park", "Frida Kahlo Museum in Coyoacan"] },
  // Ages 7-9: crosswords, word searches, codebreakers, quizzes.
  { name: "m15-rome-7-3d", destination: "Rome", age: 7, days: 3 },
  { name: "m16-seoul-7-4d-kpop", destination: "Seoul", age: 7, days: 4, family: [{ name: "Hana", age: 7, interests: ["k-pop", "drawing"] }] },
  { name: "m17-hanoi-7-2d", destination: "Hanoi", age: 7, days: 2 },
  { name: "m18-new-york-7-3d-bullets", destination: "New York", age: 7, days: 3, pastedItinerary: "- Day 1: Central Park Zoo and the carousel\n- Day 2: American Museum of Natural History\n- Day 3: Statue of Liberty ferry" },
  { name: "m19-lisbon-8-3d", destination: "Lisbon", age: 8, days: 3 },
  { name: "m20-cairo-8-2d", destination: "Cairo", age: 8, days: 2, itinerary: ["Pyramids of Giza and the Sphinx", "Egyptian Museum"] },
  { name: "m21-vancouver-8-4d-siblings", destination: "Vancouver", age: 8, days: 4, family: [{ name: "Leo", age: 8, interests: ["hockey"] }, { name: "Ava", age: 5 }] },
  { name: "m22-taipei-8-1d", destination: "Taipei", age: 8, days: 1 },
  { name: "m23-barcelona-9-3d", destination: "Barcelona", age: 9, days: 3 },
  { name: "m24-istanbul-9-2d", destination: "Istanbul", age: 9, days: 2 },
  { name: "m25-melbourne-9-5d-travel", destination: "Melbourne", age: 9, days: 5, pastedItinerary: table([
    ["Mon 2 Dec", "✈️ QF36 Singapore → Melbourne, arrive 21:00, check in"],
    ["Tue 3 Dec", "Melbourne Museum and the Royal Exhibition Building"],
    ["Wed 4 Dec", "Queen Victoria Market → State Library Victoria"],
    ["Thu 5 Dec", "Melbourne Zoo"],
    ["Fri 6 Dec", "Hotel breakfast, pack, ✈️ flight home 11:40"],
  ]) },
  { name: "m26-buenos-aires-9-2d-avoid", destination: "Buenos Aires", age: 9, days: 2, family: [{ name: "Tomas", age: 9, avoid: ["writing long answers"] }] },
  // Ages 10-11: harder puzzles, route planning, field journals.
  { name: "m27-amsterdam-10-3d", destination: "Amsterdam", age: 10, days: 3 },
  { name: "m28-edinburgh-10-2d", destination: "Edinburgh", age: 10, days: 2, itinerary: ["Edinburgh Castle and the Royal Mile", "Arthur's Seat hike"] },
  { name: "m29-marrakech-10-3d-siblings", destination: "Marrakech", age: 10, days: 3, family: [{ name: "Yasmin", age: 10 }, { name: "Omar", age: 6, interests: ["camels"] }] },
  { name: "m30-chiang-mai-10-4d", destination: "Chiang Mai", age: 10, days: 4 },
  { name: "m31-berlin-11-3d", destination: "Berlin", age: 11, days: 3 },
  { name: "m32-athens-11-2d-myths", destination: "Athens", age: 11, days: 2, family: [{ name: "Nico", age: 11, interests: ["greek myths", "minecraft"] }] },
  { name: "m33-nairobi-11-3d", destination: "Nairobi", age: 11, days: 3, itinerary: ["Nairobi National Park", "David Sheldrick elephant orphanage and Giraffe Centre", "Karura Forest"] },
  { name: "m34-osaka-11-1d", destination: "Osaka", age: 11, days: 1 },
  // Ages 12-14: sophisticated puzzles, design drawing, field writing.
  { name: "m35-vienna-12-3d", destination: "Vienna", age: 12, days: 3 },
  { name: "m36-lima-12-2d", destination: "Lima", age: 12, days: 2 },
  { name: "m37-san-francisco-12-4d-siblings", destination: "San Francisco", age: 12, days: 4, family: [{ name: "Sam", age: 12, interests: ["coding"] }, { name: "Jo", age: 9 }] },
  { name: "m38-reykjavik-12-6d", destination: "Reykjavik", age: 12, days: 6 },
  { name: "m39-prague-13-2d", destination: "Prague", age: 13, days: 2 },
  { name: "m40-jaipur-13-3d", destination: "Jaipur", age: 13, days: 3, itinerary: ["Amber Fort", "City Palace and Jantar Mantar", "Hawa Mahal and the bazaars"] },
  { name: "m41-auckland-13-3d-travel", destination: "Auckland", age: 13, days: 3, pastedItinerary: table([
    ["Thu 9 Jan", "✈️ NZ283 arrive 07:00 → check in → Sky Tower"],
    ["Fri 10 Jan", "Auckland Museum and the Domain"],
    ["Sat 11 Jan", "Pack, hotel breakfast, ✈️ flight to Queenstown 12:15"],
  ]) },
  { name: "m42-florence-14-2d", destination: "Florence", age: 14, days: 2 },
  { name: "m43-havana-14-3d", destination: "Havana", age: 14, days: 3 },
  { name: "m44-tokyo-14-7d", destination: "Tokyo", age: 14, days: 7 },
  // Mixed edge cases.
  { name: "m45-kuala-lumpur-6-1d-travel", destination: "Kuala Lumpur", age: 6, days: 1, pastedItinerary: "Arrive by train from Singapore at 14:00, check in, dinner near the hotel" },
  { name: "m46-venice-8-2d-siblings3", destination: "Venice", age: 8, days: 2, family: [{ name: "Ella", age: 8 }, { name: "Max", age: 4 }, { name: "Ivy", age: 12, interests: ["photography"] }] },
  { name: "m47-queenstown-9-3d-outdoors", destination: "Queenstown", age: 9, days: 3, family: [{ name: "Finn", age: 9, interests: ["bungy", "dinosaurs"], avoid: ["boats"] }] },
  { name: "m48-singapore-12-5d-custom", destination: "Singapore", age: 12, days: 5, itinerary: ["Gardens by the Bay", "", "Singapore Zoo", "Chinatown heritage trail", ""] },
  { name: "m49-paris-10-4d-travel", destination: "Paris", age: 10, days: 4, pastedItinerary: table([
    ["Day 1", "Eurostar from London, arrive 12:30, hotel check-in"],
    ["Day 2", "Louvre (Denon wing) then Tuileries"],
    ["Day 3", "Eiffel Tower and a Seine boat ride"],
    ["Day 4", "Hotel breakfast → Eurostar home 11:13"],
  ]) },
  { name: "m50-hokkaido-7-3d-snow", destination: "Sapporo", age: 7, days: 3, family: [{ name: "Yuki", age: 7, interests: ["snow", "ramen"] }] },
];
