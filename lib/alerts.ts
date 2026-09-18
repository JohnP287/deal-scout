import { env } from "cloudflare:workers";
import { alertEventKey, type StockStatus } from "@/lib/deal-core";

type ProductRow = { id: number; title: string; retailer: string; url: string; category: string; msrp_cents?: number };
function database() { if (!env.DB) throw new Error("Deal database unavailable"); return env.DB; }

type AlertObservation = { price_cents: number | null; stock_status: StockStatus; promo_code?: string | null };
type PreviousObservation = { price_cents: number | null; stock_status: StockStatus | null; promo_code: string | null } | null;

export async function evaluateAlerts(product: ProductRow, current: AlertObservation, previous: PreviousObservation) {
  const watches = await database().prepare(`SELECT * FROM watches WHERE active = 1 AND
    (retailer IS NULL OR lower(retailer)=lower(?)) AND
    ((target_type='PRODUCT' AND lower(target_value)=lower(?)) OR
     (target_type='CATEGORY' AND lower(target_value)=lower(?)) OR
     (target_type='QUERY' AND lower(?) LIKE '%' || lower(target_value) || '%'))`).bind(product.retailer, product.url, product.category, product.title).all<Record<string, unknown>>();
  for (const watch of watches.results ?? []) {
    const allowed = String(watch.event_types ?? "").split(",");
    const events: Array<{ type: string; value: string; message: string }> = [];
    if (allowed.includes("RESTOCK") && current.stock_status === "IN_STOCK" && previous?.stock_status && previous.stock_status !== "IN_STOCK") events.push({ type: "RESTOCK", value: current.stock_status, message: `${product.title} is confirmed in stock at ${product.retailer}.` });
    if (allowed.includes("PRICE_DROP") && current.price_cents && previous?.price_cents && current.price_cents < previous.price_cents) events.push({ type: "PRICE_DROP", value: String(current.price_cents), message: `${product.title} dropped from $${(previous.price_cents / 100).toFixed(2)} to $${(current.price_cents / 100).toFixed(2)}.` });
    if (allowed.includes("THRESHOLD") && current.price_cents && Number(watch.max_price_cents) > 0 && current.price_cents <= Number(watch.max_price_cents) && (!previous?.price_cents || previous.price_cents > Number(watch.max_price_cents))) events.push({ type: "THRESHOLD", value: String(current.price_cents), message: `${product.title} reached your target price at $${(current.price_cents / 100).toFixed(2)}.` });
    const discount = current.price_cents && product.msrp_cents ? Math.round((product.msrp_cents - current.price_cents) / product.msrp_cents * 100) : null;
    if (allowed.includes("THRESHOLD") && discount != null && Number(watch.min_discount_percent) > 0 && discount >= Number(watch.min_discount_percent)) events.push({ type: "THRESHOLD", value: `discount-${discount}`, message: `${product.title} reached ${discount}% below authoritative MSRP.` });
    if (allowed.includes("PROMO_CODE") && current.promo_code && current.promo_code !== previous?.promo_code) events.push({ type: "PROMO_CODE", value: current.promo_code, message: `A new reported promo code (${current.promo_code}) was found for ${product.title}. Verify it at checkout.` });
    for (const event of events) await database().prepare("INSERT OR IGNORE INTO alert_events (watch_id, product_id, event_type, event_key, title, message) VALUES (?, ?, ?, ?, ?, ?)").bind(Number(watch.id), product.id, event.type, alertEventKey(Number(watch.id), product.id, event.type, event.value), `${event.type.replace('_', ' ')} · ${product.retailer}`, event.message).run();
  }
}
