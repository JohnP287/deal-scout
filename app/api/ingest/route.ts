import { db, retailerFromUrl, safeRetailerUrl, type ProductRow } from "@/lib/deals";
import { classifyStock, normalizeProduct, type StockStatus } from "@/lib/deal-core";
import { evaluateAlerts } from "@/lib/alerts";
import { scanAuthorized } from "@/lib/scan-auth";

export const dynamic = "force-dynamic";
type Incoming = { id?: number; url?: string; title?: string; category?: string; msrp_cents?: number; msrp_source_url?: string; price_cents?: number; effective_price_cents?: number; currency?: string; availability?: string; stock_status?: StockStatus; stock_evidence?: string; stock_confidence?: number; condition?: string; seller?: string; confidence?: number; promo_code?: string | null; promotion_text?: string | null; source_type?: string; source_url?: string; sku?: string; gtin?: string; image_url?: string };
const clean = (value: unknown, max: number) => typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";

export async function POST(request: Request) {
  if (!(await scanAuthorized(request))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  let body: { observations?: Incoming[] }; try { body = await request.json() as { observations?: Incoming[] }; } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!Array.isArray(body.observations) || body.observations.length < 1 || body.observations.length > 80) return Response.json({ error: "Send 1–80 observations." }, { status: 400 });
  let accepted = 0; let skipped = 0; let created = 0;
  for (const item of body.observations) {
    const price = Number(item.price_cents); const confidence = Math.round(Number(item.confidence));
    if (!Number.isSafeInteger(price) || price < 100 || price > 2_000_000 || !Number.isFinite(confidence) || confidence < 60 || confidence > 100) { skipped++; continue; }
    let product = item.id ? await db().prepare("SELECT * FROM products WHERE id=? AND active=1").bind(item.id).first<ProductRow>() : null; let productUrl = product?.url ?? "";
    if (!product && item.url) {
      try { productUrl = safeRetailerUrl(item.url).url.toString(); } catch { skipped++; continue; }
      product = await db().prepare("SELECT * FROM products WHERE url=? AND active=1").bind(productUrl).first<ProductRow>();
      if (!product) {
        const title = clean(item.title, 180); const normalized = normalizeProduct(title); const msrp = Number(item.msrp_cents);
        if (title.length < 8 || normalized.suspicious) { skipped++; continue; }
        const result = await db().prepare("INSERT OR IGNORE INTO products (title, retailer, url, category, canonical_key, manufacturer, model, msrp_cents, msrp_source_url, sku, gtin, image_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(title, retailerFromUrl(productUrl), productUrl, clean(item.category, 40) || "Gaming hardware", normalized.canonicalKey, normalized.manufacturer, normalized.model, Number.isSafeInteger(msrp) && msrp >= price ? msrp : 0, clean(item.msrp_source_url, 500) || null, clean(item.sku, 80) || null, clean(item.gtin, 32) || null, /^https:\/\//.test(clean(item.image_url, 800)) ? clean(item.image_url, 800) : null).run();
        if (result.meta.changes) created++; product = await db().prepare("SELECT * FROM products WHERE url=?").bind(productUrl).first<ProductRow>();
      }
    }
    if (!product) { skipped++; continue; }
    const requestedSourceType = clean(item.source_type, 30); const listingOnly = requestedSourceType === "github-listing" || requestedSourceType === "retailer-listing"; const sourceType = ["github-direct", "github-listing", "retailer-api", "official-feed", "retailer-listing"].includes(requestedSourceType) ? requestedSourceType : "github-direct";
    const availability = listingOnly ? "Unknown" : clean(item.availability, 80) || "Unknown"; const inferred = listingOnly ? { status: "UNKNOWN" as StockStatus, confidence: 35, evidence: "Search listing is not stock evidence" } : classifyStock(`${item.stock_status ?? ""} ${availability} ${item.stock_evidence ?? ""}`, Boolean(item.stock_status));
    const stockStatus = listingOnly ? "UNKNOWN" : item.stock_status && ["IN_STOCK","LOW_STOCK","PREORDER","BACKORDER","COMING_SOON","OUT_OF_STOCK","UNKNOWN"].includes(item.stock_status) ? item.stock_status : inferred.status; const stockConfidence = listingOnly ? 35 : Math.min(100, Math.max(0, Number(item.stock_confidence) || inferred.confidence));
    const promo = clean(item.promo_code, 28).toUpperCase(); const validPromo = /^[A-Z0-9][A-Z0-9-]{2,27}$/.test(promo) ? promo : null; let sourceUrl = productUrl;
    if (item.source_url) { try { sourceUrl = safeRetailerUrl(item.source_url).url.toString(); } catch { sourceUrl = productUrl; } }
    const previous = await db().prepare("SELECT price_cents, stock_status, promo_code FROM observations WHERE product_id=? AND price_cents IS NOT NULL ORDER BY checked_at DESC, id DESC LIMIT 1").bind(product.id).first<{ price_cents: number | null; stock_status: StockStatus | null; promo_code: string | null }>();
    const duplicate = await db().prepare("SELECT id FROM observations WHERE product_id=? AND price_cents=? AND coalesce(stock_status,'')=? AND coalesce(promo_code,'')=coalesce(?,'') AND checked_at>=datetime('now','-20 minutes') LIMIT 1").bind(product.id, price, stockStatus, validPromo).first();
    if (duplicate) { skipped++; continue; }
    await db().batch([
      db().prepare("INSERT INTO observations (product_id, price_cents, effective_price_cents, currency, availability, stock_status, stock_evidence, stock_confidence, seller, condition, confidence, error, promo_code, promotion_text, source_type, source_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)").bind(product.id, price, Number(item.effective_price_cents) || price, clean(item.currency, 8) || "USD", availability, stockStatus, clean(item.stock_evidence, 180) || inferred.evidence, stockConfidence, clean(item.seller, 120) || null, clean(item.condition, 40) || "UnknownCondition", listingOnly ? Math.min(confidence, 72) : confidence, validPromo, validPromo ? clean(item.promotion_text, 180) || `Use code ${validPromo}` : null, sourceType, sourceUrl),
      db().prepare("UPDATE products SET sku=coalesce(?,sku), gtin=coalesce(?,gtin), image_url=coalesce(?,image_url), last_checked_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(clean(item.sku,80)||null, clean(item.gtin,32)||null, /^https:\/\//.test(clean(item.image_url,800))?clean(item.image_url,800):null, product.id),
    ]);
    if (validPromo) await db().prepare(`INSERT INTO promo_codes (product_id,retailer,code,status,eligible_text,source_url,confidence,last_verified_at)
      SELECT ?,? ,?,'REPORTED',?,?,?,CURRENT_TIMESTAMP WHERE NOT EXISTS (SELECT 1 FROM promo_codes WHERE product_id=? AND retailer=? AND code=?)`).bind(product.id, product.retailer, validPromo, clean(item.promotion_text,180)||`Use code ${validPromo}`, sourceUrl, Math.min(85, confidence), product.id, product.retailer, validPromo).run();
    if (!listingOnly) await evaluateAlerts(product, { price_cents: price, stock_status: stockStatus, promo_code: validPromo }, previous ?? null); accepted++;
  }
  return Response.json({ accepted, skipped, created, at: new Date().toISOString() });
}
