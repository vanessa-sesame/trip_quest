export const gameTypes = [
  "coloring",
  "drawing",
  "crossword",
  "word_search",
  "maze",
  "matching",
  "bingo",
  "spot_the_difference",
  "codebreaker",
  "map_puzzle",
  "scavenger_hunt",
  "quiz",
  "story",
] as const;

export type GameType = (typeof gameTypes)[number];

// Game types whose PDF/preview layout needs the full page width to read
// cleanly (word_search's grid, crossword's grid+clue column, and
// scavenger_hunt's clue column all use fixed offsets that go near-zero at
// half a page's width) — forces a top/bottom split instead of side-by-side
// when either game in a pair is one of these.
export const wideOnlyGameTypes: GameType[] = [
  "word_search",
  "crossword",
  "scavenger_hunt",
];

// Eligible for the second in-place game, sharing the in-place page with the
// first. Excludes map_puzzle (shares a scarce once-per-booklet dedupe budget
// with inThePlace/sitDown, not worth spending on a third slot) and coloring
// (drawColoringActivityBoard's fixed ~313pt height band doesn't fit even a
// top/bottom half of the page, only a full page or the queue page's taller
// box).
export const pairEligibleGameTypes: GameType[] = gameTypes.filter(
  (gameType) => gameType !== "map_puzzle" && gameType !== "coloring",
);

// Eligible for the queue page's optional real game. That page is already
// full width and tall enough (~450-510pt) for every layout here, including
// coloring — only map_puzzle stays excluded, for the same dedupe-budget
// reason as above.
export const queueEligibleGameTypes: GameType[] = gameTypes.filter(
  (gameType) => gameType !== "map_puzzle",
);

export type GameItem = {
  label: string;
  clue: string;
};

export type Activity = {
  title: string;
  kind: string;
  body: string;
  prompt: string;
  gameType?: GameType;
  items?: GameItem[];
  illustrationPath?: string;
  requiresPresence?: boolean;
  answerMode?: "closed" | "open";
};

export type LandmarkNames = {
  display: string;
  short: string;
  place: string;
};

export type QueueTargetKind = "shape" | "colour" | "object" | "sound" | "person";

export type QueueSlot = {
  title: string;
  instruction: string;
  countLabel: string;
  countTo: number;
  required: boolean;
  // A real compact game a child can play without a table. Optional so that
  // older cached/purchased editions (generated before this existed) keep
  // rendering with the plain counting instruction above.
  gameType?: GameType;
  items?: GameItem[];
  // The mystery target shown as a badge on the queue page, and the category
  // used to pick its label prefix/accent color. Optional and paired with
  // DaySlots.questReveal below — both must be present for the two-page
  // mystery/reveal treatment; either missing falls back to today's plain
  // instruction-only page.
  targetLabel?: string;
  targetKind?: QueueTargetKind;
  bonusQuest?: string;
};

export type DaySlots = {
  beforeYouGo: string;
  whileYouWait: QueueSlot;
  inThePlace: Activity;
  // A second, different on-site observation game sharing the in-place page.
  // Optional for the same backward-compatibility reason as QueueSlot's game.
  inThePlaceSecond?: Activity;
  sitDown: Activity;
  factCard: string[];
  // The "Found it!" payoff page for whileYouWait's mystery target, shown
  // once the family has arrived. Optional/backward-compatible like the
  // fields above; only rendered as its own page when whileYouWait.targetLabel
  // is also present. photoPath is set post-generation (not by Kimi), the
  // same way Activity.illustrationPath is.
  questReveal?: {
    revealText: string;
    chatPrompts: [string, string];
    photoPath?: string;
  };
};

export type DayPlan = {
  architectureVersion?: 2;
  day: number;
  theme: string;
  focusLabel: string;
  mission: string;
  interestHook?: string;
  siblingMission?: string;
  landmark: LandmarkNames;
  slots: DaySlots;
  /** Backward-compatible alias. New renderers use slots. */
  activities: Activity[];
};

export type DestinationProfile = {
  id: string;
  aliases: string[];
  style: string;
  intro: string;
  clues: string[];
  landmarks: string[];
  foods: string[];
  transport: string[];
  sounds: string[];
  nature: string[];
  etiquette: string;
  word: string;
};

export type AgeBand = {
  label: string;
  pace: string;
  challenge: string;
  minutes: string;
  kit: string[];
};

type ProfileList = "clues" | "landmarks" | "foods" | "transport" | "sounds" | "nature";

type DayBlueprint = {
  theme: string;
  focusLabel: string;
  list: ProfileList;
};

