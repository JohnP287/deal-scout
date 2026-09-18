import { db, retailerFromUrl, safeRetailerUrl } from "@/lib/deals";
import { scanAuthorized } from "@/lib/scan-auth";

export const dynamic = "force-dynamic";

type Incoming = {
  id?: number; url?: string; title?: string; category?: string; msrp_cents?: number;
  price_cents?: number; currency?: string; availability?: string; condition?: string;
  confidence?: number; promo_code?: string | null; promotion_text?: string | null;
  source_type?: string; source_url?: string;
};

const clean = (value: unknown, max: number) => typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";

export async function POST(request: Request) {
  if (!(await scanAuthorized(request))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  let body: { observations?: Incoming[] };
  try { body = await request.json() as { observations?: Incoming[] }; } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!Array.isArray(body.observations) || body.observations.length < 1 || body.observations.length > 80) return Response.json({ error: "Send 1–80 observations." }, { status: 400 });

  let accepted = 0; let skipped = 0; let created = 0;
  for (const item of body.observations) {
    const price = Number(item.price_cents); const confidence = Math.round(Number(item.confidence));
    if (!Number.isSafeInteger(price) || price < 100 || price > 2_000_000 || !Number.isFinite(confidence) || confidence < 60 || confidence > 100) { skipped++; continue; }
    let product = item.id ? await db().prepare("SELECT id, url FROM products WHERE id = ? AND active = 1").bind(item.id).first<{ id: number; url: string }>() : null;
    let productUrl = product?.url ?? "";
    if (!product && item.url) {
      try { productUrl = safeRetailerUrl(item.url).url.toString(); } catch { skipped++; continue; }
      product = await db().prepare("SELECT id, url FROM products WHERE url = ? AND active = 1").bind(productUrl).first<{ id: number; url: string }>();
      if (!product) {
        const title = clean(item.title, 180); const category = clean(item.category, 40) || "Gaming hardware"; const msrp = Number(item.msrp_cents);
        if (title.length < 8) { skipped++; continue; }
        const result = await db().prepare("INSERT OR IGNORE INTO products (title, retailer, url, category, msrp_cents) VALUES (?, ?, ?, ?, ?)").bind(title, retailerFromUrl(productUrl), productUrl, category, Number.isSafeInteger(msrp) && msrp >= price && msrp <= 2_000_000 ? msrp : 0).run();
        if (result.meta.changes) created++;
        product = await db().prepare("SELECT id, url FROM products WHERE url = ?").bind(productUrl).first<{ id: number; url: string }>();
      }
    }
    if (!product) { skipped++; continue; }
    const incomingMsrp = Number(item.msrp_cents);
    if (Number.isSafeInteger(incomingMsrp) && incomingMsrp >= price && incomingMsrp <= 2_000_000) {
      await db().prepare("UPDATE products SET msrp_cents = CASE WHEN msrp_cents = 0 THEN ? ELSE msrp_cents END, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(incomingMsrp, product.id).run();
    }
    const requestedSourceType = clean(item.source_type, 30);
    const listingOnly = requestedSourceType === "github-listing";
    const availability = listingOnly ? "Unknown" : clean(item.availability, 40) || null; const condition = clean(item.condition, 40) || "NewCondition";
    const promo = clean(item.promo_code, 28).toUpperCase(); const validPromo = /^[A-Z0-9][A-Z0-9-]{2,27}$/.test(promo) ? promo : null;
    const promotionText = validPromo ? clean(item.promotion_text, 180) || `Use code ${validPromo}` : null;
    const sourceType = ["github-direct", "github-listing", "retailer-api"].includes(requestedSourceType) ? requestedSourceType : "github-direct";
    const storedConfidence = listingOnly ? Math.min(confidence, 72) : confidence;
    let sourceUrl = productUrl;
    if (item.source_url) { try { sourceUrl = safeRetailerUrl(item.source_url).url.toString(); } catch { sourceUrl = productUrl; } }
    const duplicate = await db().prepare("SELECT id FROM observations WHERE product_id = ? AND price_cents = ? AND coalesce(availability, '') = coalesce(?, '') AND coalesce(promo_code, '') = coalesce(?, '') AND checked_at >= datetime('now', '-20 minutes') LIMIT 1").bind(product.id, price, availability, validPromo).first();
    if (duplicate) { skipped++; continue; }
    await db().batch([
      db().prepare("INSERT INTO observations (product_id, price_cents, currency, availability, condition, confidence, error, promo_code, promotion_text, source_type, source_url) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)").bind(product.id, price, clean(item.currency, 8) || "USD", availability, condition, storedConfidence, validPromo, promotionText, sourceType, sourceUrl),
      db().prepare("UPDATE products SET last_checked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(product.id),
    ]);
    accepted++;
  }
  return Response.json({ accepted, skipped, created, at: new Date().toISOString() });
}
