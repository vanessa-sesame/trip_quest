"use client";

import { useEffect, useRef, useState } from "react";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import type { GeneratedBookletData } from "../lib/generation/booklet-ai";
import type { FamilyPackContext } from "../lib/pdf/context";

// The web preview draws the real printable PDF: the booklet is built in the
// browser with the same renderer the download uses (app/lib/pdf/document.ts)
// and each page is rasterized with pdf.js, so what a parent sees is exactly
// what prints. Both libraries load on demand, only once the preview shows.

// pdf.js 6 has no PDFDocumentProxy.destroy(); a document is released
// through the loading task that opened it.
function releasePdf(pdf: PDFDocumentProxy) {
  void pdf.loadingTask.destroy();
}

async function sameOriginBytes(path: string) {
  if (!path.startsWith("/") || path.startsWith("//")) return null;
  const response = await fetch(path);
  if (!response.ok) return null;
  return new Uint8Array(await response.arrayBuffer());
}

async function buildPdf(booklet: GeneratedBookletData, familyPack: FamilyPackContext | undefined) {
  const [{ createBookletPdf }, pdfjs] = await Promise.all([
    import("../lib/pdf/document"),
    import("pdfjs-dist"),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const bytes = await createBookletPdf(booklet, familyPack, sameOriginBytes, sameOriginBytes);
  return pdfjs.getDocument({ data: bytes }).promise;
}

async function fetchServerPdf(request: ServerPdfRequest) {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const response = await fetch(request.url, {
    method: "POST",
    headers: { Accept: "application/pdf", "Content-Type": "application/json" },
    body: JSON.stringify(request.body),
  });
  if (!response.ok || !(response.headers.get("content-type") || "").includes("application/pdf")) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error || "The exact printable PDF could not be prepared.");
  }
  return pdfjs.getDocument({ data: new Uint8Array(await response.arrayBuffer()) }).promise;
}

export type ServerPdfRequest = {
  url: string;
  body: Record<string, unknown>;
};

export function PdfPreview({
  booklet,
  familyPack,
  documentKey,
  page,
  zoom,
  serverPdfRequest,
  onPageCount,
}: {
  booklet: GeneratedBookletData;
  familyPack?: FamilyPackContext;
  // Changes whenever the booklet content changes; the PDF is rebuilt then.
  documentKey: string;
  page: number;
  zoom: number;
  // Once a real edition exists, render the same server PDF endpoint used by
  // download. Draft/sample previews still use the client renderer so the UI
  // can stay responsive before a stored edition exists.
  serverPdfRequest?: ServerPdfRequest;
  onPageCount?: (count: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [built, setBuilt] = useState<{ key: string; pdf: PDFDocumentProxy } | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [width, setWidth] = useState(0);
  const pdf = built?.pdf ?? null;
  const latest = useRef({ booklet, familyPack, onPageCount, serverPdfRequest });
  useEffect(() => {
    latest.current = { booklet, familyPack, onPageCount, serverPdfRequest };
  });

  // Rebuild the PDF when the booklet changes (debounced: streaming days
  // arrive in quick succession). The previous pages stay on screen until
  // the new ones are ready.
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      const pdfPromise = latest.current.serverPdfRequest
        ? fetchServerPdf(latest.current.serverPdfRequest)
        : buildPdf(latest.current.booklet, latest.current.familyPack);
      pdfPromise
        .then((document) => {
          if (cancelled) {
            releasePdf(document);
            return;
          }
          setBuilt((previous) => {
            if (previous) releasePdf(previous.pdf);
            return { key: documentKey, pdf: document };
          });
          setFailedKey(null);
          latest.current.onPageCount?.(document.numPages);
        })
        .catch((error) => {
          console.error("[TripQuest preview]", error);
          if (!cancelled) setFailedKey(documentKey);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [documentKey, attempt]);

  // Track the frame's width so pages are drawn sharp at any size.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!pdf || !canvas || !width) return;
    let task: RenderTask | null = null;
    let cancelled = false;
    void (async () => {
      const pageNumber = Math.min(Math.max(1, page + 1), pdf.numPages);
      const pdfPage = await pdf.getPage(pageNumber);
      if (cancelled) return;
      const base = pdfPage.getViewport({ scale: 1 });
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 3);
      const viewport = pdfPage.getViewport({ scale: (width / base.width) * pixelRatio });
      const context = canvas.getContext("2d");
      if (!context) return;
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      task = pdfPage.render({ canvasContext: context, viewport, canvas });
      await task.promise.catch(() => undefined);
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [pdf, page, width, zoom]);

  return (
    <div className="pdf-preview" ref={frameRef}>
      <canvas ref={canvasRef} aria-label={`Booklet page ${page + 1}`} role="img" />
      {!pdf && failedKey !== documentKey ? <p className="pdf-preview-status">Drawing your booklet…</p> : null}
      {failedKey === documentKey ? (
        <div className="pdf-preview-status">
          <p>The preview could not be drawn.</p>
          <button className="text-button" type="button" onClick={() => setAttempt((value) => value + 1)}>Try again</button>
        </div>
      ) : null}
    </div>
  );
}