const destinationProfiles: DestinationProfile[] = [
  {
    id: "tokyo",
    aliases: ["tokyo"],
    style: "Neon, neighborhoods & trains",
    intro: "A fast-moving city quest filled with tiny details, calm traditions, and clever design.",
    clues: ["a vending machine display", "a lantern or noren curtain", "a character mascot"],
    landmarks: ["a view of Tokyo Skytree or Tokyo Tower", "a shrine gate", "the busiest crossing you can find"],
    foods: ["a bowl of noodles", "a bento box", "a carefully shaped sweet"],
    transport: ["a color-coded train line", "a station sign", "people queueing neatly"],
    sounds: ["a station melody", "a crossing signal", "a quiet moment inside a busy place"],
    nature: ["a pocket garden", "a shaped pine tree", "a seasonal flower"],
    etiquette: "Practice a quiet train voice, queue carefully, and notice how shared spaces are kept tidy.",
    word: "konnichiwa (hello)",
  },
  {
    id: "kyoto",
    aliases: ["kyoto"],
    style: "Temples, gardens & craft",
    intro: "A slower Japanese adventure shaped by gardens, wooden streets, and living traditions.",
    clues: ["a red torii gate", "a kimono pattern", "a paper lantern"],
    landmarks: ["a temple roof", "a raked or mossy garden", "a traditional wooden machiya house"],
    foods: ["a matcha treat", "a seasonal sweet", "a bowl of udon"],
    transport: ["a local bus map", "a bicycle basket", "a station platform marker"],
    sounds: ["a temple bell", "sand or gravel underfoot", "water in a garden"],
    nature: ["bamboo", "moss", "a maple or cherry tree"],
    etiquette: "Use a calm voice at temples, follow photography signs, and never touch an offering.",
    word: "arigato (thank you)",
  },
  {
    id: "paris",
    aliases: ["paris"],
    style: "Bridges, art & bakeries",
    intro: "A walkable city adventure where ironwork, paintings, pastries, and river views become clues.",
    clues: ["a blue street sign", "a balcony with iron railings", "a sidewalk cafe chair"],
    landmarks: ["the Eiffel Tower from a new angle", "a bridge over the Seine", "a carved building doorway"],
    foods: ["a croissant", "a baguette", "a colorful market display"],
    transport: ["a Metro entrance", "a bicycle lane", "a boat on the Seine"],
    sounds: ["a Metro arrival", "cafe cups clinking", "a street musician"],
    nature: ["a clipped garden tree", "flowers in a window box", "a duck or boat wake on the Seine"],
    etiquette: "Begin with bonjour when entering a shop and keep voices gentle in museums and churches.",
    word: "merci (thank you)",
  },
  {
    id: "singapore",
    aliases: ["singapore"],
    style: "Gardens, hawker food & skylines",
    intro: "A tropical city quest mixing futuristic shapes, colorful neighborhoods, and many food traditions.",
    clues: ["a colorful shophouse", "the Merlion", "a sign in more than one language"],
    landmarks: ["Marina Bay's skyline", "Supertree shapes", "a covered five-foot way"],
    foods: ["kaya toast", "chicken rice", "a hawker centre tray"],
    transport: ["an MRT line color", "an orderly bus stop", "a pedestrian crossing countdown"],
    sounds: ["an MRT announcement", "food being cooked at a hawker stall", "tropical rain"],
    nature: ["an orchid", "a rain tree", "a monitor lizard or otter from a safe distance"],
    etiquette: "Return your tray where required, queue patiently, and leave plants and wildlife undisturbed.",
    word: "terima kasih (thank you in Malay)",
  },
  {
    id: "london",
    aliases: ["london"],
    style: "Royal symbols, river & red buses",
    intro: "A city detective game built from old-and-new architecture, famous transport, and river stories.",
    clues: ["a red post box", "a royal crown symbol", "a blue plaque"],
    landmarks: ["Big Ben's clock face", "a bridge across the Thames", "a palace or castle detail"],
    foods: ["fish and chips", "an afternoon tea treat", "a market snack"],
    transport: ["a red double-decker bus", "a Tube roundel", "a black cab"],
    sounds: ["a clock bell", "a Tube announcement", "a bus braking at a stop"],
    nature: ["a plane tree", "a city park pond", "flowers in a square"],
    etiquette: "Stand to the right on escalators, mind the gap, and wait your turn in queues.",
    word: "cheers (a friendly thank you)",
  },
  {
    id: "rome",
    aliases: ["rome", "roma"],
    style: "Ancient stones, fountains & piazzas",
    intro: "An open-air history hunt where old layers, lively squares, and food traditions meet.",
    clues: ["the letters SPQR", "a tiny street fountain", "a carved stone face"],
    landmarks: ["an ancient column", "a grand fountain", "a dome above the rooftops"],
    foods: ["a scoop of gelato", "a square slice of pizza", "a pasta shape you can name"],
    transport: ["a small city bus", "a scooter parked safely", "a cobbled walking route"],
    sounds: ["fountain water", "church bells", "voices echoing in a piazza"],
    nature: ["a stone pine", "an orange tree", "ivy on an old wall"],
    etiquette: "Respect barriers at ancient sites, cover up where signs request it, and use a quiet indoor voice.",
    word: "grazie (thank you)",
  },
  {
    id: "new-york",
    aliases: ["new york", "nyc", "manhattan", "brooklyn"],
    style: "Skyscrapers, neighborhoods & subway",
    intro: "A high-energy city mission full of vertical views, bold signs, and neighborhood personality.",
    clues: ["a yellow taxi", "a water tower", "a fire escape pattern"],
    landmarks: ["a skyscraper reflection", "a bridge cable pattern", "a wide view across a city park"],
    foods: ["a bagel", "a pizza slice", "a neighborhood bakery window"],
    transport: ["a subway mosaic", "a walk signal", "a ferry or city bus"],
    sounds: ["a subway rumble", "a crosswalk signal", "music spilling onto a sidewalk"],
    nature: ["a park squirrel from a distance", "a street tree guard", "a waterfront breeze"],
    etiquette: "Keep moving on busy sidewalks, let riders exit first, and follow crossing signals.",
    word: "borough (one of the city's five big areas)",
  },
  {
    id: "sydney",
    aliases: ["sydney"],
    style: "Harbour, beaches & bold architecture",
    intro: "A waterside adventure combining ferry routes, coastal nature, and unmistakable building shapes.",
    clues: ["a white sail shape", "a lifeguard flag", "an Aboriginal place name"],
    landmarks: ["the Sydney Opera House roofline", "the Harbour Bridge arch", "a headland view"],
    foods: ["a meat pie", "a lamington", "a waterside picnic snack"],
    transport: ["a green-and-yellow ferry", "a light rail stop", "a harbour walking path"],
    sounds: ["ferry horns", "cockatoo calls", "waves against rock"],
    nature: ["a eucalyptus tree", "a coastal rock pool", "a rainbow lorikeet"],
    etiquette: "Swim between the flags, protect yourself from the sun, and observe wildlife without feeding it.",
    word: "g'day (hello)",
  },
  {
    id: "bangkok",
    aliases: ["bangkok"],
    style: "River boats, markets & temple roofs",
    intro: "A bright, busy quest through waterways, food stalls, detailed roofs, and hidden calm spaces.",
    clues: ["a tuk-tuk", "a flower garland", "a golden roof detail"],
    landmarks: ["a temple roof silhouette", "a Chao Phraya river view", "a guardian figure"],
    foods: ["mango sticky rice", "a noodle dish", "a tropical fruit display"],
    transport: ["a river boat flag", "a Skytrain map", "a tuk-tuk color combination"],
    sounds: ["a river boat engine", "a market seller", "a temple bell"],
    nature: ["a lotus flower", "a banana leaf", "a monitor lizard from a safe distance"],
    etiquette: "Dress and speak respectfully at temples, remove shoes where asked, and never touch offerings.",
    word: "sawasdee (hello)",
  },
  {
    id: "bali",
    aliases: ["bali"],
    style: "Rice fields, temples & island craft",
    intro: "An island discovery trail shaped by water, carved gates, ceremonies, and tropical landscapes.",
    clues: ["a split temple gate", "a woven offering basket", "a carved stone pattern"],
    landmarks: ["a rice terrace", "a temple courtyard", "a black-sand or golden beach view"],
    foods: ["nasi goreng", "satay", "a tropical fruit you have not tried"],
    transport: ["a decorated local vehicle", "a scooter parking area", "a narrow path through rice fields"],
    sounds: ["gamelan music", "geckos after dark", "water moving through a rice field"],
    nature: ["a frangipani flower", "a rice plant", "a banyan tree"],
    etiquette: "Step around offerings, dress respectfully at temples, and ask before photographing people.",
    word: "terima kasih (thank you)",
  },
  {
    id: "seoul",
    aliases: ["seoul"],
    style: "Palaces, Hangul & city energy",
    intro: "A layered city quest combining palace geometry, modern neighborhoods, and mountain views.",
    clues: ["a Hangul sign", "a hanbok color combination", "a tiled roof end"],
    landmarks: ["a palace gate", "a hanok roofline", "a city view with mountains behind it"],
    foods: ["kimbap", "a market pancake", "a colorful side-dish spread"],
    transport: ["a numbered subway exit", "a color-coded subway line", "a bus stop screen"],
    sounds: ["a subway arrival tune", "market cooking sounds", "a palace courtyard footstep"],
    nature: ["a gingko tree", "a stream through the city", "a mountain trail marker"],
    etiquette: "Offer and receive things with two hands when appropriate, queue neatly, and keep transit voices low.",
    word: "annyeonghaseyo (hello)",
  },
  {
    id: "amsterdam",
    aliases: ["amsterdam"],
    style: "Canals, bicycles & narrow houses",
    intro: "A waterside pattern hunt through bridge shapes, tilting facades, and bicycle-filled streets.",
    clues: ["a canal-house gable", "a bridge number", "a bicycle bell"],
    landmarks: ["a row of narrow canal houses", "a lifting bridge", "a windmill shape"],
    foods: ["a stroopwafel", "a cone of fries", "a market cheese display"],
    transport: ["a tram number", "a bicycle traffic light", "a canal boat"],
    sounds: ["bicycle bells", "a tram chime", "water against a canal wall"],
    nature: ["a canal bird", "tulips or seasonal bulbs", "an elm tree beside the water"],
    etiquette: "Stay out of bicycle lanes, cross only after checking both ways, and keep canal edges at a safe distance.",
    word: "dank je (thank you)",
  },
  {
    id: "dubai",
    aliases: ["dubai"],
    style: "Desert, towers & global city life",
    intro: "A contrast-filled adventure from geometric skylines and metro views to desert textures and old waterways.",
    clues: ["an Arabic-and-English sign", "a geometric screen pattern", "a dhow boat"],
    landmarks: ["the Burj Khalifa silhouette", "a wind-tower detail", "a creek or marina view"],
    foods: ["a date", "a flatbread", "a spice-market color"],
    transport: ["a driverless Metro view", "an abra boat", "a shaded walkway"],
    sounds: ["water beside an abra", "a Metro announcement", "wind moving across sand"],
    nature: ["a date palm", "a desert plant", "a sand pattern made by wind"],
    etiquette: "Dress respectfully in cultural spaces, ask before photographing people, and follow heat-safety advice.",
    word: "marhaba (hello)",
  },
  {
    id: "hawaii",
    aliases: ["hawaii", "honolulu", "oahu", "maui", "kauai"],
    style: "Ocean, volcanoes & island culture",
    intro: "An island nature quest built around powerful landscapes, local stories, and care for the ocean.",
    clues: ["a Hawaiian place name", "a lei or flower pattern", "a surfboard design"],
    landmarks: ["a volcanic ridge", "a wide ocean horizon", "a historic fishpond or harbor"],
    foods: ["shave ice", "a tropical fruit", "a local plate lunch"],
    transport: ["a beach path", "an island bus sign", "a canoe or surf route"],
    sounds: ["waves on different shorelines", "a ukulele", "wind through palm leaves"],
    nature: ["volcanic rock", "a hibiscus flower", "a sea turtle from a respectful distance"],
    etiquette: "Respect warning signs, never touch marine life, and learn whose land and stories you are visiting.",
    word: "mahalo (thank you)",
  },
  {
    id: "theme-park",
    aliases: ["disney", "theme park", "universal studios", "legoland"],
    style: "Rides, stories & spectacular details",
    intro: "A playful park mission that turns queues, themed lands, and ride design into a family game.",
    clues: ["a hidden character detail", "a costume texture", "a sign that tells a story"],
    landmarks: ["the park's biggest icon", "a themed entrance", "a ride vehicle with an unusual shape"],
    foods: ["a character-shaped snack", "a treat with surprising colors", "a snack your group can rate"],
    transport: ["a park train or shuttle", "a moving walkway", "the cleverest queue route"],
    sounds: ["a ride launch sound", "music that changes by land", "a crowd cheer"],
    nature: ["a garden hiding part of a building", "shade trees in a queue", "a water feature"],
    etiquette: "Follow ride rules, stay with your group, and make space for younger or slower guests.",
    word: "imagineer (a person who combines imagination and engineering)",
  },
  {
    id: "beach",
    aliases: ["beach", "seaside", "coast", "island holiday"],
    style: "Waves, shore life & sand",
    intro: "A shoreline nature booklet filled with changing tides, textures, colors, and safe ocean play.",
    clues: ["three different shell shapes", "a trail in the sand", "a lifeguard or safety flag"],
    landmarks: ["the curve of the shoreline", "a jetty or headland", "the highest safe viewpoint"],
    foods: ["a cold seaside snack", "a picnic fruit", "a local fish or plant-based dish"],
    transport: ["a boardwalk", "a beach bicycle", "a boat viewed from shore"],
    sounds: ["three kinds of wave sounds", "a seabird call", "wind moving something"],
    nature: ["a tide-pool creature without touching", "seaweed colors", "a dune plant"],
    etiquette: "Check swimming signs, leave shells and wildlife where they belong, and take every piece of rubbish with you.",
    word: "tide (the ocean's regular rise and fall)",
  },
  {
    id: "mountain",
    aliases: ["mountain", "hiking", "national park", "camping", "alps"],
    style: "Trails, wildlife & big views",
    intro: "An outdoor field guide made for noticing tracks, weather, landforms, and changing trail textures.",
    clues: ["a trail marker", "three rock colors", "an animal track or sign"],
    landmarks: ["a ridgeline silhouette", "a lookout view", "a stream crossing or waterfall"],
    foods: ["a trail snack", "a local berry or fruit", "a warm post-walk dish"],
    transport: ["a switchback path", "a trail map symbol", "a cable car, shuttle, or footbridge"],
    sounds: ["wind at two elevations", "moving water", "a bird call"],
    nature: ["a tree that changes with altitude", "lichen on a rock", "a cloud touching a peak"],
    etiquette: "Stay on marked trails, keep wildlife wild, carry rubbish out, and let the weather set the pace.",
    word: "summit (the highest point of a mountain)",
  },
  {
    id: "museum",
    aliases: ["museum", "gallery", "science centre", "science center"],
    style: "Objects, stories & curious questions",
    intro: "An indoor investigation that makes exhibits, labels, materials, and big ideas into game clues.",
    clues: ["the smallest displayed object", "an object older than your grown-up", "a label with a surprising word"],
    landmarks: ["the room's largest object", "a dramatic staircase or ceiling", "the exhibit you would put on a postcard"],
    foods: ["a food shown in an artwork or exhibit", "a cafe item linked to the museum", "a historic eating tool"],
    transport: ["an old vehicle", "a route through three galleries", "a lift or ramp that changes your view"],
    sounds: ["the quietest gallery", "an interactive exhibit sound", "footsteps on two floor materials"],
    nature: ["an animal, plant, or landscape in the collection", "a natural material", "a pattern borrowed from nature"],
    etiquette: "Use quiet voices, follow touch and photography signs, and give other visitors room to look.",
    word: "curator (a person who cares for and interprets a collection)",
  },
];

