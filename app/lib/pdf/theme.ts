import { rgb, type RGB } from "pdf-lib";

// Central design tokens for the printable PDF booklet (app/lib/pdf/).
// Kept as plain data (no pdf-lib drawing calls) so page-composition code and
// the illustration primitives (app/lib/pdf/illustrations.ts) both read from the
// same source instead of each hardcoding its own values.

// These values are the print-safe (CMYK-friendlier, slightly desaturated)
// equivalents of the exact same tokens in app/globals.css's :root — same
// hues, same names, so the printed booklet and the on-screen preview read
// as one design rather than two. Retune both files together; don't change
// one without the other.
export const palette = {
  paper: rgb(0.985, 0.975, 0.945),
  white: rgb(1, 1, 1),
  // Dark ink-navy-green, not black — the brief's "dark ink green/navy"
  ink: rgb(0.075, 0.2, 0.19),
  muted: rgb(0.36, 0.43, 0.41),
  line: rgb(0.78, 0.75, 0.66),
  softLine: rgb(0.9, 0.88, 0.81),
  // Dusty terracotta blush ("--coral" in globals.css)
  coral: rgb(0.851, 0.478, 0.388),
  coralSoft: rgb(0.969, 0.886, 0.855),
  // Matcha sage ("--leaf" in globals.css)
  green: rgb(0.486, 0.58, 0.388),
  greenSoft: rgb(0.91, 0.925, 0.875),
  // Kinako/mustard ochre ("--sun" in globals.css)
  yellow: rgb(0.902, 0.675, 0.306),
  yellowSoft: rgb(0.98, 0.929, 0.816),
  // Aizome indigo ("--teal" in globals.css)
  teal: rgb(0.235, 0.431, 0.514),
  tealSoft: rgb(0.894, 0.933, 0.945),
  charcoal: rgb(0.12, 0.15, 0.15),
} as const;

// The legacy token names the page and game renderers were first written
// against — same hues as palette, with blue as the indigo "teal".
export const colors = {
  ...palette,
  blue: palette.teal,
  blueSoft: palette.tealSoft,
} as const;

// The booklet is printed on A5 (148 x 210 mm), so design sizes here are the
// sizes that reach paper — nothing is scaled down at print time.
export const PAGE_WIDTH = 419.53;
export const PAGE_HEIGHT = 595.28;
export const PAGE_SIZE: [number, number] = [PAGE_WIDTH, PAGE_HEIGHT];
export const MARGIN = 34;
export const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
// Everything a page draws sits between these two lines; the accent band
// above and the footer below belong to drawPageBase.
export const CONTENT_TOP = PAGE_HEIGHT - 40;
export const CONTENT_BOTTOM = 44;

export const spacing = {
  margin: MARGIN,
  gap: 12,
} as const;

// Rounded corners are the booklet's signature shape: cards and stickers use
// `card`, small chips/cells `chip`, full pills `pill` (half the height).
export const radius = {
  card: 12,
  chip: 7,
  cell: 5,
} as const;

// Nothing in the booklet is printed smaller than this.
export const minReadableSize = 8;

export type TypeScale = {
  display: number;
  title: number;
  heading: number;
  body: number;
  small: number;
  label: number;
  footer: number;
  lineHeight: number;
  // Distance between ruled writing lines (see writingLinePitch).
  writeLine: number;
};

const MM = 72 / 25.4;

// The space a child gets for one line of handwriting, by age: early
// writers form big letters (11mm), confident writers need ~9mm, older
// children ~7.5mm. Every ruled line, answer line and write-in blank in
// the booklet uses this one value, so no page picks its own.
export function writingLinePitch(age: number) {
  if (age <= 6) return 11 * MM;
  if (age <= 9) return 9.2 * MM;
  return 7.6 * MM;
}

// One type scale per age, applied everywhere, so no page picks its own
// sizes. Early readers get a larger body size; everything else is shared.
export function typeScale(age: number): TypeScale {
  const early = age <= 6;
  return {
    display: 26,
    title: 20,
    heading: 13.5,
    body: early ? 12.5 : 11,
    small: early ? 10.5 : 9.5,
    label: 8.5,
    footer: 8,
    lineHeight: 1.35,
    writeLine: writingLinePitch(age),
  };
}

export type DestinationTheme = {
  id: string;
  aliases: string[];
  accent: RGB;
  accentSoft: RGB;
  // Which illustration-primitive motif family (app/lib/pdf/illustrations.ts's
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
