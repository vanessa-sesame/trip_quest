"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Download, LoaderCircle, RefreshCw } from "lucide-react";

// The owner's library (see app/api/library/route.ts): every generated
// edition, newest first, with the files that make up its package: the
// booklet PDF, the sticker sheets, and a sample kit packing slip.

type Edition = {
  cacheKey: string;
  destination: string;
  age: number;
  days: number;
  generatedAt: string;
  expiresAt: number;
  expired: boolean;
  researchModel: string;
  composerModel: string;
  hasStoredPdf: boolean;
  available: boolean;
  storage: "ok" | "missing" | "unreadable";
  edition: string;
  children: Array<{ name: string; age: number }>;
  itinerary: string[];
};

type LibraryPage = {
  editions: Edition[];
  total: number;
  hasMore: boolean;
  limit: number;
  offset: number;
};

const PAGE_SIZE = 50;

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("en-SG", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// Imported itineraries can be long; the card shows the start of them.
function shortPlans(itinerary: string[]) {
  const text = itinerary.join(" · ").replace(/\s+/g, " ");
  return text.length > 140 ? `${text.slice(0, 137).trimEnd()}…` : text;
}

export default function LibraryPage() {
  const [page, setPage] = useState<LibraryPage | null>(null);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (nextOffset: number) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/library?limit=${PAGE_SIZE}&offset=${nextOffset}`, {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      const payload = (await response.json()) as LibraryPage & { error?: string };
      if (!response.ok) throw new Error(payload.error || "The library could not be loaded.");
      setPage(payload);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "The library could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Loading the current page of editions is the page's one job.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(offset);
  }, [load, offset]);

  const editions = page?.editions ?? [];

  return (
    <main className="orders-page">
      <header className="orders-header">
        <div>
          <p className="eyebrow">TripQuest library</p>
          <h1>Every generated booklet</h1>
          <p className="modal-subtitle">
            {page
              ? `${page.total} edition${page.total === 1 ? "" : "s"}, newest first. Each has its booklet PDF, sticker sheets and a sample packing slip.`
              : "Generated editions, newest first."}
          </p>
          <p className="orders-header-links">
            <Link href="/orders">Kit orders to print and post</Link>
            <Link href="/">Back to the studio</Link>
          </p>
        </div>
        <div className="orders-actions">
          <button className="icon-button" type="button" aria-label="Reload library" onClick={() => void load(offset)}>
            <RefreshCw size={18} />
          </button>
        </div>
      </header>

      {error ? <p className="form-error" role="alert">{error}{/owner/i.test(error) ? <> <a href="/owner">Sign in as owner</a></> : null}</p> : null}
      {loading && !page ? (
        <p className="orders-empty"><LoaderCircle className="spin" size={18} /> Loading editions…</p>
      ) : null}
      {page && !editions.length ? <p className="orders-empty">No booklets have been generated yet.</p> : null}

      <ul className="orders-list">
        {editions.map((edition) => {
          const file = (kind: string) => `/api/library?key=${encodeURIComponent(edition.cacheKey)}&file=${kind}`;
          const children = edition.children
            .map((child, index) => `${child.name.trim() || `Explorer ${index + 1}`} (${child.age})`)
            .join(", ");
          const expired = edition.expired;
          return (
            <li key={edition.cacheKey} className="order-card">
              <div className="order-card-top">
                <div>
                  <strong>{edition.destination} · {edition.days} day{edition.days === 1 ? "" : "s"} · age {edition.age}</strong>
                  <span>
                    {formatDate(edition.generatedAt)}
                    {edition.edition ? ` · edition ${edition.edition}` : ""}
                    {children ? ` · ${children}` : ""}
                  </span>
                </div>
                <span className={`order-status${edition.available ? (expired ? "" : " order-status-shipped") : " order-status-late"}`}>
                  {edition.storage === "unreadable" ? "Older format" : !edition.available ? "Booklet missing" : expired ? "Cache expired" : edition.hasStoredPdf ? "PDF cached" : "Ready"}
                </span>
              </div>
              <div className="library-meta">
                {edition.itinerary.length ? <span title={edition.itinerary.join("\n")}>Plans: {shortPlans(edition.itinerary)}</span> : <span>Open itinerary</span>}
                <span>Models: {edition.researchModel === edition.composerModel ? edition.composerModel : `${edition.researchModel} / ${edition.composerModel}`}</span>
              </div>
              {edition.available ? (
                <div className="order-buttons">
                  <a className="secondary-button" href={file("booklet")} download><Download size={16} /> Booklet PDF</a>
                  <a className="secondary-button" href={file("stickers")} download><Download size={16} /> Sticker sheets</a>
                  <a className="secondary-button" href={file("slip")} download><Download size={16} /> Sample packing slip</a>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      {page && (page.offset > 0 || page.hasMore) ? (
        <nav className="library-pager" aria-label="Library pages">
          <button
            className="secondary-button"
            type="button"
            disabled={loading || page.offset === 0}
            onClick={() => setOffset(Math.max(0, page.offset - PAGE_SIZE))}
          >
            Newer
          </button>
          <button
            className="secondary-button"
            type="button"
            disabled={loading || !page.hasMore}
            onClick={() => setOffset(page.offset + PAGE_SIZE)}
          >
            Older
          </button>
        </nav>
      ) : null}
    </main>
  );
}