const dayBlueprints: DayBlueprint[] = [
  { theme: "Hello, Destination!", focusLabel: "First look", list: "clues" },
  { theme: "Landmark Lab", focusLabel: "Shapes & stories", list: "landmarks" },
  { theme: "Taste Detective", focusLabel: "Food clues", list: "foods" },
  { theme: "Move Like a Local", focusLabel: "Getting around", list: "transport" },
  { theme: "Destination Soundtrack", focusLabel: "Listen closely", list: "sounds" },
  { theme: "Wild Side", focusLabel: "Nature watch", list: "nature" },
  { theme: "Culture & Kindness", focusLabel: "Travel respectfully", list: "clues" },
  { theme: "Memory Maker", focusLabel: "Best moments", list: "landmarks" },
  { theme: "Pattern Patrol", focusLabel: "Look again", list: "clues" },
  { theme: "Menu Designer", focusLabel: "Taste & create", list: "foods" },
  { theme: "Route Builder", focusLabel: "Map challenge", list: "transport" },
  { theme: "Sound Collector", focusLabel: "Audio postcard", list: "sounds" },
  { theme: "Nature Reporter", focusLabel: "Outdoor evidence", list: "nature" },
  { theme: "Best of the Trip", focusLabel: "Final edition", list: "landmarks" },
];

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export function sanitizeDays(value: number) {
  return Math.min(14, Math.max(1, Math.round(Number.isFinite(value) ? value : 1)));
}

