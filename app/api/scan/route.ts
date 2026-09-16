import { env } from "cloudflare:workers";
import { db, scanProduct, type ProductRow } from "@/lib/deals";
export const dynamic = "force-dynamic";
function authorized(request: Request) { const configured = env.CRON_SECRET; if (!configured) return true; const origin = request.headers.get("origin"); const sameOrigin = origin && new URL(origin).host === new URL(request.url).host; return sameOrigin || request.headers.get("authorization") === `Bearer ${configured}`; }
export async function POST(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const rows = await db().prepare("SELECT id, title, retailer, url, category, msrp_cents, expected_resale_cents, active FROM products WHERE active = 1 ORDER BY coalesce(last_checked_at, '1970-01-01') ASC LIMIT 20").all<ProductRow>(); const products = rows.results ?? []; let checked = 0;
  for (let i = 0; i < products.length; i += 4) { const results = await Promise.all(products.slice(i, i + 4).map(async (product) => ({ product, offer: await scanProduct(product) }))); await db().batch(results.flatMap(({ product, offer }) => [db().prepare("INSERT INTO observations (product_id, price_cents, currency, availability, condition, confidence, error) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(product.id, offer.price_cents, offer.currency, offer.availability, offer.condition, offer.confidence, offer.error), db().prepare("UPDATE products SET title = coalesce(?, title), last_checked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(offer.name, product.id)])); checked += results.length; }
  return Response.json({ checked, at: new Date().toISOString() });
}
