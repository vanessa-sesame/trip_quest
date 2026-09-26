// Public entry point for the printable A5 booklet. The renderer lives in:
//   document.ts  page planning, resource loading, createBookletPdf
//   layout.ts    text, flow cursor, bullet lists, pills and cards
//   context.ts   shared render context and page chrome
//   pages/       one module per page family
//   games/       one renderer per game mechanic
//   art/         vector fallback art
export {
  bookletPdfFilename,
  bookletPdfPageCount,
  bookletPdfPageTitles,
  createBookletPdf,
  familyPackPdfFilename,
  type ColoringImageResolver,
  type FamilyPackContext,
  type FontResolver,
} from "./document.ts";