export function sanitizeAge(value: number) {
  return Math.min(14, Math.max(3, Math.round(Number.isFinite(value) ? value : 7)));
}

export function getAgeBand(age: number): AgeBand {
  const safeAge = sanitizeAge(age);

  if (safeAge <= 5) {
    return {
      label: "Little Explorer",
      pace: "short, sensory, and grown-up assisted",
      challenge: "Point, count, move, draw, and tell the story out loud.",
      minutes: "5-10",
      kit: ["Thick crayons or washable markers", "A grown-up clue reader", "One envelope for paper treasures", "A favorite travel comfort item"],
    };
  }

  if (safeAge <= 8) {
    return {
      label: "Curious Navigator",
      pace: "playful clues, simple reading, and score keeping",
      challenge: "Hunt for details, earn points, sketch maps, and compare discoveries.",
      minutes: "10-15",
      kit: ["Pencil and colored markers", "A small clipboard or firm book", "An envelope for tickets and labels", "A family teammate for bonus rounds"],
    };
  }

  if (safeAge <= 11) {
    return {
      label: "Travel Investigator",
      pace: "independent observation, questions, and creative evidence",
      challenge: "Investigate patterns, record evidence, interview, rank, and explain.",
      minutes: "15-20",
      kit: ["Pen, pencil, and highlighter", "A pocket map", "A safe camera with permission", "A small daily spending calculator"],
    };
  }

  return {
    label: "Young Correspondent",
    pace: "self-directed field notes, design thinking, and mini reporting",
    challenge: "Photograph with permission, analyze, fact-check, design, and publish a point of view.",
    minutes: "20-30",
    kit: ["Notebook and reliable pen", "Phone or camera with family rules", "Offline map or saved route", "A small budget for one chosen tasting"],
  };
}

export function getDestinationProfile(destination: string): DestinationProfile {
  const name = destination.trim() || "your destination";
  const normalized = normalize(name);
  const match = destinationProfiles.find((profile) =>
    profile.aliases.some((alias) => normalized.includes(alias)),
  );

  if (match) {
    return match;
  }

  return {
    id: "discovery",
    aliases: [],
    style: "Local discovery mission",
    intro: `A made-for-${name} quest that turns the real details your family finds into the game.`,
    clues: [`a symbol people connect with ${name}`, "a color that keeps appearing", "a sign made for local people"],
    landmarks: [`a place where people gather in ${name}`, "a building or landscape locals recognize", `the view that best says "${name}"`],
    foods: [`a food made or loved in ${name}`, "an ingredient you do not often eat at home", "a market, bakery, or food-stall display"],
    transport: [`the way people move around ${name}`, "a route symbol or stop name", "a vehicle or path different from home"],
    sounds: [`a sound that belongs to ${name}`, "a local announcement or greeting", "the quietest sound you can find"],
    nature: [`a plant, animal, or landform in ${name}`, "a clue about the local weather", "a natural texture or color"],
    etiquette: `Notice one way people show care or respect in ${name}; follow local signs and your grown-up's lead.`,
    word: "a useful local word or place name",
  };
}

function makeMission(
  day: number,
  destination: string,
  profile: DestinationProfile,
  blueprint: DayBlueprint,
  primary: string,
  secondary: string,
) {
  if (blueprint.theme === "Culture & Kindness") {
    return `Day ${day} in ${destination}: ${profile.etiquette} Look for ${primary} while you practice.`;
  }

  if (blueprint.theme === "Memory Maker" || blueprint.theme === "Best of the Trip") {
    return `Day ${day} in ${destination}: revisit ${primary}, compare it with ${secondary}, and choose the detail your family should remember.`;
  }

  return `Day ${day} in ${destination}: discover ${primary}. Keep watch for ${secondary} and collect proof for your booklet.`;
}

