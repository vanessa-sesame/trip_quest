import type { PDFPage } from "pdf-lib";
import type { Activity } from "../../booklet/booklet.ts";
import type { PdfContext } from "../context.ts";
import type { Box } from "../layout.ts";

// Every game renderer draws one activity into a caller-sized box and owns
// nothing outside it. `context` seeds any generated puzzle or scene so the
// PDF and the web preview produce the same one.
//
// Renderers lay out from the top of the box and return the lowest y they
// drew to. With `fill` (the default) a game whose rows can stretch spreads
// them over the whole box; without it, rows keep their natural height so
// the page can give the space left below to the child's writing.
export type GameArgs = {
  ctx: PdfContext;
  page: PDFPage;
  activity: Activity;
  box: Box;
  context: string;
  fill?: boolean;
};
