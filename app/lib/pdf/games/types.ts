import type { PDFPage } from "pdf-lib";
import type { Activity } from "../../booklet/booklet.ts";
import type { PdfContext } from "../context.ts";
import type { Box } from "../layout.ts";

// Every game renderer draws one activity into a caller-sized box and owns
// nothing outside it. `context` seeds any generated puzzle or scene so the
// PDF and the web preview produce the same one.
export type GameArgs = {
  ctx: PdfContext;
  page: PDFPage;
  activity: Activity;
  box: Box;
  context: string;
};
