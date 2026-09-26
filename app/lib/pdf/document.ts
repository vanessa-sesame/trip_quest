import { PDFDocument, StandardFonts, type PDFImage } from "pdf-lib";
import * as fontkit from "fontkit";
import { curatedColoringImagePath } from "../booklet/coloring.ts";
import { activityContext, bookletDayPageEntries, type DayPageEntry } from "../booklet/pages.ts";
import { assertBookletQa } from "../booklet/qa.ts";
import type { GeneratedBookletData } from "../generation/booklet-ai.ts";
import { sniffImageContentType } from "../generation/illustration-ai.ts";
import {
  coloringArtworkKey,
  type ColoringArtwork,
  type ColoringImageResolver,
  type FamilyPackContext,
  type FontResolver,
  type PdfContext,
} from "./context.ts";
import type { Fonts } from "./layout.ts";
import { pdfText } from "./layout.ts";
import { drawActivityPage } from "./pages/activity.ts";
import {
  drawAnswerKeyPage,
  drawCertificate,
  drawMemoryPage,
  drawNotesPage,
} from "./pages/back.ts";
import { drawQueuePage, drawRevealPage } from "./pages/day.ts";
import {
  drawBadgeTrackerPage,
  drawFamilyMissionPage,
  drawFamilyRelayPage,
  drawMissionCardsPage,
} from "./pages/family.ts";
import { drawCover, drawGuide } from "./pages/front.ts";
import { drawTreatTrail } from "./pages/treats.ts";
import { colors, getDestinationTheme, typeScale } from "./theme.ts";

export type { ColoringImageResolver, FamilyPackContext, FontResolver } from "./context.ts";
import { normalizedBooklet, planBookletPages } from "./plan.ts";
import { stickersForBooklet } from "../booklet/stickers.ts";
export { bookletPdfPageCount, bookletPdfPageTitles } from "./plan.ts";

// Self-hosted in public/fonts/ (see public/fonts/manifest.json, both OFL).
// pdf-lib has no complex-shaping support, so only faces without required
// ligatures work; handwriting faces like Caveat and Patrick Hand broke words.
const FONT_ASSETS = {
  display: "/fonts/ShortStack-Regular.ttf",
  regular: "/fonts/NunitoSans-Regular.ttf",
  bold: "/fonts/NunitoSans-Bold.ttf",
} as const;

export function bookletPdfFilename(booklet: Pick<GeneratedBookletData, "destination" | "age">) {
  const destination = pdfText(booklet.destination)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "destination";
  return `tripquest-${destination}-age-${booklet.age}.pdf`;
}

export function familyPackPdfFilename(booklet: Pick<GeneratedBookletData, "destination" | "age">) {
  return bookletPdfFilename(booklet).replace(/\.pdf$/i, "-family-pack.pdf");
}

// Embeds the font at `path` when a resolver can supply it, falling back to
// a standard face: a booklet must never fail over a missing font file.
async function loadFont(document: PDFDocument, resolveFontBytes: FontResolver | undefined, path: string, fallback: StandardFonts) {
  if (resolveFontBytes) {
    try {
      const bytes = await resolveFontBytes(path);
      if (bytes) return await document.embedFont(bytes);
    } catch (error) {
      console.error(`[TripQuest font] ${path}`, error);
    }
  }
  return document.embedFont(fallback);
}

// Illustrations come from either image provider, which return different
// formats, so sniff instead of assuming PNG.
function embedIllustration(document: PDFDocument, bytes: Uint8Array) {
  return sniffImageContentType(bytes) === "image/jpeg" ? document.embedJpg(bytes) : document.embedPng(bytes);
}

async function loadArtwork(document: PDFDocument, booklet: GeneratedBookletData, resolve: ColoringImageResolver) {
  const artwork: ColoringArtwork = {};
  const revealArtwork: Record<number, PDFImage> = {};
  const imageRequests = new Map<string, string>();
  // Curated art is shared across the scene library, so only the first
  // activity to reach a curated picture gets it; later ones fall back to
  // their vector scene instead of repeating the same picture.
  const usedCuratedPaths = new Set<string>();
  booklet.dayPlans.forEach((day) => {
    bookletDayPageEntries([day]).forEach((entry) => {
      if (entry.kind !== "activity") return;
      const activity = entry.activity;
      if (activity.gameType !== "coloring" && activity.gameType !== "drawing") return;
      const context = activityContext(day, entry.slot);
      if (activity.illustrationPath) {
        imageRequests.set(coloringArtworkKey(activity, context), activity.illustrationPath);
        return;
      }
      const path = curatedColoringImagePath(activity, context);
      if (!path || usedCuratedPaths.has(path)) return;
      usedCuratedPaths.add(path);
      imageRequests.set(coloringArtworkKey(activity, context), path);
    });
  });
  // Spot-the-difference picture pairs, keyed by their own paths.
  booklet.dayPlans.forEach((day) => {
    bookletDayPageEntries([day]).forEach((entry) => {
      const pictures = entry.kind === "activity" ? entry.activity.differencePaths : undefined;
      if (entry.kind !== "activity" || entry.activity.gameType !== "spot_the_difference" || !pictures) return;
      imageRequests.set(pictures.a, pictures.a);
      imageRequests.set(pictures.b, pictures.b);
    });
  });
  const revealRequests = new Map<number, string>();
  booklet.dayPlans.forEach((day, dayIndex) => {
    if (day.slots.questReveal?.photoPath) revealRequests.set(dayIndex, day.slots.questReveal.photoPath);
  });

  const fetchBytes = async (path: string, label: string) => {
    try {
      return await resolve(path);
    } catch (error) {
      console.error(`[TripQuest illustration] ${label}`, error);
      return null;
    }
  };
  // Reads run together; PDF mutation stays sequential.
  const [images, reveals, cover] = await Promise.all([
    Promise.all(Array.from(imageRequests, async ([key, path]) => ({ key, bytes: await fetchBytes(path, key) }))),
    Promise.all(Array.from(revealRequests, async ([dayIndex, path]) => ({ dayIndex, bytes: await fetchBytes(path, `reveal photo day ${dayIndex + 1}`) }))),
    booklet.coverIllustrationPath ? fetchBytes(booklet.coverIllustrationPath, "cover art") : Promise.resolve(null),
  ]);
  for (const { key, bytes } of images) if (bytes) artwork[key] = await embedIllustration(document, bytes);
  for (const { dayIndex, bytes } of reveals) if (bytes) revealArtwork[dayIndex] = await embedIllustration(document, bytes);
  const coverArtwork = cover ? await embedIllustration(document, cover) : undefined;
  return { artwork, revealArtwork, coverArtwork };
}

