import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import {
  bookletPdfFilename,
  bookletPdfPageCount,
  createBookletPdf,
} from "../app/booklet-pdf.ts";
import { sampleGeneratedBooklet } from "./fixtures/generated-booklet.ts";

test("a generated booklet becomes a complete A4 PDF", async () => {
  const booklet = sampleGeneratedBooklet();
  const bytes = await createBookletPdf(booklet);
  const document = await PDFDocument.load(bytes);

  assert.equal(new TextDecoder().decode(bytes.slice(0, 4)), "%PDF");
  assert.equal(document.getPageCount(), bookletPdfPageCount(booklet));
  assert.equal(document.getPageCount(), 15);
  assert.equal(document.getTitle(), "Singapore Explorer - Age 7");
  for (const page of document.getPages()) {
    assert.ok(Math.abs(page.getWidth() - 595.28) < 0.1);
    assert.ok(Math.abs(page.getHeight() - 841.89) < 0.1);
  }
});

test("PDF filenames are stable and filesystem-safe", () => {
  assert.equal(
    bookletPdfFilename({ destination: "São Paulo, Brazil", age: 9 }),
    "tripquest-sao-paulo-brazil-age-9.pdf",
  );
});
