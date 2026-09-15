import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { performance } from "node:perf_hooks";
import { PDFDocument } from "pdf-lib";
import { POST as generateBooklet } from "../app/api/generate/route.ts";
import {
  allowedGameTypesForAge,
  type GeneratedBookletData,
} from "../app/booklet-ai.ts";
import {
  bookletPdfFilename,
  bookletPdfPageCount,
  createBookletPdf,
} from "../app/booklet-pdf.ts";
import { readGenerationResponse } from "../app/generation-stream.ts";

type BenchmarkCase = {
  id: number;
  destination: string;
  age: number;
  days: number;
  placeScale: "Major city" | "Small place";
  itinerary: string[];
};

type Usage = {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

type ApiCall = Usage & {
  endpoint: string;
  model: string;
  seconds: number;
  status: number;
  webSearchCalls: number;
  costUsd: number;
  rawUsage: Record<string, unknown>;
};

type QualityResult = {
  passed: boolean;
  checks: string[];
  warnings: string[];
};

type BenchmarkResult = {
  id: number;
  status: "passed" | "failed";
  destination: string;
  placeScale: BenchmarkCase["placeScale"];
  age: number;
  days: number;
  itinerary: string[];
  startedAt: string;
  finishedAt: string;
  generationSeconds: number;
  pdfSeconds: number;
  totalSeconds: number;
  apiSeconds: number;
  apiCalls: number;
  researchCalls: number;
  composerCalls: number;
  webSearchCalls: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  totalTokens: number;
  calculatedCostUsd: number;
  balanceBeforeUsd: number | null;
  balanceAfterUsd: number | null;
  observedBalanceDeltaUsd: number | null;
  pdfFilename: string;
  pdfBytes: number;
  pdfPages: number;
  expectedPages: number;
  sourceCount: number;
  gameTypes: string[];
  qualityPassed: boolean;
  qualityChecks: string[];
  qualityWarnings: string[];
  retries: number;
  error?: string;
  calls: ApiCall[];
};

const cases: BenchmarkCase[] = [
  {
    id: 1,
    destination: "Singapore",
    age: 3,
    days: 2,
    placeScale: "Major city",
    itinerary: ["Gardens by the Bay", "Singapore Zoo"],
  },
  {
    id: 2,
    destination: "Tokyo, Japan",
    age: 4,
    days: 3,
    placeScale: "Major city",
    itinerary: ["Senso-ji", "", "Ueno Park"],
  },
  {
    id: 3,
    destination: "Paris, France",
    age: 5,
    days: 4,
    placeScale: "Major city",
    itinerary: ["Eiffel Tower", "Louvre courtyard", "", "Montmartre"],
  },
  {
    id: 4,
    destination: "New York City, USA",
    age: 6,
    days: 3,
    placeScale: "Major city",
    itinerary: [
      "Central Park",
      "Statue of Liberty",
      "American Museum of Natural History",
    ],
  },
  {
    id: 5,
    destination: "Cairo, Egypt",
    age: 7,
    days: 4,
    placeScale: "Major city",
    itinerary: ["Giza Pyramids", "Egyptian Museum", "", "Khan el-Khalili"],
  },
  {
    id: 6,
    destination: "Mexico City, Mexico",
    age: 8,
    days: 5,
    placeScale: "Major city",
    itinerary: [
      "Chapultepec Park",
      "National Museum of Anthropology",
      "Xochimilco",
      "",
      "Frida Kahlo Museum",
    ],
  },
  {
    id: 7,
    destination: "Istanbul, Turkiye",
    age: 9,
    days: 4,
    placeScale: "Major city",
    itinerary: [
      "Hagia Sophia",
      "Topkapi Palace",
      "Bosphorus ferry",
      "Grand Bazaar",
    ],
  },
  {
    id: 8,
    destination: "Cape Town, South Africa",
    age: 10,
    days: 5,
    placeScale: "Major city",
    itinerary: [
      "Table Mountain",
      "Boulders Beach",
      "V&A Waterfront",
      "",
      "Kirstenbosch",
    ],
  },
  {
    id: 9,
    destination: "Kyoto, Japan",
    age: 11,
    days: 3,
    placeScale: "Major city",
    itinerary: ["Fushimi Inari Taisha", "Nishiki Market", "Arashiyama"],
  },
  {
    id: 10,
    destination: "Reykjavik, Iceland",
    age: 12,
    days: 4,
    placeScale: "Major city",
    itinerary: ["Hallgrimskirkja", "Perlan", "", "Old Harbour"],
  },
  {
    id: 11,
    destination: "Marrakech, Morocco",
    age: 13,
    days: 5,
    placeScale: "Major city",
    itinerary: [
      "Jemaa el-Fnaa",
      "Bahia Palace",
      "Majorelle Garden",
      "",
      "Medina souks",
    ],
  },
  {
    id: 12,
    destination: "Seoul, South Korea",
    age: 14,
    days: 3,
    placeScale: "Major city",
    itinerary: [
      "Gyeongbokgung Palace",
      "Bukchon Hanok Village",
      "Dongdaemun Design Plaza",
    ],
  },
  {
    id: 13,
    destination: "Pulau Ubin, Singapore",
    age: 4,
    days: 2,
    placeScale: "Small place",
    itinerary: ["Chek Jawa Wetlands", "Sensory Trail"],
  },
  {
    id: 14,
    destination: "Hallstatt, Austria",
    age: 5,
    days: 3,
    placeScale: "Small place",
    itinerary: ["Lake Hallstatt", "Hallstatt Salt Mine", "Market Square"],
  },
  {
    id: 15,
    destination: "Sa Pa, Vietnam",
    age: 6,
    days: 4,
    placeScale: "Small place",
    itinerary: ["Muong Hoa Valley", "Cat Cat Village", "", "Sa Pa Market"],
  },
  {
    id: 16,
    destination: "Luang Prabang, Laos",
    age: 7,
    days: 3,
    placeScale: "Small place",
    itinerary: ["Royal Palace Museum", "Mount Phousi", "Kuang Si Falls"],
  },
  {
    id: 17,
    destination: "Gjirokaster, Albania",
    age: 8,
    days: 4,
    placeScale: "Small place",
    itinerary: ["Gjirokaster Castle", "Old Bazaar", "Skenduli House", ""],
  },
  {
    id: 18,
    destination: "Colonia del Sacramento, Uruguay",
    age: 9,
    days: 3,
    placeScale: "Small place",
    itinerary: ["Historic Quarter", "Street of Sighs", "Rambla waterfront"],
  },
  {
    id: 19,
    destination: "Lamu, Kenya",
    age: 11,
    days: 4,
    placeScale: "Small place",
    itinerary: ["Lamu Fort", "Lamu Museum", "Old Town waterfront", "Shela village"],
  },
  {
    id: 20,
    destination: "Ilulissat, Greenland",
    age: 14,
    days: 5,
    placeScale: "Small place",
    itinerary: [
      "Ilulissat Icefjord",
      "Sermermiut Valley",
      "Ilulissat Museum",
      "",
      "Harbour",
    ],
  },
  {
    id: 21,
    destination: "Walt Disney World, Orlando, USA",
    age: 3,
    days: 1,
    placeScale: "Major city",
    itinerary: ["Magic Kingdom"],
  },
  {
    id: 22,
    destination: "Koh Samui, Thailand",
    age: 4,
    days: 2,
    placeScale: "Small place",
    itinerary: ["Big Buddha", "Fisherman's Village"],
  },
  {
    id: 23,
    destination: "Venice, Italy",
    age: 5,
    days: 3,
    placeScale: "Major city",
    itinerary: ["Rialto Bridge", "Doge's Palace", "Burano"],
  },
  {
    id: 24,
    destination: "Aoraki / Mount Cook, New Zealand",
    age: 6,
    days: 2,
    placeScale: "Small place",
    itinerary: ["Hooker Valley Track", "Tasman Glacier"],
  },
  {
    id: 25,
    destination: "Lisbon, Portugal",
    age: 7,
    days: 4,
    placeScale: "Major city",
    itinerary: ["Tram 28", "Belem Tower", "Oceanario de Lisboa", ""],
  },
  {
    id: 26,
    destination: "Hobart, Australia",
    age: 8,
    days: 3,
    placeScale: "Major city",
    itinerary: ["MONA", "Salamanca Market", "Mount Wellington"],
  },
  {
    id: 27,
    destination: "Kigali, Rwanda",
    age: 9,
    days: 2,
    placeScale: "Major city",
    itinerary: ["Kigali Genocide Memorial", "Kimironko Market"],
  },
  {
    id: 28,
    destination: "Easter Island (Rapa Nui), Chile",
    age: 10,
    days: 4,
    placeScale: "Small place",
    itinerary: ["Ahu Tongariki", "Rano Raraku", "Anakena Beach", ""],
  },
  {
    id: 29,
    destination: "New Orleans, USA",
    age: 11,
    days: 5,
    placeScale: "Major city",
    itinerary: ["French Quarter", "City Park", "Mardi Gras World", "Garden District", ""],
  },
  {
    id: 30,
    destination: "Tromso, Norway",
    age: 12,
    days: 3,
    placeScale: "Major city",
    itinerary: ["Arctic Cathedral", "Polaria", "Fjellheisen Cable Car"],
  },
  {
    id: 31,
    destination: "Matera, Italy",
    age: 13,
    days: 2,
    placeScale: "Small place",
    itinerary: ["Sassi di Matera", "Casa Noha"],
  },
  {
    id: 32,
    destination: "Edinburgh, Scotland",
    age: 14,
    days: 6,
    placeScale: "Major city",
    itinerary: ["Edinburgh Castle", "Arthur's Seat", "National Museum of Scotland", "Leith", "", "Dean Village"],
  },
  {
    id: 33,
    destination: "Ubud, Bali, Indonesia",
    age: 3,
    days: 7,
    placeScale: "Small place",
    itinerary: ["Monkey Forest", "Tegallalang Rice Terrace", ""],
  },
  {
    id: 34,
    destination: "Quebec City, Canada",
    age: 5,
    days: 1,
    placeScale: "Major city",
    itinerary: ["Chateau Frontenac"],
  },
  {
    id: 35,
    destination: "Kotor, Montenegro",
    age: 6,
    days: 3,
    placeScale: "Small place",
    itinerary: ["Kotor Old Town", "San Giovanni Fortress", "Bay of Kotor"],
  },
  {
    id: 36,
    destination: "Hanoi, Vietnam",
    age: 7,
    days: 8,
    placeScale: "Major city",
    itinerary: ["Hoan Kiem Lake", "Temple of Literature", "Water Puppet Theatre", ""],
  },
  {
    id: 37,
    destination: "Rothenburg ob der Tauber, Germany",
    age: 8,
    days: 2,
    placeScale: "Small place",
    itinerary: ["Plonlein", "Medieval Town Walls"],
  },
  {
    id: 38,
    destination: "Buenos Aires, Argentina",
    age: 9,
    days: 4,
    placeScale: "Major city",
    itinerary: ["La Boca", "Recoleta Cemetery", "Teatro Colon", "San Telmo Market"],
  },
  {
    id: 39,
    destination: "Svalbard, Norway",
    age: 10,
    days: 2,
    placeScale: "Small place",
    itinerary: ["Svalbard Museum", "Global Seed Vault"],
  },
  {
    id: 40,
    destination: "Washington, D.C., USA",
    age: 11,
    days: 5,
    placeScale: "Major city",
    itinerary: ["National Air and Space Museum", "Lincoln Memorial", "Library of Congress", "National Mall", ""],
  },
  {
    id: 41,
    destination: "Essaouira, Morocco",
    age: 12,
    days: 3,
    placeScale: "Small place",
    itinerary: ["Skala de la Ville", "Essaouira Medina", "Fishing Harbour"],
  },
  {
    id: 42,
    destination: "Melbourne, Australia",
    age: 13,
    days: 10,
    placeScale: "Major city",
    itinerary: ["Federation Square", "Queen Victoria Market", "NGV International", "St Kilda", "", "Melbourne Museum"],
  },
  {
    id: 43,
    destination: "Galle, Sri Lanka",
    age: 14,
    days: 2,
    placeScale: "Small place",
    itinerary: ["Galle Fort", "Dutch Reformed Church"],
  },
  {
    id: 44,
    destination: "St. John's, Antigua and Barbuda",
    age: 4,
    days: 4,
    placeScale: "Small place",
    itinerary: ["Nelson's Dockyard", "Shirley Heights", ""],
  },
  {
    id: 45,
    destination: "Sao Paulo, Brazil",
    age: 6,
    days: 3,
    placeScale: "Major city",
    itinerary: ["Ibirapuera Park", "MASP", "Liberdade"],
  },
  {
    id: 46,
    destination: "San Jose, Costa Rica",
    age: 8,
    days: 14,
    placeScale: "Major city",
    itinerary: ["National Theatre", "Central Market", ""],
  },
  {
    id: 47,
    destination: "Meteora, Greece",
    age: 10,
    days: 1,
    placeScale: "Small place",
    itinerary: ["Monastery of Great Meteoron"],
  },
  {
    id: 48,
    destination: "Bishkek, Kyrgyzstan",
    age: 12,
    days: 4,
    placeScale: "Major city",
    itinerary: ["Ala-Too Square", "Osh Bazaar", "State History Museum", ""],
  },
  {
    id: 49,
    destination: "Lerwick, Shetland",
    age: 7,
    days: 3,
    placeScale: "Small place",
    itinerary: ["Shetland Museum", "Clickimin Broch", "Mareel"],
  },
  {
    id: 50,
    destination: "São Tomé, São Tomé and Príncipe",
    age: 14,
    days: 5,
    placeScale: "Small place",
    itinerary: ["Boca de Inferno", "Pico de Sao Tome", "Roça Agostinho Neto", "", "National Museum"],
  },
];

const modelPricing = {
  "kimi-k3": { cachedInput: 0.3, uncachedInput: 3, output: 15 },
  "kimi-k2.6": { cachedInput: 0.16, uncachedInput: 0.95, output: 4 },
} as const;
const webSearchPrice = 0.005;
const runName = process.env.BENCHMARK_RUN_NAME || "tripquest-parent-50-uat";
const selectedCaseIds = new Set(
  (process.env.BENCHMARK_CASE_IDS || cases.map((testCase) => testCase.id).join(","))
    .split(",")
    .map((value) => Number(value.trim()))
    .filter(Number.isInteger),
);
const selectedCases = cases.filter((testCase) => selectedCaseIds.has(testCase.id));
const maxAttempts = Math.max(1, Number(process.env.BENCHMARK_MAX_ATTEMPTS) || 2);
const outputDirectory = new URL(`../tmp/pdfs/${runName}/`, import.meta.url);
const resultPath = new URL("results.json", outputDirectory);
const runSummaryPath = new URL("run-summary.json", outputDirectory);
const originalFetch = globalThis.fetch.bind(globalThis);
let currentCalls: ApiCall[] | null = null;

mkdirSync(outputDirectory, { recursive: true });

function numberFrom(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function usageFrom(payload: Record<string, unknown>): Usage {
  const usage = (payload.usage && typeof payload.usage === "object"
    ? payload.usage
    : {}) as Record<string, unknown>;
  const inputDetails = (usage.input_tokens_details && typeof usage.input_tokens_details === "object"
    ? usage.input_tokens_details
    : usage.prompt_tokens_details && typeof usage.prompt_tokens_details === "object"
      ? usage.prompt_tokens_details
      : {}) as Record<string, unknown>;
  const inputTokens = numberFrom(usage.input_tokens ?? usage.prompt_tokens);
  const cachedInputTokens = numberFrom(
    inputDetails.cached_tokens
      ?? usage.cached_tokens
      ?? usage.prompt_cache_hit_tokens,
  );
  const outputTokens = numberFrom(usage.output_tokens ?? usage.completion_tokens);
  return {
    inputTokens,
    cachedInputTokens: Math.min(inputTokens, cachedInputTokens),
    outputTokens,
    totalTokens: numberFrom(usage.total_tokens) || inputTokens + outputTokens,
  };
}

function countWebSearchCalls(payload: Record<string, unknown>) {
  const output = Array.isArray(payload.output) ? payload.output : [];
  return output.filter((item) => {
    return Boolean(item && typeof item === "object" && (item as { type?: unknown }).type === "web_search_call");
  }).length;
}

function costFor(model: string, usage: Usage, webSearchCalls: number) {
  const rates = modelPricing[model as keyof typeof modelPricing];
  if (!rates) return webSearchCalls * webSearchPrice;
  const uncached = Math.max(0, usage.inputTokens - usage.cachedInputTokens);
  return (
    (usage.cachedInputTokens * rates.cachedInput
      + uncached * rates.uncachedInput
      + usage.outputTokens * rates.output) / 1_000_000
    + webSearchCalls * webSearchPrice
  );
}

globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string"
    ? input
    : input instanceof URL
      ? input.href
      : input.url;
  const started = performance.now();
  const response = await originalFetch(input, init);
  const seconds = (performance.now() - started) / 1000;

  if (url.startsWith("https://api.moonshot.ai/v1/") && currentCalls) {
    let requestBody: Record<string, unknown> = {};
    let payload: Record<string, unknown> = {};
    try {
      requestBody = typeof init?.body === "string"
        ? JSON.parse(init.body) as Record<string, unknown>
        : {};
      payload = await response.clone().json() as Record<string, unknown>;
    } catch {
      // Failed upstream responses are still recorded without usage details.
    }
    const usage = usageFrom(payload);
    const webSearchCalls = countWebSearchCalls(payload);
    const model = typeof requestBody.model === "string" ? requestBody.model : "unknown";
    currentCalls.push({
      endpoint: new URL(url).pathname.replace("/v1", ""),
      model,
      seconds,
      status: response.status,
      webSearchCalls,
      costUsd: costFor(model, usage, webSearchCalls),
      rawUsage: (payload.usage && typeof payload.usage === "object"
        ? payload.usage
        : {}) as Record<string, unknown>,
      ...usage,
    });
  }

  return response;
};

async function getBalance() {
  const apiKey = process.env.MOONSHOT_API_KEY;
  if (!apiKey) throw new Error("MOONSHOT_API_KEY is missing.");
  const response = await originalFetch("https://api.moonshot.ai/v1/users/me/balance", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const payload = await response.json() as {
    data?: { available_balance?: number };
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new Error(payload.error?.message || `Balance request failed with ${response.status}.`);
  }
  const balance = Number(payload.data?.available_balance);
  return Number.isFinite(balance) ? balance : null;
}

function previousResults() {
  if (!existsSync(resultPath)) return [] as BenchmarkResult[];
  return JSON.parse(readFileSync(resultPath, "utf8")) as BenchmarkResult[];
}

function saveResults(results: BenchmarkResult[], runStartedAt: string, openingBalanceUsd: number | null) {
  writeFileSync(resultPath, `${JSON.stringify(results, null, 2)}\n`);
  writeFileSync(
    runSummaryPath,
    `${JSON.stringify({
      runName,
      runStartedAt,
      updatedAt: new Date().toISOString(),
      researchModel: process.env.KIMI_RESEARCH_MODEL || "kimi-k3",
      composerModel: process.env.KIMI_COMPOSER_MODEL || "kimi-k2.6",
      pricingAsOf: "2026-09-15",
      modelPricingPerMillionTokens: modelPricing,
      webSearchPricePerSuccessfulCallUsd: webSearchPrice,
      openingBalanceUsd,
      cases: selectedCases.length,
    }, null, 2)}\n`,
  );
}

function significantWords(value: string) {
  return value
    .toLocaleLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 4 && !["museum", "park", "palace", "market", "village", "waterfront"].includes(word));
}

function assessQuality(booklet: GeneratedBookletData, testCase: BenchmarkCase, pdfPages: number) {
  const checks: string[] = [];
  const warnings: string[] = [];
  const allActivities = booklet.dayPlans.flatMap((day) => day.activities);
  const titleKeys = allActivities.map((activity) => activity.title.trim().toLocaleLowerCase());
  const themeKeys = booklet.dayPlans.map((day) => day.theme.trim().toLocaleLowerCase());
  const allowedGames = new Set(allowedGameTypesForAge(testCase.age));
  const gameTypes = allActivities.map((activity) => activity.gameType);
  const text = JSON.stringify(booklet).toLocaleLowerCase();

  if (booklet.age === testCase.age) checks.push("Exact age preserved");
  else warnings.push(`Age changed to ${booklet.age}`);
  if (booklet.destination === testCase.destination) checks.push("Exact destination preserved");
  else warnings.push(`Destination changed to ${booklet.destination}`);
  if (booklet.dayPlans.length === testCase.days) checks.push("Correct day count");
  else warnings.push(`Expected ${testCase.days} days, received ${booklet.dayPlans.length}`);
  if (pdfPages === bookletPdfPageCount(booklet)) checks.push("Correct PDF page count");
  else warnings.push(`Expected ${bookletPdfPageCount(booklet)} PDF pages, received ${pdfPages}`);
  if (booklet.sources.length >= 2) checks.push("At least two research sources");
  else warnings.push("Fewer than two research sources");
  if (new Set(titleKeys).size === titleKeys.length) checks.push("Unique activity titles");
  else warnings.push("Repeated activity title");
  if (new Set(themeKeys).size === themeKeys.length) checks.push("Unique daily themes");
  else warnings.push("Repeated daily theme");
  const disallowed = gameTypes.filter((game) => !allowedGames.has(game));
  if (!disallowed.length) checks.push("All games allowed for age");
  else warnings.push(`Age-inappropriate games: ${Array.from(new Set(disallowed)).join(", ")}`);

  for (const stop of testCase.itinerary.filter(Boolean)) {
    const words = significantWords(stop);
    if (words.length && !words.some((word) => text.includes(word))) {
      warnings.push(`Daily plan may be weakly reflected: ${stop}`);
    }
  }

  const genericThemes = themeKeys.filter((theme) => {
    return /^(?:hello(?: [a-z ]+)?|landmark lab|culture day|memory maker)[.!]*$/.test(theme);
  });
  if (!genericThemes.length) checks.push("No banned generic day themes");
  else warnings.push(`Generic theme found: ${genericThemes.join(", ")}`);

  return { passed: warnings.length === 0, checks, warnings } satisfies QualityResult;
}

function round(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

async function generateOne(testCase: BenchmarkCase, existingResults: BenchmarkResult[]) {
  const startedAt = new Date().toISOString();
  const totalStarted = performance.now();
  const balanceBeforeUsd = await getBalance();
  currentCalls = [];
  let retries = 0;

  try {
    let booklet: GeneratedBookletData | null = null;
    let finalError: unknown;
    const generationStarted = performance.now();
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        const response = await generateBooklet(new Request("http://tripquest.local/api/generate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "cf-connecting-ip": `198.51.100.${testCase.id}`,
          },
          body: JSON.stringify(testCase),
        }));
        if (!response.ok) {
          const payload = await response.json() as { error?: string };
          throw new Error(payload.error || `Generation returned HTTP ${response.status}.`);
        }
        booklet = await readGenerationResponse(response, () => undefined) as GeneratedBookletData;
        break;
      } catch (error) {
        finalError = error;
        if (attempt < maxAttempts - 1) {
          retries += 1;
          await new Promise((resolve) => setTimeout(resolve, 5_000));
        }
      }
    }
    if (!booklet) throw finalError instanceof Error ? finalError : new Error("Generation failed.");
    const generationSeconds = (performance.now() - generationStarted) / 1000;

    const pdfStarted = performance.now();
    const pdf = await createBookletPdf(booklet);
    const filename = `${String(testCase.id).padStart(2, "0")}-${bookletPdfFilename(booklet)}`;
    writeFileSync(new URL(filename, outputDirectory), pdf);
    const loadedPdf = await PDFDocument.load(pdf);
    const pdfPages = loadedPdf.getPageCount();
    const expectedPages = bookletPdfPageCount(booklet);
    const a4Pages = loadedPdf.getPages().every((page) => {
      const { width, height } = page.getSize();
      return Math.abs(width - 595.28) < 1 && Math.abs(height - 841.89) < 1;
    });
    const pdfSeconds = (performance.now() - pdfStarted) / 1000;
    const quality = assessQuality(booklet, testCase, pdfPages);
    if (!a4Pages) {
      quality.passed = false;
      quality.warnings.push("One or more PDF pages are not A4.");
    } else {
      quality.checks.push("Every PDF page is A4");
    }

    const calls = currentCalls;
    const sums = calls.reduce(
      (total, call) => ({
        apiSeconds: total.apiSeconds + call.seconds,
        inputTokens: total.inputTokens + call.inputTokens,
        cachedInputTokens: total.cachedInputTokens + call.cachedInputTokens,
        outputTokens: total.outputTokens + call.outputTokens,
        totalTokens: total.totalTokens + call.totalTokens,
        webSearchCalls: total.webSearchCalls + call.webSearchCalls,
        costUsd: total.costUsd + call.costUsd,
      }),
      {
        apiSeconds: 0,
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        webSearchCalls: 0,
        costUsd: 0,
      },
    );
    const balanceAfterUsd = await getBalance();
    const gameTypes = Array.from(new Set(booklet.dayPlans.flatMap((day) => day.activities.map((activity) => activity.gameType))));
    const result: BenchmarkResult = {
      id: testCase.id,
      status: quality.passed ? "passed" : "failed",
      destination: testCase.destination,
      placeScale: testCase.placeScale,
      age: testCase.age,
      days: testCase.days,
      itinerary: testCase.itinerary,
      startedAt,
      finishedAt: new Date().toISOString(),
      generationSeconds: round(generationSeconds, 3),
      pdfSeconds: round(pdfSeconds, 3),
      totalSeconds: round((performance.now() - totalStarted) / 1000, 3),
      apiSeconds: round(sums.apiSeconds, 3),
      apiCalls: calls.length,
      researchCalls: calls.filter((call) => call.endpoint === "/responses").length,
      composerCalls: calls.filter((call) => call.endpoint === "/chat/completions").length,
      webSearchCalls: sums.webSearchCalls,
      inputTokens: sums.inputTokens,
      cachedInputTokens: sums.cachedInputTokens,
      outputTokens: sums.outputTokens,
      totalTokens: sums.totalTokens,
      calculatedCostUsd: round(sums.costUsd, 6),
      balanceBeforeUsd,
      balanceAfterUsd,
      observedBalanceDeltaUsd: balanceBeforeUsd === null || balanceAfterUsd === null
        ? null
        : round(Math.max(0, balanceBeforeUsd - balanceAfterUsd), 6),
      pdfFilename: filename,
      pdfBytes: pdf.byteLength,
      pdfPages,
      expectedPages,
      sourceCount: booklet.sources.length,
      gameTypes,
      qualityPassed: quality.passed,
      qualityChecks: quality.checks,
      qualityWarnings: quality.warnings,
      retries,
      calls,
    };
    existingResults.push(result);
    writeFileSync(new URL(`${String(testCase.id).padStart(2, "0")}-booklet.json`, outputDirectory), `${JSON.stringify(booklet, null, 2)}\n`);
    return result;
  } catch (error) {
    const balanceAfterUsd = await getBalance().catch(() => null);
    const calls = currentCalls || [];
    const result: BenchmarkResult = {
      id: testCase.id,
      status: "failed",
      destination: testCase.destination,
      placeScale: testCase.placeScale,
      age: testCase.age,
      days: testCase.days,
      itinerary: testCase.itinerary,
      startedAt,
      finishedAt: new Date().toISOString(),
      generationSeconds: 0,
      pdfSeconds: 0,
      totalSeconds: round((performance.now() - totalStarted) / 1000, 3),
      apiSeconds: round(calls.reduce((sum, call) => sum + call.seconds, 0), 3),
      apiCalls: calls.length,
      researchCalls: calls.filter((call) => call.endpoint === "/responses").length,
      composerCalls: calls.filter((call) => call.endpoint === "/chat/completions").length,
      webSearchCalls: calls.reduce((sum, call) => sum + call.webSearchCalls, 0),
      inputTokens: calls.reduce((sum, call) => sum + call.inputTokens, 0),
      cachedInputTokens: calls.reduce((sum, call) => sum + call.cachedInputTokens, 0),
      outputTokens: calls.reduce((sum, call) => sum + call.outputTokens, 0),
      totalTokens: calls.reduce((sum, call) => sum + call.totalTokens, 0),
      calculatedCostUsd: round(calls.reduce((sum, call) => sum + call.costUsd, 0), 6),
      balanceBeforeUsd,
      balanceAfterUsd,
      observedBalanceDeltaUsd: balanceBeforeUsd === null || balanceAfterUsd === null
        ? null
        : round(Math.max(0, balanceBeforeUsd - balanceAfterUsd), 6),
      pdfFilename: "",
      pdfBytes: 0,
      pdfPages: 0,
      expectedPages: testCase.days * 2 + 5,
      sourceCount: 0,
      gameTypes: [],
      qualityPassed: false,
      qualityChecks: [],
      qualityWarnings: [],
      retries,
      error: error instanceof Error ? error.message : "Unknown generation error",
      calls,
    };
    existingResults.push(result);
    return result;
  } finally {
    currentCalls = null;
  }
}

