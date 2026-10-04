import { libraryPageFrom, listLibraryEditions, readLibraryEdition } from "../../lib/library";
import { createPackingSlipPdf } from "../../lib/pdf/packing-slip";
import { normalizePdfRequest } from "../../lib/pdf/request";
import {
  errorResponse,
  getRuntimeEnvironment,
  isOwnerRequest,
  pdfKindFrom,
  pdfResponse,
  renderEditionPdf,
  staticAssetResolver,
} from "../../lib/pdf/serve";

export const dynamic = "force-dynamic";

// The owner's library: every generated edition, newest first, with its
// files (booklet PDF, sticker sheets, and a sample packing slip). Only the
// site owner may use it.

const noStore = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  try {
    const runtime = await getRuntimeEnvironment();
    if (!isOwnerRequest(request, runtime)) {
      return Response.json({ error: "Only the TripQuest owner can see the library." }, { status: 403, headers: noStore });
    }
    if (!runtime.DB || !runtime.BOOKLET_FILES) {
      return Response.json({ error: "Booklet storage is not connected yet." }, { status: 503, headers: noStore });
    }
    const url = new URL(request.url);
    const key = url.searchParams.get("key")?.trim().toLocaleLowerCase() || "";
    if (!key) {
      const page = libraryPageFrom(url.searchParams.get("limit"), url.searchParams.get("offset"));
      return Response.json(await listLibraryEditions(runtime.DB, runtime.BOOKLET_FILES, page), { headers: noStore });
    }

    const found = await readLibraryEdition(runtime.DB, runtime.BOOKLET_FILES, key);
    if (!found) return Response.json({ error: "Edition not found." }, { status: 404, headers: noStore });
    if (!found.booklet) {
      return Response.json({ error: "This edition's booklet is no longer in storage." }, { status: 410, headers: noStore });
    }
    const { row, booklet, fingerprint } = found;
    const input = normalizePdfRequest({
      destination: booklet.destination,
      age: booklet.age,
      days: booklet.days,
      itinerary: booklet.itinerary,
      family: booklet.family ?? [],
      events: booklet.events ?? [],
    }, row.researchModel, row.composerModel);

    if (url.searchParams.get("file") === "slip") {
      const slip = await createPackingSlipPdf({
        purchaseId: `SAMPLE${row.cacheKey.slice(0, 2)}`,
        createdAt: Date.parse(row.generatedAt) || Date.now(),
        shipping: null,
        destination: input.destination,
        age: input.age,
        days: input.days,
        family: input.family,
        editionFingerprint: fingerprint,
      }, staticAssetResolver(request, runtime));
      return pdfResponse(slip, `tripquest-sample-packing-slip-${fingerprint.slice(0, 8)}.pdf`, "generated", fingerprint);
    }
    return renderEditionPdf(request, runtime, {
      booklet,
      editionFingerprint: fingerprint,
      cacheKey: row.cacheKey,
      input,
      purchase: null,
      kind: pdfKindFrom(url.searchParams.get("file")),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