type ChallengeMode =
  | "hunt"
  | "draw"
  | "story"
  | "score"
  | "map"
  | "move"
  | "taste"
  | "sound"
  | "nature"
  | "kindness"
  | "interview"
  | "design"
  | "memory"
  | "report";

type ActivityContext = {
  destination: string;
  profile: DestinationProfile;
  primary: string;
  secondary: string;
};

type ActivityConcept = {
  title: string;
  kind: string;
  mode: ChallengeMode;
  task: (context: ActivityContext) => string;
  prompt: string;
};

const creativeActivityDecks: ActivityConcept[][] = [
  [
    {
      title: "Arrival Bingo",
      kind: "Bingo",
      mode: "hunt",
      task: ({ primary, secondary }) =>
        `Turn ${primary}, ${secondary}, and one completely unexpected detail into your first bingo row.`,
      prompt: "My surprise square was...",
    },
    {
      title: "Tiny Detail Detective",
      kind: "Mystery",
      mode: "hunt",
      task: ({ destination, primary }) =>
        `Pick the tiniest interesting detail near ${primary}. Hide it in a clue for someone else visiting ${destination}.`,
      prompt: "Clue one / clue two / answer",
    },
    {
      title: "Passport Stamp Studio",
      kind: "Art",
      mode: "draw",
      task: ({ destination, primary }) =>
        `Invent a passport stamp for ${destination} using a shape or pattern borrowed from ${primary}.`,
      prompt: "Stamp name / symbol / date",
    },
  ],
  [
    {
      title: "Silhouette Snap",
      kind: "Memory",
      mode: "draw",
      task: ({ primary }) =>
        `Study the outline of ${primary} for ten seconds, turn away, and rebuild the silhouette from memory.`,
      prompt: "What shape was hardest to remember?",
    },
    {
      title: "Time-Travel Plaque",
      kind: "Story",
      mode: "story",
      task: ({ primary }) =>
        `Pretend ${primary} can talk. Give it one memory from long ago and one prediction about its future.`,
      prompt: "I remember... / One day...",
    },
    {
      title: "Build It Better",
      kind: "Invent",
      mode: "design",
      task: ({ destination, primary, secondary }) =>
        `Redesign ${primary} for ${destination}, borrowing one clever feature from ${secondary}.`,
      prompt: "Keep / change / add",
    },
  ],
  [
    {
      title: "Flavor Detective",
      kind: "Taste",
      mode: "taste",
      task: ({ primary }) =>
        `With grown-up permission, investigate ${primary} using color, smell, texture, temperature, and taste as clues.`,
      prompt: "The clue that surprised me was...",
    },
    {
      title: "Menu Mash-Up",
      kind: "Imagine",
      mode: "design",
      task: ({ destination, primary }) =>
        `Pair ${primary} with a food from home and invent a new dish that could only exist on this ${destination} trip.`,
      prompt: "Dish name / ingredients / menu description",
    },
    {
      title: "Snack Awards",
      kind: "Judge",
      mode: "score",
      task: ({ primary, secondary }) =>
        `Put ${primary} and ${secondary} head-to-head for color, smell, texture, bravery, and would-eat-again power.`,
      prompt: "The winner is... because...",
    },
  ],
  [
    {
      title: "Transit Codebreaker",
      kind: "Decode",
      mode: "hunt",
      task: ({ destination, primary }) =>
        `Decode the colors, numbers, arrows, and symbols around ${primary}. Work out what a first-time visitor to ${destination} must notice.`,
      prompt: "Symbol / meaning / how I checked",
    },
    {
      title: "Human Route Map",
      kind: "Move",
      mode: "move",
      task: ({ primary, secondary }) =>
        `Re-enact a journey from ${primary} to ${secondary} using fingers, objects, or your travel crew as the moving map.`,
      prompt: "Start / tricky turn / finish",
    },
    {
      title: "Dream Ride Lab",
      kind: "Invent",
      mode: "design",
      task: ({ destination, primary }) =>
        `Transform ${primary} into a fantastical ride for ${destination}. Give it one useful power and one ridiculous feature.`,
      prompt: "Ride name / useful power / ridiculous feature",
    },
  ],
  [
    {
      title: "Sound Safari",
      kind: "Listen",
      mode: "sound",
      task: ({ primary, secondary }) =>
        `Pause safely and hunt for the sound of ${primary}, then find a sound that is the complete opposite of ${secondary}.`,
      prompt: "Near sound / far sound / surprise sound",
    },
    {
      title: "Beat Builder",
      kind: "Music",
      mode: "sound",
      task: ({ destination, primary }) =>
        `Turn the rhythm of ${primary} into a short beat that your family can copy as the unofficial ${destination} theme tune.`,
      prompt: "Write the beat: ta / clap / tap / pause",
    },
    {
      title: "Quiet-Loud Map",
      kind: "Map",
      mode: "map",
      task: ({ primary }) =>
        `Map one quiet pocket and one noisy pocket near ${primary}. Use marks that look the way each place sounds.`,
      prompt: "Quiet symbol / loud symbol / best listening spot",
    },
  ],
  [
    {
      title: "Pocket Bioblitz",
      kind: "Nature",
      mode: "nature",
      task: ({ primary, secondary }) =>
        `Search without touching for ${primary}, ${secondary}, and one living thing that is easy to overlook.`,
      prompt: "Seen / where / what it was doing",
    },
    {
      title: "Creature Superpower",
      kind: "Imagine",
      mode: "story",
      task: ({ destination, primary }) =>
        `Imagine a tiny creature that uses ${primary} as its superpower for surviving in ${destination}.`,
      prompt: "Creature name / power / secret weakness",
    },
    {
      title: "Ranger Rescue",
      kind: "Mission",
      mode: "design",
      task: ({ destination, secondary }) =>
        `Design one small family action that helps protect ${secondary} in ${destination} without disturbing it.`,
      prompt: "Problem / rescue rule / ranger badge",
    },
  ],
  [
    {
      title: "Kindness Undercover",
      kind: "Observe",
      mode: "kindness",
      task: ({ primary }) =>
        `Secretly notice one considerate thing people do around ${primary}. Try the same habit without announcing the mission.`,
      prompt: "Kind action spotted / kind action tried",
    },
    {
      title: "Etiquette Comic",
      kind: "Comic",
      mode: "draw",
      task: ({ profile }) =>
        `Turn this local care clue into a before-and-after comic: ${profile.etiquette}`,
      prompt: "Oops panel / clue panel / nailed-it panel",
    },
    {
      title: "Thank-You Relay",
      kind: "Language",
      mode: "interview",
      task: ({ profile }) =>
        `Learn ${profile.word}, teach it to your travel crew, and notice a respectful moment when it may be appropriate to use.`,
      prompt: "Word / who taught me / when we used it",
    },
  ],
  [
    {
      title: "Memory Museum",
      kind: "Curate",
      mode: "memory",
      task: ({ destination, primary }) =>
        `Turn a sketch of ${primary} into the star object in an imaginary Museum of ${destination} Today.`,
      prompt: "Object title / why it belongs / display idea",
    },
    {
      title: "Favorite Face-Off",
      kind: "Tournament",
      mode: "score",
      task: ({ primary, secondary }) =>
        `Put ${primary} and ${secondary} into a playful tournament against two other moments from the trip.`,
      prompt: "Semifinal / final / champion memory",
    },
    {
      title: "Postcard From Today",
      kind: "Postcard",
      mode: "story",
      task: ({ destination }) =>
        `Send an imaginary postcard from ${destination} using one sight, one sound, one feeling, and one odd little detail.`,
      prompt: "Dear... / You would not believe... / From...",
    },
  ],
  [
    {
      title: "Pattern Patrol",
      kind: "Puzzle",
      mode: "hunt",
      task: ({ primary }) =>
        `Find a repeating pattern around ${primary}, copy the first three parts, and predict what should come next.`,
      prompt: "Pattern / next piece / where it appears",
    },
    {
      title: "Symmetry Remix",
      kind: "Art",
      mode: "draw",
      task: ({ destination, secondary }) =>
        `Borrow one shape from ${secondary}, flip or repeat it, and create a brand-new ${destination} pattern.`,
      prompt: "Original clue / my remix / pattern name",
    },
    {
      title: "Detail Zoom-In",
      kind: "Guess",
      mode: "draw",
      task: ({ primary }) =>
        `Draw an extreme close-up of ${primary} so your travel crew must guess what the whole thing is.`,
      prompt: "Guesses / reveal / detail most people missed",
    },
  ],
  [
    {
      title: "Market Math",
      kind: "Numbers",
      mode: "score",
      task: ({ primary, secondary }) =>
        `Compare the real or displayed prices, portions, colors, or ingredient counts for ${primary} and ${secondary}.`,
      prompt: "Number clue / comparison / best value or choice",
    },
    {
      title: "Mystery Ingredient",
      kind: "Mystery",
      mode: "taste",
      task: ({ destination, primary }) =>
        `Choose one ingredient in ${primary} and trace how it might travel from a farm, sea, or maker to a plate in ${destination}.`,
      prompt: "Ingredient / journey / evidence",
    },
    {
      title: "Pop-Up Cafe",
      kind: "Role-play",
      mode: "design",
      task: ({ destination, secondary }) =>
        `Open a pretend one-table cafe inspired by ${destination}. Give ${secondary} a dramatic menu name and sell it to your family.`,
      prompt: "Cafe name / special dish / one-line sales pitch",
    },
  ],
  [
    {
      title: "Map Legend Decoder",
      kind: "Map",
      mode: "map",
      task: ({ primary }) =>
        `Collect three signs or symbols near ${primary} and turn them into a secret map legend.`,
      prompt: "Symbol / secret meaning / map location",
    },
    {
      title: "Wrong-Turn Adventure",
      kind: "Story",
      mode: "story",
      task: ({ primary, secondary }) =>
        `Invent a ridiculous detour between ${primary} and ${secondary} involving one impossible obstacle and one clever escape.`,
      prompt: "Wrong turn / obstacle / escape",
    },
    {
      title: "Shortcut Designer",
      kind: "Solve",
      mode: "design",
      task: ({ destination, primary, secondary }) =>
        `Design a kinder route between ${primary} and ${secondary} for someone tired, carrying bags, or new to ${destination}.`,
      prompt: "Traveler / route change / why it helps",
    },
  ],
  [
    {
      title: "Destination Radio",
      kind: "Perform",
      mode: "report",
      task: ({ destination, primary }) =>
        `Host a tiny radio show from ${destination} with ${primary} as the opening sound and today's best discovery as the headline.`,
      prompt: "Station name / opening sound / top story",
    },
    {
      title: "Sound-Bubble Comic",
      kind: "Comic",
      mode: "draw",
      task: ({ primary, secondary }) =>
        `Draw ${primary} and ${secondary} meeting inside a comic made only from sound-effect bubbles.`,
      prompt: "Boom / whoosh / tiny sound / surprise sound",
    },
    {
      title: "Sonic Souvenir",
      kind: "Invent",
      mode: "sound",
      task: ({ destination, primary }) =>
        `Turn the sound of ${primary} into an imaginary souvenir you could pack and replay whenever you miss ${destination}.`,
      prompt: "Souvenir name / shape / sound it stores",
    },
  ],
  [
    {
      title: "Pocket Weather Station",
      kind: "Forecast",
      mode: "nature",
      task: ({ destination, primary }) =>
        `Use ${primary}, shadows, moving leaves, clouds, or clothing as evidence for today's ${destination} weather report.`,
      prompt: "Evidence / forecast / what actually happened",
    },
    {
      title: "Tiny Habitat News",
      kind: "News",
      mode: "report",
      task: ({ secondary }) =>
        `Report live from the tiny world around ${secondary}. Explain who might live there and what is changing.`,
      prompt: "Breaking news / witness clue / next development",
    },
    {
      title: "Nature: 2050",
      kind: "Future",
      mode: "design",
      task: ({ destination, primary }) =>
        `Imagine ${primary} in ${destination} in the year 2050 and design one hopeful change that helps it thrive.`,
      prompt: "Future headline / change / who makes it happen",
    },
  ],
  [
    {
      title: "Trip Awards Ceremony",
      kind: "Awards",
      mode: "score",
      task: ({ primary, secondary }) =>
        `Nominate ${primary}, ${secondary}, and one wild-card memory for funniest, most beautiful, most surprising, and worth-returning-for.`,
      prompt: "Category / winner / acceptance speech",
    },
    {
      title: "Destination Quizmaster",
      kind: "Quiz",
      mode: "story",
      task: ({ destination }) =>
        `Create a family quiz about ${destination} with one easy question, one tricky question, and one believable trick answer.`,
      prompt: "Question / choices / answer reveal",
    },
    {
      title: "Next Explorer Guide",
      kind: "Guide",
      mode: "report",
      task: ({ destination, profile }) =>
        `Make the one page you wish you had before arriving in ${destination}, including this care clue: ${profile.etiquette}`,
      prompt: "Do not miss / be ready for / show respect by",
    },
  ],
];