const runStartedAt = new Date().toISOString();
const results = previousResults();
const openingBalanceUsd = await getBalance();
saveResults(results, runStartedAt, openingBalanceUsd);

try {
  for (const testCase of selectedCases) {
    if (results.some((result) => result.id === testCase.id && result.status === "passed")) {
      console.log(`[${testCase.id}/50] already complete: ${testCase.destination}`);
      continue;
    }
    const priorIndex = results.findIndex((result) => result.id === testCase.id);
    if (priorIndex >= 0) results.splice(priorIndex, 1);
    console.log(`[${testCase.id}/50] generating: ${testCase.destination}, age ${testCase.age}, ${testCase.days} days`);
    const result = await generateOne(testCase, results);
    results.sort((left, right) => left.id - right.id);
    saveResults(results, runStartedAt, openingBalanceUsd);
    console.log(
      `[${testCase.id}/50] ${result.status}: ${result.totalSeconds.toFixed(1)}s, $${result.calculatedCostUsd.toFixed(6)}, ${result.pdfPages} pages`,
    );
  }
} finally {
  globalThis.fetch = originalFetch;
}

const closingBalanceUsd = await getBalance();
const passed = results.filter((result) => result.status === "passed").length;
const calculatedCostUsd = results.reduce((sum, result) => sum + result.calculatedCostUsd, 0);
writeFileSync(
  runSummaryPath,
  `${JSON.stringify({
    runName,
    runStartedAt,
    runFinishedAt: new Date().toISOString(),
    researchModel: process.env.KIMI_RESEARCH_MODEL || "kimi-k3",
    composerModel: process.env.KIMI_COMPOSER_MODEL || "kimi-k2.6",
    pricingAsOf: "2026-09-15",
    modelPricingPerMillionTokens: modelPricing,
    webSearchPricePerSuccessfulCallUsd: webSearchPrice,
    openingBalanceUsd,
    closingBalanceUsd,
    observedBalanceDeltaUsd: openingBalanceUsd === null || closingBalanceUsd === null
      ? null
      : round(Math.max(0, openingBalanceUsd - closingBalanceUsd), 6),
    calculatedCostUsd: round(calculatedCostUsd, 6),
    cases: selectedCases.length,
    passed,
    failed: results.length - passed,
  }, null, 2)}\n`,
);
console.log(`Finished ${passed}/${selectedCases.length} passing cases. Results: ${resultPath.pathname}`);
