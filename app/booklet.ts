export type Activity = {
  title: string;
  kind: string;
  body: string;
  prompt: string;
};

export type DayPlan = {
  day: number;
  theme: string;
  focusLabel: string;
  mission: string;
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

function makeActivities(
  day: number,
  age: number,
  destination: string,
  profile: DestinationProfile,
  blueprint: DayBlueprint,
  primary: string,
  secondary: string,
): Activity[] {
  if (age <= 5) {
    const count = Math.max(2, age - 1);
    return [
      {
        title: `${blueprint.focusLabel} I Spy`,
        kind: "Spot",
        body: `With a grown-up, find ${primary}. Point to ${count} colors or shapes nearby, then look for ${secondary}.`,
        prompt: `I found it in ${destination}! Color ${count} stars.`,
      },
      {
        title: "Big Travel Drawing",
        kind: "Draw",
        body: `Draw ${primary} as big as you can. Add yourself visiting it in ${destination}.`,
        prompt: "My picture needs one more...",
      },
      {
        title: "Say, Move, Choose",
        kind: "Play",
        body: `Say ${profile.word} with help. Make a movement inspired by ${secondary}, then choose: funny, beautiful, loud, quiet, or yummy.`,
        prompt: "Circle a word or ask a grown-up to write yours.",
      },
    ];
  }

  if (age <= 8) {
    return [
      {
        title: `${blueprint.focusLabel} Point Hunt`,
        kind: "Game",
        body: `Earn ${age} points: 3 for finding ${primary}, 2 for ${secondary}, and 1 for every new detail you can name in ${destination}.`,
        prompt: `My score: ____ / ${age}   Best clue: __________`,
      },
      {
        title: "Map the Moment",
        kind: "Create",
        body: `Make a mini map showing where you found ${primary}. Add an arrow, a landmark, and the route your family took.`,
        prompt: "Draw the route and invent a map symbol.",
      },
      {
        title: "Local Detail Story",
        kind: "Story",
        body: `Use ${profile.word}, ${secondary}, and one real detail from ${destination} in a three-sentence travel tale.`,
        prompt: "Beginning / surprise / ending",
      },
    ];
  }

  if (age <= 11) {
    const evidenceCount = age - 6;
    return [
      {
        title: `${blueprint.focusLabel} Evidence Log`,
        kind: "Investigate",
        body: `Collect ${evidenceCount} precise observations about ${primary}: material, color, purpose, location, sound, or story. Compare it with ${secondary}.`,
        prompt: "Observation / evidence / what I think it means",
      },
      {
        title: "Local Systems Challenge",
        kind: "Decode",
        body: `Find how ${primary} fits into daily life in ${destination}. Sketch a diagram or route and label three useful parts.`,
        prompt: "This works well because... / I would improve...",
      },
      {
        title: "Ask, Check, Explain",
        kind: "Report",
        body: `Ask a grown-up, guide, or sign one respectful question about ${secondary}. Record the answer and one thing you still need to check.`,
        prompt: `Use today's local language clue: ${profile.word}.`,
      },
    ];
  }

  const wordTarget = Math.min(120, age * 8);
  return [
    {
      title: `${blueprint.focusLabel} Field Brief`,
      kind: "Report",
      body: `Document ${primary} in ${destination} using a sketch or permitted photo plus ${wordTarget} words. Separate what you observed from what you inferred.`,
      prompt: "Headline / evidence / unanswered question",
    },
    {
      title: "Design & Culture Lens",
      kind: "Analyze",
      body: `Compare ${primary} and ${secondary}. What do they reveal about climate, history, values, technology, or who gets to use the space?`,
      prompt: "Strongest evidence / another possible interpretation",
    },
    {
      title: "Publish the Mini Guide",
      kind: "Create",
      body: `Write a useful recommendation for another young traveler. Include ${profile.word}, one etiquette tip, and one honest trade-off from today.`,
      prompt: "Go for... / know before you go... / skip if...",
    },
  ];
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

    return {
      day,
      theme: blueprint.theme,
      focusLabel: blueprint.focusLabel,
      mission: makeMission(day, name, profile, blueprint, primary, secondary),
      activities: makeActivities(day, safeAge, name, profile, blueprint, primary, secondary),
    };
  });
}