function tailorChallenge(mode: ChallengeMode, age: number, variant: number) {
  const choose = (options: string[]) => options[variant % options.length];

  if (age <= 5) {
    const count = Math.max(2, age - 1);
    if (mode === "hunt" || mode === "nature") {
      return choose([
        `A grown-up reads the clues; point, circle, or count ${count} finds.`,
        "Give warm-or-cold hints until your grown-up spots the same thing.",
        "Turn each find into a tiny movement, then pick the funniest one.",
      ]);
    }
    if (mode === "draw" || mode === "design") {
      return choose([
        `Use ${count} bold colors and tell a grown-up what each part means.`,
        "Draw one part with your eyes on the object, then one part from memory.",
        "Add a hidden heart, star, or silly face for your family to find.",
      ]);
    }
    if (mode === "sound" || mode === "move" || mode === "map") {
      return choose([
        "Use your voice, fingers, or whole body; a grown-up can draw the route or rhythm.",
        "Perform it once slowly and once in the silliest safe way you can.",
        "Teach the pattern to a grown-up and see whether they can copy it.",
      ]);
    }
    if (mode === "score" || mode === "taste") {
      return choose([
        "Choose with happy, unsure, and no-thank-you faces; only taste with grown-up permission.",
        "Give it a color score and a smell score before deciding whether to taste.",
        "Let every family member point to a favorite, then count the votes.",
      ]);
    }
    if (mode === "kindness" || mode === "interview") {
      return choose([
        "Practice together first, then let a grown-up help with the real moment.",
        "Use a puppet voice for practice and your calm voice for the real moment.",
        "Draw a happy face after you try it and tell what happened.",
      ]);
    }
    return choose([
      "Tell it aloud; a grown-up writes your exact words.",
      "Act out the middle and let your family guess the ending.",
      "Draw the answer first, then add one sentence together.",
    ]);
  }

  if (age <= 8) {
    if (mode === "hunt" || mode === "nature") {
      return choose([
        `Make it an ${age}-point challenge and add a bonus point for a clue nobody else notices.`,
        "Write three clues from hardest to easiest and test them on your travel crew.",
        "Add a secret category, such as zigzags or things smaller than your hand.",
      ]);
    }
    if (mode === "draw" || mode === "design") {
      return choose([
        "Label four clever details and hide one tiny joke in the finished design.",
        "Make a before-and-after version and circle the smartest change.",
        "Swap drawings with a teammate and let them add one surprising feature.",
      ]);
    }
    if (mode === "sound" || mode === "move" || mode === "map") {
      return choose([
        "Create a four-symbol key, then challenge someone else to follow or copy it.",
        "Make a pattern with exactly eight beats, steps, or map marks.",
        "Perform or trace it backwards and decide which version works better.",
      ]);
    }
    if (mode === "score" || mode === "taste") {
      return choose([
        "Build a five-star scorecard with one category invented by you.",
        "Make your prediction first, then reveal whether the real result matched.",
        "Collect family votes and design a winner's badge for the top choice.",
      ]);
    }
    if (mode === "kindness" || mode === "interview") {
      return choose([
        "Ask one clear question, listen closely, and write the most interesting exact word you hear.",
        "Role-play both sides with family before trying the respectful version for real.",
        "Turn what you learned into one helpful tip for the next child.",
      ]);
    }
    return choose([
      "Give it a beginning, a surprise in the middle, and a strong final line.",
      "Turn it into four comic panels with no more than six words in each.",
      "Tell two true details and slip in one hilarious invention for your family to guess.",
    ]);
  }

  if (age <= 11) {
    const evidenceCount = age - 6;
    if (mode === "draw" || mode === "design" || mode === "map") {
      return choose([
        `Make an annotated version with ${evidenceCount} labels and one practical improvement.`,
        "Sketch a first draft, test it on someone, and revise the most confusing part.",
        "Show the current version beside your redesign and explain the key trade-off.",
      ]);
    }
    if (mode === "score" || mode === "taste") {
      return choose([
        "Create three judging criteria, weight the most important one double, and defend the result.",
        "Predict the winner, gather evidence, then explain whether your prediction survived.",
        "Compare your score with a family member's and investigate the biggest disagreement.",
      ]);
    }
    if (mode === "kindness" || mode === "interview") {
      return choose([
        "Record the answer or behavior accurately, then separate evidence from your interpretation.",
        "Prepare a follow-up question that begins with how or why, and note what changed your view.",
        "Turn the result into a respectful do-and-do-not guide with reasons.",
      ]);
    }
    return choose([
      `Collect ${evidenceCount} precise pieces of evidence and include one alternative explanation.`,
      "Make an observation-prediction-check table and record where your guess went wrong.",
      "Rank the three strongest details, then defend why number one matters most.",
    ]);
  }

  const wordTarget = Math.min(120, age * 8);
  if (mode === "draw" || mode === "design" || mode === "map") {
    return choose([
      "Produce a labeled concept with a clear user, constraint, rationale, and trade-off.",
      "Make a rough prototype, get one piece of family feedback, and document the revision.",
      "Compare the original and your intervention through access, beauty, usefulness, and unintended effects.",
    ]);
  }
  if (mode === "score" || mode === "taste") {
    return choose([
      "Define a fair rubric, question one assumption behind it, and justify the final call.",
      "Collect two different viewpoints and explain why a single ranking cannot tell the whole story.",
      "Make a prediction before gathering evidence, then write a short verdict on what changed your mind.",
    ]);
  }
  if (mode === "kindness" || mode === "interview") {
    return choose([
      "Ask permission where needed, preserve context, and distinguish a quote from your own conclusion.",
      "Identify one assumption you brought with you and test it through careful observation or a respectful question.",
      "Write a cultural-humility note: what you noticed, what you cannot conclude, and what you want to learn next.",
    ]);
  }
  return choose([
    `Turn it into a ${wordTarget}-word field note that clearly separates fact, inference, and opinion.`,
    "Build a three-frame visual essay with evidence captions and one counterpoint.",
    "Write a sharp claim, support it with two observed details, and name the limitation of your evidence.",
  ]);
}

