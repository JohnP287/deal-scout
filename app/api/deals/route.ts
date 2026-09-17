import { db, retailerFromUrl, safeRetailerUrl } from "@/lib/deals";
export const dynamic = "force-dynamic";
export async function GET() {
  const result = await db().prepare(`SELECT p.*,
    good.price_cents, good.currency, good.availability, good.condition, good.confidence,
    good.promo_code, good.promotion_text, good.source_type, good.source_url,
    good.checked_at AS price_checked_at,
    latest.checked_at AS last_attempt_at, latest.error AS last_error,
    (SELECT MIN(h.price_cents) FROM observations h WHERE h.product_id = p.id AND h.price_cents IS NOT NULL) AS lowest_price_cents,
    (SELECT h.price_cents FROM observations h WHERE h.product_id = p.id AND h.price_cents IS NOT NULL ORDER BY h.checked_at DESC, h.id DESC LIMIT 1 OFFSET 1) AS previous_price_cents,
    (SELECT COUNT(*) FROM observations h WHERE h.product_id = p.id) AS check_count
  FROM products p
  LEFT JOIN observations good ON good.id = (SELECT id FROM observations WHERE product_id = p.id AND price_cents IS NOT NULL ORDER BY checked_at DESC, id DESC LIMIT 1)
  LEFT JOIN observations latest ON latest.id = (SELECT id FROM observations WHERE product_id = p.id ORDER BY checked_at DESC, id DESC LIMIT 1)
  WHERE p.active = 1`).all();
  const now = Date.now();
  const ranked = (result.results as Record<string, unknown>[]).map((row) => {
    const price = row.price_cents as number | null; const reference = row.msrp_cents as number; const resale = row.expected_resale_cents as number | null;
    const verifiedAt = row.price_checked_at ? new Date(`${row.price_checked_at}Z`).getTime() : 0; const attemptAt = row.last_attempt_at ? new Date(`${row.last_attempt_at}Z`).getTime() : 0;
    const ageMinutes = verifiedAt ? Math.max(0, Math.round((now - verifiedAt) / 60000)) : null; const refreshFailed = Boolean(row.last_error) && attemptAt > verifiedAt;
    const dataState = !price && row.last_error ? "BLOCKED" : !price ? "PENDING" : refreshFailed || (ageMinutes ?? Infinity) > 1440 ? "STALE" : (ageMinutes ?? Infinity) <= 45 ? "LIVE" : "VERIFIED";
    const inStock = String(row.availability ?? "").toLowerCase().includes("instock"); const newItem = !row.condition || String(row.condition).toLowerCase().includes("new");
    const sourceType = String(row.source_type ?? "legacy-verified"); const baseConfidence = Number(row.confidence ?? 0); const trustedSource = baseConfidence >= 76 && ["legacy-verified", "site-direct", "retailer-listing", "github-direct", "github-listing", "retailer-api"].includes(sourceType);
    const tax = price == null || !trustedSource ? null : Math.round(price * .06); const acquisition = price == null || tax == null ? null : price + tax; const fees = resale == null || !trustedSource ? null : Math.round(resale * .1325);
    const net = resale == null || acquisition == null || fees == null ? null : resale - fees - acquisition; const roi = net == null || acquisition == null ? null : net / acquisition * 100;
    const hasReference = reference > 0; const discount = price != null && hasReference ? (reference - price) / reference * 100 : null;
    const agePenalty = ageMinutes == null ? 100 : Math.min(35, Math.floor(ageMinutes / 180) * 3); const confidence = Math.max(0, Math.min(100, baseConfidence - agePenalty - (refreshFailed ? 12 : 0)));
    const trustedFresh = trustedSource && (dataState === "LIVE" || dataState === "VERIFIED");
    const status = price == null || !hasReference ? "unknown" : trustedFresh && inStock && newItem && (discount ?? 0) >= 10 && (net == null || (net >= 7500 && (roi ?? 0) >= 15)) ? "buy" : (discount ?? -100) >= 0 ? "watch" : "skip";
    const score = Math.max(0, Math.min(100, Math.round((price ? 25 : 0) + (dataState === "LIVE" ? 20 : dataState === "VERIFIED" ? 14 : dataState === "STALE" ? 5 : 0) + (inStock ? 15 : 0) + Math.max(0, Math.min(25, discount ?? 0)) + Math.max(0, Math.min(15, roi == null ? 0 : roi / 2)))));
    const sourceLabel = sourceType === "github-direct" ? "Independent retailer check" : sourceType === "github-listing" || sourceType === "retailer-listing" ? "Retailer search listing" : sourceType === "retailer-api" ? "Retailer API" : "Retailer product page";
    return { ...row, error: row.last_error, checked_at: row.price_checked_at, status, data_state: dataState, confidence_score: confidence, price_trusted: trustedSource, price_source: price ? sourceLabel : "No successful source", discount_percent: discount, tax_cents: tax, fees_cents: fees, acquisition_cents: acquisition, resale_comp_cents: resale, resale_source: resale ? "Curated resale target" : "No verified resale comp", reference_source: hasReference ? (/founders edition/i.test(String(row.title)) ? "Manufacturer MSRP" : "Retailer reference") : "No verified MSRP", net_profit_cents: net, roi_percent: roi, deal_score: score, refresh_failed: refreshFailed, age_minutes: ageMinutes };
  }).sort((a, b) => Number(b.deal_score) - Number(a.deal_score) || Number(b.price_cents != null) - Number(a.price_cents != null) || String(b.price_checked_at ?? "").localeCompare(String(a.price_checked_at ?? "")));
  const seen = new Set<string>();
  const deals = ranked.filter((deal) => { const key = `${String(deal.retailer).toLowerCase()}|${String(deal.title).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}`; if (seen.has(key)) return false; seen.add(key); return true; });
  return Response.json({ deals });
}
export async function POST(request: Request) {
  const body = await request.json() as Record<string, string>; let parsed: URL; try { parsed = safeRetailerUrl(body.url).url; } catch { return Response.json({ error: "Use a supported HTTPS retailer or manufacturer product page." }, { status: 400 }); }
  const msrp = Number(body.msrp); const resale = body.resale ? Number(body.resale) : null;
  if (!body.title?.trim() || !Number.isFinite(msrp) || msrp <= 0) return Response.json({ error: "Product name and a valid MSRP are required." }, { status: 400 });
  try { const result = await db().prepare("INSERT INTO products (title, retailer, url, category, msrp_cents, expected_resale_cents) VALUES (?, ?, ?, ?, ?, ?)").bind(body.title.trim().slice(0, 180), retailerFromUrl(parsed.toString()), parsed.toString(), (body.category || "Other").slice(0, 40), Math.round(msrp * 100), resale && Number.isFinite(resale) ? Math.round(resale * 100) : null).run(); return Response.json({ id: result.meta.last_row_id }, { status: 201 }); }
  catch (error) { if (String(error).toLowerCase().includes("unique")) return Response.json({ error: "That product page is already being tracked." }, { status: 409 }); return Response.json({ error: "The product could not be saved." }, { status: 500 }); }
}
