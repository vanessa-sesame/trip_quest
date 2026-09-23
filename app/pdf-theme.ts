import { rgb, type RGB } from "pdf-lib";

// Central design tokens for the printable PDF booklet (app/booklet-pdf.ts).
// Kept as plain data (no pdf-lib drawing calls) so page-composition code and
// the illustration primitives (app/pdf-illustrations.ts) both read from the
// same source instead of each hardcoding its own values.

export const palette = {
  paper: rgb(0.985, 0.975, 0.945),
  white: rgb(1, 1, 1),
  // Dark ink-navy-green, not black — the brief's "dark ink green/navy"
  ink: rgb(0.075, 0.2, 0.19),
  muted: rgb(0.36, 0.43, 0.41),
  line: rgb(0.78, 0.75, 0.66),
  softLine: rgb(0.9, 0.88, 0.81),
  // Terracotta rather than a saturated digital red
  coral: rgb(0.82, 0.37, 0.27),
  coralSoft: rgb(0.97, 0.89, 0.84),
  // Muted botanical green, not a bright UI-success green
  green: rgb(0.42, 0.55, 0.28),
  greenSoft: rgb(0.9, 0.94, 0.85),
  // Warm sun/ochre yellow
  yellow: rgb(0.89, 0.68, 0.3),
  yellowSoft: rgb(0.99, 0.94, 0.8),
  // Mediterranean teal, slightly deeper than before
  teal: rgb(0.13, 0.46, 0.5),
  tealSoft: rgb(0.87, 0.93, 0.92),
  charcoal: rgb(0.12, 0.15, 0.15),
} as const;

export const spacing = {
  margin: 44,
  gap: 14,
} as const;

// Body-text sizing floor: the brief's print-practicality rule ("avoid tiny
// fonts") and age-5 readability rule both point at the same number — page
// composition code should treat this as the smallest size to use for any
// text a child (not just a grown-up) is meant to read.
export const minReadableSize = 8;

export type DestinationTheme = {
  id: string;
  aliases: string[];
  accent: RGB;
  accentSoft: RGB;
  // Which illustration-primitive motif family (app/pdf-illustrations.ts's
  // drawDestinationMotif) this destination uses. New destinations start on
  // "generic" and graduate to their own motif the same way Barcelona does
  // here — never leave a destination with no motif at all.
  motif: "mosaic" | "salamander" | "generic";
};

const destinationThemes: DestinationTheme[] = [
  {
    id: "barcelona",
    aliases: ["barcelona", "barcelone", "bcn"],
    accent: palette.coral,
    accentSoft: palette.coralSoft,
    // El Drac, the tiled salamander at Park Güell — a real, specific,
    // instantly-Barcelona icon, translated into original line art rather
    // than the generic mosaic-fragment cluster every other theme falls
    // back to.
    motif: "salamander",
  },
];

const defaultTheme: DestinationTheme = {
  id: "generic",
  aliases: [],
  accent: palette.teal,
  accentSoft: palette.tealSoft,
  motif: "generic",
};

function normalizeDestinationName(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

export function getDestinationTheme(destination: string): DestinationTheme {
  const normalized = normalizeDestinationName(destination);
  const match = destinationThemes.find((theme) =>
    theme.aliases.some((alias) => normalized.includes(alias)),
  );
  return match || defaultTheme;
}
