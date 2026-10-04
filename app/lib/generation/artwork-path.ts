// Stored artwork (covers, page art, reveal photos, spot-the-difference
// pictures) lives in R2 under illustrations/v<N>/<sha256>/artwork.png and is
// served by /api/illustration. Every place that serves or re-validates
// these paths uses this one list, so a new storage version cannot be
// accepted by one and silently dropped by another (a v3 bump once left
// every new reveal photo out of the PDFs).
const ARTWORK_VERSIONS = "1|2|3";

const artworkKey = new RegExp(`^illustrations/v(?:${ARTWORK_VERSIONS})/[a-f0-9]{64}/artwork\\.png$`, "i");
const artworkPath = new RegExp(`^/api/illustration\\?key=illustrations%2Fv(?:${ARTWORK_VERSIONS})%2F[a-f0-9]{64}%2Fartwork\\.png$`, "i");

export function isStoredArtworkKey(key: string) {
  return artworkKey.test(key);
}

export function isStoredArtworkPath(value: unknown): value is string {
  return typeof value === "string" && artworkPath.test(value);
}
