import { normalizeItinerary } from "../../booklet-ai";
import {
  bookletPdfFilename,
  createBookletPdf,
} from "../../booklet-pdf";
import {
  type BookletCacheIdentity,
  type BookletDatabase,
  type BookletObjectStorage,
  createBookletCacheKey,
  readStoredBooklet,
  readStoredBookletPdf,
  writeStoredBookletPdf,
} from "../../booklet-storage";

export const dynamic = "force-dynamic";

type RuntimeEnvironment = {
  BOOKLET_FILES?: BookletObjectStorage;
  DB?: BookletDatabase;
  KIMI_COMPOSER_MODEL?: string;
  KIMI_RESEARCH_MODEL?: string;
  TRIPQUEST_OWNER_EMAIL?: string;
};

const pdfJobs = new Map<string, Promise<Uint8Array>>();

async function getRuntimeEnvironment(): Promise<RuntimeEnvironment> {
  try {
    const workers = await import("cloudflare:workers");
    return workers.env as unknown as RuntimeEnvironment;
  } catch {
    return process.env as RuntimeEnvironment;
  }
}

function normalizeDestination(value: unknown) {
  if (typeof value !== "string") throw new Error("Enter a destination.");
  const destination = value.replace(/\s+/g, " ").trim();
  if (destination.length < 2 || destination.length > 70) {
    throw new Error("Enter a destination between 2 and 70 characters.");
  }
  return destination;
}

function requireInteger(value: unknown, minimum: number, maximum: number, label: string) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) {
    throw new Error(`${label} must be between ${minimum} and ${maximum}.`);
  }
  return number;
}

function isOwnerRequest(request: Request, runtime: RuntimeEnvironment) {
  const owner = runtime.TRIPQUEST_OWNER_EMAIL?.trim().toLocaleLowerCase();
  const visitor = request.headers
    .get("oai-authenticated-user-email")
    ?.trim()
    .toLocaleLowerCase();
  return Boolean(owner && visitor && owner === visitor);
}

function pdfResponse(bytes: ArrayBuffer | Uint8Array, filename: string, cache: string) {
  const body = bytes instanceof Uint8Array
    ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    : bytes;
  return new Response(body as ArrayBuffer, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(body.byteLength),
      "Content-Type": "application/pdf",
      "X-Content-Type-Options": "nosniff",
      "X-TripQuest-Pdf-Cache": cache,
    },
  });
}

export async function POST(request: Request) {
  try {
    const runtime = await getRuntimeEnvironment();
    if (!isOwnerRequest(request, runtime)) {
      return Response.json(
        {
          error:
            "Secure customer checkout is not connected yet. No charge was made.",
        },
        { status: 402 },
      );
    }
    if (!runtime.DB || !runtime.BOOKLET_FILES) {
      return Response.json(
        { error: "PDF storage is not connected yet." },
        { status: 503 },
      );
    }

    const body = (await request.json()) as Record<string, unknown>;
    const destination = normalizeDestination(body.destination);
    const age = requireInteger(body.age, 3, 14, "Age");
    const days = requireInteger(body.days, 1, 14, "Trip length");
    const itinerary = normalizeItinerary(body.itinerary, days);
    const identity: BookletCacheIdentity = {
      destination,
      age,
      days,
      itinerary,
      researchModel: runtime.KIMI_RESEARCH_MODEL?.trim() || "kimi-k3",
      composerModel: runtime.KIMI_COMPOSER_MODEL?.trim() || "kimi-k2.6",
    };
    const cacheKey = await createBookletCacheKey(identity);
    const booklet = await readStoredBooklet(
      runtime.DB,
      runtime.BOOKLET_FILES,
      cacheKey,
      identity,
    );
    if (!booklet) {
      return Response.json(
        { error: "Create this custom booklet before downloading its PDF." },
        { status: 404 },
      );
    }

    const filename = bookletPdfFilename(booklet);
    const stored = await readStoredBookletPdf(
      runtime.DB,
      runtime.BOOKLET_FILES,
      cacheKey,
    );
    if (stored) return pdfResponse(stored.bytes, filename, "durable");

    let job = pdfJobs.get(cacheKey);
    if (!job) {
      job = createBookletPdf(booklet);
      pdfJobs.set(cacheKey, job);
      void job.finally(() => pdfJobs.delete(cacheKey)).catch(() => undefined);
    }
    const pdf = await job;
    await writeStoredBookletPdf(runtime.DB, runtime.BOOKLET_FILES, {
      cacheKey,
      filename,
      pdf,
    });
    return pdfResponse(pdf, filename, "generated");
  } catch (error) {
    const message = error instanceof Error ? error.message : "The PDF could not be created.";
    console.error("[TripQuest PDF]", message);
    const isInputError = /destination|age|trip length|daily plans|day \d+ plan/i.test(message);
    return Response.json(
      {
        error: isInputError
          ? message
          : "The printable PDF could not be created. Please try again.",
      },
      { status: isInputError ? 400 : 500 },
    );
  }
}