function makeActivities(
  day: number,
  age: number,
  destination: string,
  profile: DestinationProfile,
  primary: string,
  secondary: string,
): Activity[] {
  const context = { destination, profile, primary, secondary };
  const deck = creativeActivityDecks[day - 1];

  return deck.map((concept, index) => ({
    title: concept.title,
    kind: concept.kind,
    body: `${concept.task(context)} ${tailorChallenge(concept.mode, age, day * 3 + index)}`,
    prompt: concept.prompt,
  }));
}

function cleanLandmarkPlace(value: string, destination: string) {
  const cleaned = value
    .replace(/^\s*(?:a|an|the)\s+/i, "")
    .replace(/\s+(?:from|near|with|at)\s+.+$/i, "")
    .replace(/[.!?]+$/g, "")
    .trim();
  return cleaned.length >= 3 ? cleaned : destination;
}

function landmarkNames(primary: string, theme: string, destination: string): LandmarkNames {
  const place = cleanLandmarkPlace(primary, destination);
  const short = /tower/i.test(place)
    ? "the tower"
    : /garden|park/i.test(place)
      ? "the garden"
      : /museum|gallery/i.test(place)
        ? "the museum"
        : /market|hawker/i.test(place)
          ? "the market"
          : "this place";
  return {
    display: `${place}: ${theme}`,
    short,
    place,
  };
}

