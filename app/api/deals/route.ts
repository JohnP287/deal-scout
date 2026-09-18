import { db, knownMsrp, retailerFromUrl, safeRetailerUrl } from "@/lib/deals";
import { relevanceScore, normalizeProduct } from "@/lib/deal-core";
import { APPROVED_SOURCE_COUNT, providerForUrl } from "@/lib/providers";

export const dynamic = "force-dynamic";
const TRUSTED_PRICE_SOURCES = new Set(["site-direct", "github-direct", "retailer-api", "official-feed"]);
const ageOf = (value: unknown) => { if (!value) return Infinity; const raw = String(value); const date = new Date(/(?:Z|[+-]\d\d:\d\d)$/.test(raw) ? raw : `${raw}Z`).getTime(); return Number.isFinite(date) ? Math.max(0, Math.round((Date.now() - date) / 60_000)) : Infinity; };

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim().slice(0, 100) ?? "";
  const result = await db().prepare(`SELECT p.*,
    good.price_cents, coalesce(good.effective_price_cents, good.price_cents) AS effective_price_cents, good.currency, good.availability, good.stock_status, good.stock_evidence, good.stock_confidence, good.seller, good.condition, good.confidence,
    good.promo_code, good.promotion_text, good.source_type, good.source_url, good.checked_at AS price_checked_at,
    latest.checked_at AS last_attempt_at, latest.error AS last_error,
    (SELECT MIN(h.price_cents) FROM observations h WHERE h.product_id=p.id AND h.price_cents IS NOT NULL AND h.source_type IN ('site-direct','github-direct','retailer-api','official-feed')) AS lowest_price_cents,
    (SELECT h.price_cents FROM observations h WHERE h.product_id=p.id AND h.price_cents IS NOT NULL AND h.source_type IN ('site-direct','github-direct','retailer-api','official-feed') ORDER BY h.checked_at DESC, h.id DESC LIMIT 1 OFFSET 1) AS previous_price_cents,
    (SELECT h.stock_status FROM observations h WHERE h.product_id=p.id AND h.stock_status IS NOT NULL ORDER BY h.checked_at DESC, h.id DESC LIMIT 1 OFFSET 1) AS previous_stock_status,
    (SELECT MAX(h.checked_at) FROM observations h WHERE h.product_id=p.id AND h.stock_status IN ('IN_STOCK','LOW_STOCK')) AS last_confirmed_in_stock,
    (SELECT COUNT(*) FROM observations h WHERE h.product_id=p.id) AS check_count
  FROM products p
  LEFT JOIN observations good ON good.id=(SELECT id FROM observations WHERE product_id=p.id AND price_cents IS NOT NULL AND source_type IN ('site-direct','github-direct','retailer-api','official-feed') ORDER BY checked_at DESC, id DESC LIMIT 1)
  LEFT JOIN observations latest ON latest.id=(SELECT id FROM observations WHERE product_id=p.id ORDER BY checked_at DESC, id DESC LIMIT 1)
  WHERE p.active=1`).all<Record<string, unknown>>();

  const rows = (result.results ?? []).map((row) => {
    const price = Number(row.effective_price_cents ?? row.price_cents) || null; const msrp = Number(row.msrp_cents) || 0; const ageMinutes = ageOf(row.price_checked_at); const attemptAge = ageOf(row.last_attempt_at);
    const refreshFailed = Boolean(row.last_error) && attemptAge < ageMinutes; const sourceType = String(row.source_type ?? ""); const priceConfidence = Number(row.confidence ?? 0); const stockConfidence = Number(row.stock_confidence ?? 0);
    const priceTrusted = price != null && TRUSTED_PRICE_SOURCES.has(sourceType) && priceConfidence >= 76; const stockTrusted = TRUSTED_PRICE_SOURCES.has(sourceType) && stockConfidence >= 86 && ["IN_STOCK", "LOW_STOCK", "OUT_OF_STOCK", "PREORDER", "BACKORDER", "COMING_SOON"].includes(String(row.stock_status));
    const msrpTrusted = msrp > 0 && (Boolean(row.msrp_source_url) || knownMsrp(String(row.title)) === msrp);
    const dataState = !price ? "BLOCKED" : refreshFailed || ageMinutes > 1440 ? "STALE" : ageMinutes <= 45 ? "LIVE" : "VERIFIED";
    const discount = price && msrpTrusted ? Math.max(0, (msrp - price) / msrp * 100) : null; const savings = price && msrpTrusted ? Math.max(0, msrp - price) : null;
    const resaleFresh = Boolean(row.resale_source_url && row.resale_verified_at) && ageOf(row.resale_verified_at) <= 43_200; const resale = resaleFresh ? Number(row.expected_resale_cents) || null : null;
    const tax = priceTrusted && price ? Math.round(price * .06) : null; const acquisition = price && tax != null ? price + tax : null; const fees = resale ? Math.round(resale * .1325) : null; const net = resale && acquisition && fees != null ? resale - fees - acquisition : null; const roi = net != null && acquisition ? net / acquisition * 100 : null;
    const provider = providerForUrl(String(row.url));
    const freshnessPoints = dataState === "LIVE" ? 22 : dataState === "VERIFIED" ? 15 : dataState === "STALE" ? 3 : 0;
    const evidencePoints = (priceTrusted ? 20 : 0) + (stockTrusted ? 20 : 0) + (msrpTrusted ? 14 : 0);
    const reputationPoints = Math.round((provider?.reputation ?? 70) / 10); const dealPoints = Math.min(24, Math.round(discount ?? 0));
    const confidence = Math.max(0, Math.min(100, Math.round(((priceConfidence + stockConfidence) / 2) - Math.min(35, Math.floor(ageMinutes / 360) * 4) - (refreshFailed ? 10 : 0))));
    return { ...row, price_cents: price, checked_at: row.price_checked_at, data_state: dataState, price_trusted: priceTrusted, stock_trusted: stockTrusted, msrp_trusted: msrpTrusted, refresh_failed: refreshFailed, age_minutes: Number.isFinite(ageMinutes) ? ageMinutes : null, confidence_score: confidence, discount_percent: discount, savings_cents: savings, tax_cents: tax, acquisition_cents: acquisition, fees_cents: fees, resale_comp_cents: resale, resale_source: resale ? row.resale_source_url : "No verified sold comp", net_profit_cents: net, roi_percent: roi, deal_score: freshnessPoints + evidencePoints + reputationPoints + dealPoints, price_source: sourceType === "retailer-api" ? "Official retailer API" : sourceType === "official-feed" ? "Official product feed" : "Direct product page", reference_source: msrpTrusted ? (row.msrp_source_url || "Authoritative manufacturer MSRP") : "No authoritative MSRP", search_score: query ? relevanceScore(String(row.title), query) : 1 };
  });

  const eligible = rows.filter((deal) => {
    const price = Number(deal.price_cents); const msrp = Number(deal.msrp_cents); const condition = String(deal.condition ?? "").toLowerCase();
    const saleCondition = !condition || condition.includes("new") || condition.includes("openbox") || condition.includes("open box") || condition.includes("refurbished");
    return deal.price_trusted && deal.stock_trusted && deal.msrp_trusted && deal.data_state !== "BLOCKED" && ["IN_STOCK", "LOW_STOCK"].includes(String(deal.stock_status)) && saleCondition && price > 0 && msrp > 0 && price <= msrp && (!query || Number(deal.search_score) >= 25);
  }).sort((a, b) => Number(b.deal_score) - Number(a.deal_score) || Number(a.price_cents) - Number(b.price_cents));

  const grouped = new Map<string, Record<string, unknown>>();
  for (const deal of eligible) {
    const normalized = normalizeProduct(String(deal.title)); const key = String(deal.canonical_key || normalized.canonicalKey || deal.url);
    const existing = grouped.get(key); const offer = { retailer: deal.retailer, url: deal.url, price_cents: deal.price_cents, stock_status: deal.stock_status, data_state: deal.data_state, checked_at: deal.checked_at, seller: deal.seller };
    if (!existing) grouped.set(key, { ...deal, offers: [offer] });
    else { (existing.offers as unknown[]).push(offer); if (Number(deal.price_cents) < Number(existing.price_cents)) grouped.set(key, { ...deal, offers: existing.offers }); }
  }
  const deals = [...grouped.values()]; const latestVerified = rows.reduce((latest, deal) => String(deal.price_checked_at ?? "") > latest ? String(deal.price_checked_at) : latest, "");
  return Response.json({ deals, coverage: { tracked: rows.length, retailers: new Set(rows.map((deal) => String(deal.retailer))).size, sources: APPROVED_SOURCE_COUNT, qualified: deals.length, stale: deals.filter((deal) => deal.data_state === "STALE").length, updated_at: latestVerified } }, { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=300" } });
}

export async function POST(request: Request) {
  const body = await request.json() as Record<string, string>; let parsed: URL;
  try { parsed = safeRetailerUrl(body.url).url; } catch { return Response.json({ error: "Use a supported HTTPS retailer or manufacturer product page." }, { status: 400 }); }
  const msrp = Number(body.msrp); const resale = body.resale ? Number(body.resale) : null; const title = body.title?.replace(/\s+/g, " ").trim(); const normalized = normalizeProduct(title || "");
  if (!title || title.length < 8 || !Number.isFinite(msrp) || msrp <= 0) return Response.json({ error: "Product name and a valid authoritative MSRP are required." }, { status: 400 });
  if (normalized.suspicious) return Response.json({ error: "Accessories and empty-box listings cannot be tracked as products." }, { status: 400 });
  try {
    const result = await db().prepare("INSERT INTO products (title, retailer, url, category, canonical_key, manufacturer, model, msrp_cents, msrp_source_url, expected_resale_cents) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(title.slice(0, 180), retailerFromUrl(parsed.toString()), parsed.toString(), (body.category || "Other").slice(0, 40), normalized.canonicalKey, normalized.manufacturer, normalized.model, Math.round(msrp * 100), body.msrp_source_url || null, resale && Number.isFinite(resale) ? Math.round(resale * 100) : null).run();
    return Response.json({ id: result.meta.last_row_id }, { status: 201 });
  } catch (error) { if (String(error).toLowerCase().includes("unique")) return Response.json({ error: "That product page is already being tracked." }, { status: 409 }); return Response.json({ error: "The product could not be saved." }, { status: 500 }); }
}
