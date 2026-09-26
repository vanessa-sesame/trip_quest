// What TripQuest sells. Shared by the purchase window (labels) and the
// checkout (Stripe line items); STRIPE_KIT_PRICE_CENTS and
// STRIPE_PRICE_CENTS can override the amounts, so change these labels too
// when changing a price.

export type PurchaseProduct = "kit" | "pdf";

export const PRODUCTS = {
  kit: {
    name: "TripQuest explorer kit (mailed)",
    priceLabel: "S$19.90",
    defaultCents: 1990,
    note: "Singapore delivery included",
  },
  pdf: {
    name: "TripQuest printable family booklet",
    priceLabel: "S$0.99",
    defaultCents: 99,
    note: "Print at home",
  },
} as const satisfies Record<PurchaseProduct, { name: string; priceLabel: string; defaultCents: number; note: string }>;

// Working days from payment to posting a kit.
export const KIT_SHIPS_WITHIN_DAYS = 3;

export const KIT_CONTENTS = [
  "Printed A5 booklet, stapled and ready to go",
  "Custom sticker sheet with your child's name",
  "Mystery envelope to open at the end of the treat trail",
  "Mini coloured pencils and a zip pouch",
  "The PDF too, to print extra pages",
];

export function purchaseProductFrom(value: unknown): PurchaseProduct {
  return value === "kit" ? "kit" : "pdf";
}

export type FulfilmentStatus = "new" | "printed" | "shipped";

export function fulfilmentStatusFrom(value: unknown): FulfilmentStatus | null {
  return value === "new" || value === "printed" || value === "shipped" ? value : null;
}