function landmarkFacts(names: LandmarkNames) {
  const place = names.place.toLocaleLowerCase();
  if (/eiffel/.test(place)) {
    return [
      "The tower uses about 2.5 million metal rivets.",
      "It can grow about 15 centimetres taller in summer.",
      "It opened in 1889 for a world fair.",
    ];
  }
  if (/merlion/.test(place)) {
    return [
      "The statue is 8.6 metres tall.",
      "Its fish body recalls Singapore's early fishing village.",
      "Its lion head represents Singapore's historic name.",
    ];
  }
  if (/supertree/.test(place)) {
    return [
      "The tallest Supertree is 50 metres high.",
      "Eighteen Supertrees stand across Gardens by the Bay.",
      "Some Supertrees collect solar energy for their lights.",
    ];
  }
  return [];
}

function queueIsExpected(value: string) {
  return /tower|museum|gallery|palace|castle|temple|mosque|theme park|aquarium|zoo|garden|monument|cable car|observation/i.test(value);
}

function buildDaySlots(
  age: number,
  names: LandmarkNames,
  primary: string,
  activities: Activity[],
): DaySlots {
  const sitDownBase = activities[0];
  const inPlaceBase = activities[1] || activities[0];
  const inPlaceSecondBase = activities[2];
  const inThePlace: Activity = {
    ...inPlaceBase,
    body: age <= 6
      ? `At ${names.place}, point to the real detail before answering.`
      : `Use evidence you can see at ${names.place}; record the exact location of your answer.`,
    requiresPresence: true,
    answerMode: "open",
  };
  const inThePlaceSecond: Activity | undefined = inPlaceSecondBase
    ? {
        ...inPlaceSecondBase,
        body: age <= 6
          ? `Look around ${names.short} for something different to point at.`
          : `Find a second real detail at ${names.place}, different from your first answer.`,
        requiresPresence: true,
        answerMode: "open",
      }
    : undefined;
  const sitDown: Activity = {
    ...sitDownBase,
    body: age <= 4
      ? `Draw one shape from ${names.short}. A grown-up writes your words.`
      : age <= 6
        ? `Draw one real shape from ${names.short}. Add one colour and one label.`
        : age <= 9
          ? `Sketch one real detail from ${names.short}, then add three single-word labels.`
          : sitDownBase.body,
    requiresPresence: false,
    answerMode: "open",
  };
  return {
    beforeYouGo: age <= 4
      ? `Grown-up: point out ${names.short} first.`
      : age <= 6
        ? `Grown-up: point out ${names.short} first and promise one close look.`
        : `Notice ${names.short} before explaining it; let the child form a first theory.`,
    whileYouWait: {
      title: age <= 6 ? "Spot It While You Wait" : "Shape Detective",
      instruction: age <= 6
        ? `How many moving things can you see near ${names.short}?`
        : `Count how many times you spot something shaped like part of ${names.short}; compare your total with a grown-up.`,
      countLabel: "I counted",
      countTo: age <= 4 ? 5 : age <= 6 ? 10 : 20,
      required: queueIsExpected(`${primary} ${names.place}`),
      gameType: "matching",
      items: [
        { label: "A shape", clue: `Something shaped like part of ${names.short}.` },
        { label: "A colour", clue: `A colour you can point to near ${names.short}.` },
        { label: "A sound", clue: `Something you can hear while you wait here.` },
        { label: "A person", clue: `Someone doing a job near ${names.short}.` },
      ],
      targetLabel: age <= 6 ? "Something that moves" : `Something shaped like ${names.short}`,
      targetKind: age <= 6 ? "object" : "shape",
      bonusQuest: "Find the one that surprises you most.",
    },
    inThePlace,
    ...(inThePlaceSecond ? { inThePlaceSecond } : {}),
    sitDown,
    factCard: landmarkFacts(names),
    questReveal: {
      revealText: `Here it is! What you were counting is part of ${names.short} itself — now you can see it up close.`,
      chatPrompts: [
        `What did you notice about ${names.short} while you were counting?`,
        "Was it easier or harder to find than you expected?",
      ],
    },
  };
}

export function buildBooklet(age: number, destination: string, days: number): DayPlan[] {
  const safeAge = sanitizeAge(age);
  const safeDays = sanitizeDays(days);
  const name = destination.trim() || "your destination";
  const profile = getDestinationProfile(name);

  return Array.from({ length: safeDays }, (_, index) => {
    const day = index + 1;
    const blueprint = dayBlueprints[index];
    const details = profile[blueprint.list];
    const primary = details[index % details.length];
    const secondary = details[(index + 1) % details.length];
    const activities = makeActivities(day, safeAge, name, profile, primary, secondary);
    const landmark = landmarkNames(primary, blueprint.theme, name);
    const slots = buildDaySlots(safeAge, landmark, primary, activities);

    return {
      architectureVersion: 2,
      day,
      theme: blueprint.theme,
      focusLabel: blueprint.focusLabel,
      mission: makeMission(day, name, profile, blueprint, primary, secondary),
      landmark,
      slots,
      activities: [slots.inThePlace, slots.sitDown],
    };
  });
}
