import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const products = sqliteTable("products", {
  id: integer("id").primaryKey({ autoIncrement: true }), title: text("title").notNull(), retailer: text("retailer").notNull(), url: text("url").notNull().unique(), category: text("category").notNull().default("Other"), canonicalKey: text("canonical_key"), manufacturer: text("manufacturer"), model: text("model"), sku: text("sku"), gtin: text("gtin"), imageUrl: text("image_url"), msrpCents: integer("msrp_cents").notNull(), msrpSourceUrl: text("msrp_source_url"), expectedResaleCents: integer("expected_resale_cents"), resaleSourceUrl: text("resale_source_url"), resaleVerifiedAt: text("resale_verified_at"), active: integer("active").notNull().default(1), lastCheckedAt: text("last_checked_at"), createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`), updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("idx_products_canonical").on(table.canonicalKey), index("idx_products_category_active").on(table.category, table.active)]);
export const observations = sqliteTable("observations", {
  id: integer("id").primaryKey({ autoIncrement: true }), productId: integer("product_id").notNull().references(() => products.id, { onDelete: "cascade" }), priceCents: integer("price_cents"), effectivePriceCents: integer("effective_price_cents"), currency: text("currency"), availability: text("availability"), stockStatus: text("stock_status"), stockEvidence: text("stock_evidence"), stockConfidence: integer("stock_confidence"), seller: text("seller"), condition: text("condition"), confidence: integer("confidence"), error: text("error"), promoCode: text("promo_code"), promotionText: text("promotion_text"), sourceType: text("source_type"), sourceUrl: text("source_url"), checkedAt: text("checked_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_observations_product_checked").on(table.productId, table.checkedAt),
  index("idx_observations_product_success").on(table.productId, table.checkedAt).where(sql`${table.priceCents} IS NOT NULL`),
]);

export const providerHealth = sqliteTable("provider_health", {
  id: text("id").primaryKey(), providerName: text("provider_name").notNull(), status: text("status").notNull().default("UNKNOWN"), consecutiveFailures: integer("consecutive_failures").notNull().default(0), successfulRequests: integer("successful_requests").notNull().default(0), failedRequests: integer("failed_requests").notNull().default(0), responseMsTotal: integer("response_ms_total").notNull().default(0), productsDiscovered: integer("products_discovered").notNull().default(0), productsVerified: integer("products_verified").notNull().default(0), lastAttemptAt: text("last_attempt_at"), lastSuccessAt: text("last_success_at"), nextRetryAt: text("next_retry_at"), lastError: text("last_error"), updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("idx_provider_health_status").on(table.status, table.nextRetryAt)]);

export const watches = sqliteTable("watches", {
  id: integer("id").primaryKey({ autoIncrement: true }), clientId: text("client_id").notNull(), targetType: text("target_type").notNull(), targetValue: text("target_value").notNull(), maxPriceCents: integer("max_price_cents"), minDiscountPercent: integer("min_discount_percent"), retailer: text("retailer"), eventTypes: text("event_types").notNull().default("RESTOCK,PRICE_DROP,THRESHOLD,PROMO_CODE"), active: integer("active").notNull().default(1), createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`), updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("idx_watches_client_active").on(table.clientId, table.active), index("idx_watches_target").on(table.targetType, table.targetValue)]);

export const alertEvents = sqliteTable("alert_events", {
  id: integer("id").primaryKey({ autoIncrement: true }), watchId: integer("watch_id").notNull().references(() => watches.id, { onDelete: "cascade" }), productId: integer("product_id").references(() => products.id, { onDelete: "cascade" }), eventType: text("event_type").notNull(), eventKey: text("event_key").notNull().unique(), title: text("title").notNull(), message: text("message").notNull(), createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`), seenAt: text("seen_at"),
}, (table) => [index("idx_alerts_watch_created").on(table.watchId, table.createdAt)]);

export const promoCodes = sqliteTable("promo_codes", {
  id: integer("id").primaryKey({ autoIncrement: true }), productId: integer("product_id").references(() => products.id, { onDelete: "cascade" }), retailer: text("retailer").notNull(), code: text("code").notNull(), status: text("status").notNull(), eligibleText: text("eligible_text"), discountText: text("discount_text"), minimumPurchaseCents: integer("minimum_purchase_cents"), expiresAt: text("expires_at"), requirements: text("requirements"), stacks: integer("stacks"), sourceUrl: text("source_url").notNull(), confidence: integer("confidence").notNull(), lastVerifiedAt: text("last_verified_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("idx_promos_retailer_status").on(table.retailer, table.status), index("idx_promos_product").on(table.productId)]);
