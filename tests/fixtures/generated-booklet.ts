import type { Activity, GameItem, GameType } from "../../app/booklet.ts";
import type { GeneratedBookletData } from "../../app/booklet-ai.ts";

function activity(
  title: string,
  kind: string,
  gameType: GameType,
  body: string,
  prompt: string,
  items: GameItem[],
): Activity {
  return { title, kind, gameType, body, prompt, items };
}

export function sampleGeneratedBooklet(): GeneratedBookletData {
  return {
    destination: "Singapore",
    age: 7,
    days: 5,
    itinerary: [
      "Gardens by the Bay",
      "Chinatown and Maxwell Food Centre",
      "National Gallery Singapore",
      "Singapore Botanic Gardens",
      "Kampong Gelam",
    ],
    profile: {
      style: "Garden city clues and neighborhood stories",
      intro:
        "Follow Singapore's garden paths, bright shophouses, food centres, and city galleries. Each page turns a real local detail into a game to play together.",
      word: "terima kasih (teh-REE-mah KAH-seh) means thank you in Malay",
      etiquette:
        "At hawker centres, return trays to the marked station and leave shared tables ready for the next family.",
    },
    dayPlans: [
      {
        day: 1,
        theme: "Gardens by the Bay Supertrees",
        focusLabel: "Vertical gardens",
        mission:
          "Look for living plants climbing the Supertrees and compare their shapes with the glass conservatories nearby.",
        activities: [
          activity(
            "Supertree Word Search",
            "Garden word puzzle",
            "word_search",
            "Find and circle four words connected to the giant planted structures and tropical conservatories.",
            "The garden detail I will remember: ____________________",
            [
              { label: "ORCHID", clue: "Singapore's national flower is a hybrid orchid." },
              { label: "GARDEN", clue: "A planted place designed for people to explore." },
              { label: "CLOUD", clue: "The Cloud Forest conservatory has a misty mountain." },
              { label: "TREE", clue: "The Supertrees borrow this familiar branching shape." },
            ],
          ),
          activity(
            "Skyway Twist Maze",
            "Route challenge",
            "maze",
            "Draw a route from the green start to the coral finish without crossing any wall.",
            "My route score: easy / twisty / super tricky",
            [
              { label: "GROVE", clue: "Begin among the Supertrees." },
              { label: "SKYWAY", clue: "Imagine crossing the raised walkway." },
              { label: "DOME", clue: "Pass a glass conservatory shape." },
              { label: "LAKE", clue: "Finish beside the water." },
            ],
          ),
        ],
      },
      {
        day: 2,
        theme: "Chinatown shophouses and hawker tables",
        focusLabel: "Color and food clues",
        mission:
          "Notice the shutters, tiles, signs, and shared-table habits that make this neighborhood feel distinct.",
        activities: [
          activity(
            "Shophouse Color Studio",
            "Coloring and tracing",
            "coloring",
            "Color the outlined street scene, then trace a local architecture word slowly from left to right.",
            "My brightest shophouse color: ____________________",
            [
              { label: "SHUTTER", clue: "Look for louvered window shutters above the covered walkway." },
              { label: "TILE", clue: "Patterned tiles can decorate walls and floors." },
              { label: "ARCH", clue: "Covered five-foot ways often repeat this shape." },
              { label: "SIGN", clue: "Shop signs layer old and new lettering." },
            ],
          ),
          activity(
            "Hawker Detail Hunt",
            "Family field mission",
            "scavenger_hunt",
            "Explore with your family and tick each box when you find the real detail. Ask before tasting and return your tray.",
            "The hardest detail to find: ____________________",
            [
              { label: "Tray station", clue: "Find the marked place where diners return trays." },
              { label: "Stall number", clue: "Spot the number used to identify a food stall." },
              { label: "Shared table", clue: "Notice how different families share the seating area." },
              { label: "Local drink", clue: "With a grown-up, identify one drink on a menu board." },
            ],
          ),
        ],
      },
      {
        day: 3,
        theme: "National Gallery art and civic buildings",
        focusLabel: "Art detective work",
        mission:
          "Compare details in Southeast Asian artworks and notice how two historic buildings became one museum.",
        activities: [
          activity(
            "Gallery Clue Crossword",
            "Art word puzzle",
            "crossword",
            "Solve four clues and write each local answer into its numbered spaces.",
            "The artwork detail I checked: ____________________",
            [
              { label: "COLOR", clue: "Artists can use this to create mood and contrast." },
              { label: "FRAME", clue: "This border can surround a painting." },
              { label: "DOME", clue: "Look up for this rounded roof form in the civic district." },
              { label: "RIVER", clue: "A historic waterway runs near the gallery." },
            ],
          ),
          activity(
            "Architecture Match-Up",
            "Observation matching",
            "matching",
            "Draw a line from each numbered feature to its matching lettered clue.",
            "My matches: 1-__  2-__  3-__  4-__",
            [
              { label: "Columns", clue: "Tall supports repeated across a grand facade." },
              { label: "Steps", clue: "A broad outdoor climb leading toward an entrance." },
              { label: "Bridge", clue: "A new link joining the former court and city hall." },
              { label: "Dome", clue: "A curved roof shape visible in the civic district." },
            ],
          ),
        ],
      },
      {
        day: 4,
        theme: "Singapore Botanic Gardens rainforest paths",
        focusLabel: "Plant pattern laboratory",
        mission:
          "Slow down to compare leaf edges, trunk textures, and the layered sounds of a tropical garden.",
        activities: [
          activity(
            "Rainforest Difference Detective",
            "Picture puzzle",
            "spot_the_difference",
            "Circle three changes between the two garden-inspired pictures.",
            "The sneakiest change was: ____________________",
            [
              { label: "RAINFOREST", clue: "A layered habitat with warm, wet conditions." },
              { label: "LEAF", clue: "Compare smooth, jagged, long, and round edges." },
              { label: "TRUNK", clue: "Bark texture can look cracked, smooth, or striped." },
              { label: "SHADE", clue: "Large leaves and branches block some sunlight." },
            ],
          ),
          activity(
            "Orchid Garden Route Mapper",
            "Garden map puzzle",
            "map_puzzle",
            "Connect the four stops in order, then add a symbol that makes your route easy to follow.",
            "Best route clue: ____________________",
            [
              { label: "Gate", clue: "Mark the family meeting point." },
              { label: "Lake", clue: "Curve the route beside water." },
              { label: "Orchids", clue: "Pause to compare flower shapes." },
              { label: "Shelter", clue: "Finish at a shady rest point." },
            ],
          ),
        ],
      },
      {
        day: 5,
        theme: "Kampong Gelam textile and street patterns",
        focusLabel: "Pattern and design stories",
        mission:
          "Look for repeated shapes in textiles, tiled paths, painted walls, and the golden dome along Arab Street.",
        activities: [
          activity(
            "Textile Pattern Codebreaker",
            "Symbol code",
            "codebreaker",
            "Use the starter key to crack the coded local word and complete the missing letter matches.",
            "Decoded word: ____________________",
            [
              { label: "BATIK", clue: "Wax-resist dyeing can create layered textile patterns." },
              { label: "MOTIF", clue: "A shape or idea repeated across a design." },
              { label: "CLOTH", clue: "Textile shops display many colors and textures." },
              { label: "DYE", clue: "Color is added to fibers with this material." },
            ],
          ),
          activity(
            "Golden Dome Drawing Lab",
            "Observation drawing",
            "drawing",
            "Sketch the skyline using one dome, two window shapes, and a textile-inspired border of your own.",
            "The pattern I repeated: ____________________",
            [
              { label: "DOME", clue: "Notice the large golden curve above Sultan Mosque." },
              { label: "WINDOW", clue: "Compare arches and straight-sided frames." },
              { label: "BORDER", clue: "Repeat one small shape around the edge." },
              { label: "COLOR", clue: "Choose colors based on details you really noticed." },
            ],
          ),
        ],
      },
    ],
    sources: [
      { title: "Visit Singapore", url: "https://www.visitsingapore.com/" },
      { title: "Gardens by the Bay", url: "https://www.gardensbythebay.com.sg/" },
      { title: "National Gallery Singapore", url: "https://www.nationalgallery.sg/" },
    ],
    generatedAt: "2026-09-15T00:00:00.000Z",
  };
}
