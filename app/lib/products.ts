// What TripQuest sells. The printable PDF (booklet + sticker sheets) is
// free for anyone who created the booklet; the mailed explorer kit is the
// one paid product. Shared by the purchase window (labels) and the
// checkout (Stripe line item); STRIPE_KIT_PRICE_CENTS can override the
// amount, so change the label too when changing the price.

// "pdf" survives only on purchase rows from before the PDF became free
// (the D1 column still defaults to it); checkout sells only "kit".
export type PurchaseProduct = "kit" | "pdf";
export type CheckoutProduct = "kit";

export const PRODUCTS = {
  kit: {
    name: "TripQuest explorer kit (mailed)",
    priceLabel: "S$19.90",
    defaultCents: 1990,
    note: "Singapore delivery included",
  },
} as const satisfies Record<CheckoutProduct, { name: string; priceLabel: string; defaultCents: number; note: string }>;

// Working days from payment to posting a kit.
export const KIT_SHIPS_WITHIN_DAYS = 3;

export const KIT_CONTENTS = [
  "Printed A5 booklet, stapled and ready to go",
  "Custom sticker sheet with your child's name",
  "Mystery envelope to open at the end of the treat trail",
  "Mini coloured pencils and a zip pouch",
];

// Reads a stored purchase row's product. Unknown or missing values are the
// column default, "pdf".
export function purchaseProductFrom(value: unknown): PurchaseProduct {
  return value === "kit" ? "kit" : "pdf";
}

// Reads the product a checkout request asks for: only the kit is sold, and
// anything else (including an old page still asking for "pdf") is refused
// rather than silently charged as a kit.
export function checkoutProductFrom(value: unknown): CheckoutProduct | null {
  return value === "kit" ? "kit" : null;
}

export type FulfilmentStatus = "new" | "printed" | "shipped";

export function fulfilmentStatusFrom(value: unknown): FulfilmentStatus | null {
  return value === "new" || value === "printed" || value === "shipped" ? value : null;
}
