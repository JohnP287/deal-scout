import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const products = sqliteTable("products", {
  id: integer("id").primaryKey({ autoIncrement: true }), title: text("title").notNull(), retailer: text("retailer").notNull(), url: text("url").notNull().unique(), category: text("category").notNull().default("Other"), msrpCents: integer("msrp_cents").notNull(), expectedResaleCents: integer("expected_resale_cents"), active: integer("active").notNull().default(1), lastCheckedAt: text("last_checked_at"), createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`), updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
export const observations = sqliteTable("observations", {
  id: integer("id").primaryKey({ autoIncrement: true }), productId: integer("product_id").notNull().references(() => products.id, { onDelete: "cascade" }), priceCents: integer("price_cents"), currency: text("currency"), availability: text("availability"), condition: text("condition"), confidence: integer("confidence"), error: text("error"), promoCode: text("promo_code"), promotionText: text("promotion_text"), sourceType: text("source_type"), sourceUrl: text("source_url"), checkedAt: text("checked_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_observations_product_checked").on(table.productId, table.checkedAt),
  index("idx_observations_product_success").on(table.productId, table.checkedAt).where(sql`${table.priceCents} IS NOT NULL`),
]);