function drawDayEntry(ctx: PdfContext, entry: DayPageEntry) {
  const { day } = entry;
  const dayIndex = ctx.booklet.dayPlans.indexOf(day);
  const { theme } = ctx;
  switch (entry.kind) {
    case "queue":
      return drawQueuePage(ctx, day);
    case "reveal":
      return drawRevealPage(ctx, day, dayIndex);
    case "queueGame":
      return drawActivityPage(ctx, day, entry.activity, {
        stickerSpot: { page: "activity", day: day.day, slot: "queueGame" },
        kicker: `Day ${day.day} / While you wait`,
        accent: colors.yellow,
        soft: colors.yellowSoft,
        context: activityContext(day, "queueGame"),
      });
    case "activity": {
      const sitDown = entry.slot === "sitDown";
      return drawActivityPage(ctx, day, entry.activity, {
        stickerSpot: { page: "activity", day: day.day, slot: entry.slot },
        kicker: `Day ${day.day} / ${sitDown ? "Sit-down page" : "In the place"}`,
        accent: sitDown ? colors.teal : entry.slot === "inThePlaceSecond" ? colors.green : theme.accent,
        soft: sitDown ? colors.tealSoft : entry.slot === "inThePlaceSecond" ? colors.greenSoft : theme.accentSoft,
        context: activityContext(day, entry.slot),
      });
    }
  }
}

export async function createBookletPdf(
  inputBooklet: GeneratedBookletData,
  familyPack?: FamilyPackContext,
  resolveColoringImage?: ColoringImageResolver,
  resolveFontBytes?: FontResolver,
  hooks: { onStickerSpot?: PdfContext["onStickerSpot"] } = {},
) {
  const booklet = normalizedBooklet(inputBooklet);
  assertBookletQa(booklet);
  const document = await PDFDocument.create();
  document.registerFontkit(fontkit);
  const fonts: Fonts = {
    regular: await loadFont(document, resolveFontBytes, FONT_ASSETS.regular, StandardFonts.Helvetica),
    bold: await loadFont(document, resolveFontBytes, FONT_ASSETS.bold, StandardFonts.HelveticaBold),
    mono: await document.embedFont(StandardFonts.Courier),
    monoBold: await document.embedFont(StandardFonts.CourierBold),
    display: await loadFont(document, resolveFontBytes, FONT_ASSETS.display, StandardFonts.HelveticaBold),
  };
  const art = resolveColoringImage
    ? await loadArtwork(document, booklet, resolveColoringImage)
    : { artwork: {}, revealArtwork: {}, coverArtwork: undefined };
  const plan = planBookletPages(booklet, Boolean(familyPack));

  document.setTitle(`${pdfText(booklet.destination)} Explorer - Age ${booklet.age}`);
  document.setAuthor("TripQuest");
  document.setSubject("Printable family travel activity booklet (A5)");
  document.setKeywords(["travel", "children", "activity booklet", pdfText(booklet.destination)]);
  document.setCreator("TripQuest Kids");
  document.setProducer("TripQuest Kids");
  document.setCreationDate(new Date(booklet.generatedAt));
  document.setModificationDate(new Date());

  const ctx: PdfContext = {
    document,
    fonts,
    booklet,
    theme: getDestinationTheme(booklet.destination),
    type: typeScale(booklet.age),
    totalPages: plan.length,
    pageNumber: 0,
    artwork: art.artwork,
    revealArtwork: art.revealArtwork,
    coverArtwork: art.coverArtwork,
    familyPack,
    stickers: stickersForBooklet(booklet, familyPack),
    onStickerSpot: hooks.onStickerSpot,
  };
  for (const page of plan) {
    switch (page.kind) {
      case "cover": drawCover(ctx); break;
      case "guide": drawGuide(ctx); break;
      case "treats": drawTreatTrail(ctx); break;
      case "day": drawDayEntry(ctx, page.entry); break;
      case "notes": drawNotesPage(ctx); break;
      case "answers": drawAnswerKeyPage(ctx, page.entries, page.part, page.parts); break;
      case "memory": drawMemoryPage(ctx); break;
      case "certificate": drawCertificate(ctx); break;
      case "relay": drawFamilyRelayPage(ctx, familyPack!, page.days, page.part, page.parts); break;
      case "familyMission": drawFamilyMissionPage(ctx, familyPack!); break;
      case "missionCards": drawMissionCardsPage(ctx, familyPack!); break;
      case "badges": drawBadgeTrackerPage(ctx); break;
    }
  }
  return document.save();
}
