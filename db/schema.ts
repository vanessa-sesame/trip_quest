import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const destinationResearchCache = sqliteTable("destination_research_cache", {
  cacheKey: text("cache_key").primaryKey(),
  destination: text("destination").notNull(),
  researchJson: text("research_json").notNull(),
  researchModel: text("research_model").notNull(),
  cacheVersion: text("cache_version").notNull(),
  generatedAt: text("generated_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
});

export const bookletCache = sqliteTable("booklet_cache", {
  cacheKey: text("cache_key").primaryKey(),
  destination: text("destination").notNull(),
  age: integer("age").notNull(),
  days: integer("days").notNull(),
  artifactKey: text("artifact_key").notNull(),
  pdfKey: text("pdf_key"),
  researchModel: text("research_model").notNull(),
  composerModel: text("composer_model").notNull(),
  cacheVersion: text("cache_version").notNull(),
  generatedAt: text("generated_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
});

export const generationLocks = sqliteTable("generation_locks", {
  cacheKey: text("cache_key").primaryKey(),
  ownerId: text("owner_id").notNull(),
  expiresAt: integer("expires_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const generationRateLimits = sqliteTable("generation_rate_limits", {
  clientKey: text("client_key").primaryKey(),
  windowStart: integer("window_start").notNull(),
  requestCount: integer("request_count").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const familyWorkspaces = sqliteTable("family_workspaces", {
  familyId: text("family_id").primaryKey(),
  workspaceJson: text("workspace_json").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const purchaseEntitlements = sqliteTable("purchase_entitlements", {
  purchaseId: text("purchase_id").primaryKey(),
  checkoutSessionId: text("checkout_session_id").notNull().unique(),
  familyId: text("family_id").notNull(),
  cacheKey: text("cache_key").notNull(),
  requestJson: text("request_json").notNull(),
  status: text("status").notNull(),
  amountCents: integer("amount_cents").notNull(),
  currency: text("currency").notNull(),
  pdfKey: text("pdf_key"),
  // "kit" (printed and mailed) or "pdf" (download only).
  product: text("product").notNull().default("pdf"),
  // Kit orders: the Stripe-collected name, address, phone and email.
  shippingJson: text("shipping_json"),
  // Kit orders: "new", "printed" or "shipped".
  fulfilmentStatus: text("fulfilment_status"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
