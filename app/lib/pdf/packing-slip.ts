import { PDFDocument, type PDFPage } from "pdf-lib";
import { familyChildDisplayName, type FamilyChild } from "../family.ts";
import type { ShippingDetails } from "../payment.ts";
import type { FontResolver } from "./context.ts";
import { loadBookletFonts } from "./document.ts";
import { drawCard, drawDottedLine, drawPill, drawText, pdfText, type Fonts } from "./layout.ts";
import { MARGIN, PAGE_HEIGHT, PAGE_SIZE, PAGE_WIDTH, CONTENT_WIDTH, colors } from "./theme.ts";

// An A5 packing slip for one kit order: what goes in the mailer, a note
// for the family, and a cut-off address label.

export type PackingSlipOrder = {
  purchaseId: string;
  createdAt: number;
  shipping: ShippingDetails | null;
  destination: string;
  age: number;
  days: number;
  family: FamilyChild[];
  editionFingerprint?: string;
};

function checkbox(page: PDFPage, x: number, y: number, size: number) {
  page.drawRectangle({ x, y, width: size, height: size, borderColor: colors.ink, borderWidth: 1 });
}

export function kitPackingList(order: Pick<PackingSlipOrder, "editionFingerprint">) {
  const edition = order.editionFingerprint ? ` (edition ${order.editionFingerprint.slice(0, 8).toUpperCase()})` : "";
  return [
    `Printed A5 booklet, saddle-stitched${edition}`,
    "Game sticker sheet(s), cut or punched",
    "Mystery envelope: envelope sticker sheet inside, sealed with its \"Open at the end!\" sticker",
    "Mini coloured pencils",
    "Zip pouch",
    "This slip (top half)",
  ];
}

export async function createPackingSlipPdf(order: PackingSlipOrder, resolveFontBytes?: FontResolver) {
  const document = await PDFDocument.create();
  const fonts: Fonts = await loadBookletFonts(document, resolveFontBytes);
  const page = document.addPage(PAGE_SIZE);
  page.drawRectangle({ x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT, color: colors.white });
  document.setTitle(`TripQuest packing slip ${order.purchaseId.slice(0, 8).toUpperCase()}`);

  const reference = order.purchaseId.slice(0, 8).toUpperCase();
  const date = new Date(order.createdAt).toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Singapore" });
  const names = order.family.length
    ? order.family.map((child, index) => `${pdfText(familyChildDisplayName(child, index))} (age ${child.age})`).join(", ")
    : `Explorer (age ${order.age})`;
  const leadName = order.family[0] ? pdfText(familyChildDisplayName(order.family[0], 0)) : "";
  const destination = pdfText(order.destination);

  let top = PAGE_HEIGHT - MARGIN + 6;
  const pill = drawPill(page, fonts, "Packing slip", { x: PAGE_WIDTH - MARGIN, top, color: colors.teal, fill: colors.tealSoft, size: 8.5, align: "right" });
  drawText(page, "TripQuest explorer kit", fonts, { x: MARGIN, top, width: pill.x - MARGIN - 8 }, { size: 17, font: fonts.display, color: colors.ink, maxLines: 1 });
  top -= 26;
  drawText(page, `Order ${reference} · ${date}`, fonts, { x: MARGIN, top, width: CONTENT_WIDTH }, { size: 9, color: colors.muted, maxLines: 1 });
  top -= 20;

  const madeFor = { x: MARGIN, y: top - 46, width: CONTENT_WIDTH, height: 46 };
  drawCard(page, madeFor, { fill: colors.yellowSoft });
  drawText(page, `For ${names}`, fonts, { x: madeFor.x + 12, top: madeFor.y + madeFor.height - 9, width: CONTENT_WIDTH - 24 }, { size: 10, font: fonts.bold, color: colors.ink, maxLines: 1 });
  drawText(page, `${destination} · ${order.days} ${order.days === 1 ? "day" : "days"} · age ${order.age} booklet`, fonts, {
    x: madeFor.x + 12, top: madeFor.y + madeFor.height - 25, width: CONTENT_WIDTH - 24,
  }, { size: 9, color: colors.muted, maxLines: 1 });
  top = madeFor.y - 16;

  drawText(page, "Pack these", fonts, { x: MARGIN, top, width: CONTENT_WIDTH }, { size: 10, font: fonts.bold, color: colors.teal, maxLines: 1 });
  top -= 18;
  for (const item of kitPackingList(order)) {
    checkbox(page, MARGIN, top - 11, 10);
    const block = drawText(page, item, fonts, { x: MARGIN + 18, top, width: CONTENT_WIDTH - 18 }, { size: 9.5, color: colors.ink, maxLines: 2 });
    top = block.bottom - 6;
  }
  top -= 6;

  const note = `Hi${leadName ? ` ${leadName}` : ""}! Your ${destination} adventure kit is here. Finish a game, add its sticker, and follow the treat trail to your mystery envelope. Have a wonderful trip!`;
  const noteBox = { x: MARGIN, y: top - 48, width: CONTENT_WIDTH, height: 48 };
  drawCard(page, noteBox, { fill: colors.coralSoft });
  drawText(page, note, fonts, { x: noteBox.x + 12, top: noteBox.y + noteBox.height - 10, width: CONTENT_WIDTH - 24 }, { size: 9.5, color: colors.ink, maxLines: 3 });

  // Cut-off address label.
  const cutY = 196;
  drawDottedLine(page, 14, PAGE_WIDTH - 14, cutY, colors.muted, 4, 3);
  drawText(page, "cut here · address label", fonts, { x: MARGIN, top: cutY - 5, width: CONTENT_WIDTH }, { size: 8, color: colors.muted, maxLines: 1, align: "center" });
  const label = { x: MARGIN, y: 44, width: CONTENT_WIDTH, height: cutY - 64 };
  page.drawRectangle({ ...label, borderColor: colors.ink, borderWidth: 1.2 });
  let labelTop = label.y + label.height - 10;
  drawText(page, "TO", fonts, { x: label.x + 12, top: labelTop, width: 40 }, { size: 8, font: fonts.bold, color: colors.muted, maxLines: 1 });
  labelTop -= 14;
  const shipping = order.shipping;
  const lines = shipping
    ? [
        shipping.name,
        shipping.address.line1,
        shipping.address.line2,
        [shipping.address.city === "Singapore" ? "" : shipping.address.city, shipping.address.country === "SG" ? "Singapore" : shipping.address.country, shipping.address.postalCode].filter(Boolean).join(" "),
        shipping.phone ? `Tel ${shipping.phone}` : "",
      ].filter(Boolean)
    : ["Shipping address missing: check the Stripe payment"];
  lines.forEach((line, index) => {
    const block = drawText(page, pdfText(line), fonts, { x: label.x + 12, top: labelTop, width: label.width - 24 }, {
      size: index === 0 ? 13 : 11.5, font: index === 0 ? fonts.bold : fonts.regular, color: colors.ink, maxLines: 1,
    });
    labelTop = block.bottom - 3;
  });
  drawText(page, `Ref ${reference}`, fonts, { x: label.x + 12, top: label.y + 16, width: label.width - 24 }, { size: 8, color: colors.muted, maxLines: 1, align: "right" });
  return document.save();
}
