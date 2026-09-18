import { env } from "cloudflare:workers";
import { classifyStock, cleanText, extractPromo, normalizeProduct, type StockStatus } from "@/lib/deal-core";
import { APPROVED_SOURCE_COUNT, providerForUrl, PROVIDERS } from "@/lib/providers";
import { recordProviderResult } from "@/lib/provider-health";
import { evaluateAlerts } from "@/lib/alerts";

export { APPROVED_SOURCE_COUNT };
export type ProductRow = { id: number; title: string; retailer: string; url: string; category: string; msrp_cents: number; expected_resale_cents: number | null; active: number; canonical_key?: string | null; manufacturer?: string | null; model?: string | null };
export function db() { if (!env.DB) throw new Error("Deal database unavailable"); return env.DB; }
export const RETAILERS = Object.fromEntries(PROVIDERS.flatMap((provider) => provider.domains.map((domain) => [domain, provider.name])));

export function safeRetailerUrl(value: string, base?: string) {
  const url = new URL(value, base); const provider = providerForUrl(url.toString());
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") || !provider) throw new Error("Use a supported HTTPS retailer product page.");
  url.hash = ""; return { url, retailer: provider.name, provider };
}
export function retailerFromUrl(url: string) { return safeRetailerUrl(url).retailer; }
export async function fetchRetailerPage(value: string, signal?: AbortSignal) {
  let current = safeRetailerUrl(value).url; let response: Response | null = null;
  for (let redirects = 0; redirects <= 3; redirects++) {
    response = await fetch(current, { headers: { "user-agent": "Mozilla/5.0 (compatible; DealScout/2.0; +https://deal-scout.johnpz287.chatgpt.site)", accept: "text/html,application/xhtml+xml" }, redirect: "manual", signal });
    if (response.status < 300 || response.status >= 400) break;
    const location = response.headers.get("location"); if (!location || redirects === 3) throw new Error("Retailer redirected too many times"); current = safeRetailerUrl(location, current.toString()).url;
  }
  if (!response?.ok) throw new Error(`Retailer returned ${response?.status ?? "no response"}`); return response;
}

function walk(value: unknown, out: Record<string, unknown>[]) { if (!value || typeof value !== "object") return; if (Array.isArray(value)) return value.forEach((item) => walk(item, out)); const object = value as Record<string, unknown>; out.push(object); Object.values(object).forEach((item) => walk(item, out)); }
function stringValue(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }
function numericPrice(value: unknown) { const price = typeof value === "number" ? value : typeof value === "string" ? Number(value.replace(/[^0-9.]/g, "")) : NaN; return Number.isFinite(price) && price >= 1 && price <= 20_000 ? Math.round(price * 100) : null; }

export function extractOffer(html: string) {
  const objects: Record<string, unknown>[] = [];
  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) { try { walk(JSON.parse(match[1]), objects); } catch { /* Invalid JSON-LD. */ } }
  const product = objects.find((object) => object["@type"] === "Product") ?? objects.find((object) => object.offers);
  const rawOffers = product?.offers ?? objects.find((object) => object["@type"] === "Offer");
  const offers = (Array.isArray(rawOffers) ? rawOffers : [rawOffers]).filter(Boolean) as Record<string, unknown>[];
  const offer = offers.find((item) => numericPrice(item.price ?? (item.priceSpecification as Record<string, unknown> | undefined)?.price) != null) ?? offers[0];
  const priceCents = numericPrice(offer?.price ?? (offer?.priceSpecification as Record<string, unknown> | undefined)?.price);
  const structuredAvailability = stringValue(offer?.availability)?.split("/").pop() ?? ""; const pageText = cleanText(html);
  const stock = classifyStock(`${structuredAvailability} ${pageText}`, Boolean(structuredAvailability)); const promo = extractPromo(pageText);
  const sellerObject = offer?.seller as Record<string, unknown> | undefined; const brandObject = product?.brand as Record<string, unknown> | undefined;
  const imageValue = Array.isArray(product?.image) ? product?.image[0] : product?.image;
  const confidence = priceCents == null ? 0 : Math.min(99, 76 + (structuredAvailability ? 10 : 0) + (product?.name ? 5 : 0) + (offer?.priceCurrency ? 3 : 0));
  return { price_cents: priceCents, effective_price_cents: priceCents, availability: structuredAvailability || stock.status, stock_status: stock.status, stock_evidence: stock.evidence, stock_confidence: stock.confidence, condition: stringValue(offer?.itemCondition)?.split("/").pop() ?? "UnknownCondition", name: stringValue(product?.name), currency: stringValue(offer?.priceCurrency) ?? "USD", confidence, promo_code: promo?.code ?? null, promotion_text: promo?.text ?? null, seller: stringValue(sellerObject?.name), sku: stringValue(product?.sku ?? product?.mpn), gtin: stringValue(product?.gtin13 ?? product?.gtin12 ?? product?.gtin), manufacturer: stringValue(brandObject?.name), image_url: typeof imageValue === "string" && /^https:\/\//i.test(imageValue) ? imageValue : null };
}

const DISCOVERY_KEYWORDS = /(?:geforce|rtx|radeon|arc)\s*[a-z0-9 -]*|(?:ryzen|core\s+(?:ultra|i[3579]))\s*[a-z0-9 -]*|(?:gaming|ddr[45]|nvme|pcie)\s*(?:desktop|pc|laptop|monitor|motherboard|memory|ram|ssd)|(?:motherboard|graphics\s*card|video\s*card|mechanical\s*keyboard|gaming\s*mouse|gaming\s*headset|capture\s*card|stream\s*deck|webcam|microphone|gaming\s*router)|oled|qd-oled|woled|dualsense|xbox|playstation|ps5|nintendo|switch|steam\s*deck|rog\s*ally|legion\s*go|meta\s*quest|vr\s*headset|limited\s*edition/i;
const PRODUCT_PATH = /(?:\/site\/[^"?#]+\/\d+\.p|\/product\/\d+\/[^"?#]+|\/p\/[A-Z0-9-]+|\/ip\/[^"?#]+\/\d+|\/dp\/[A-Z0-9]{10}|\/-\/A-\d+|\/products?\/[^"?#]+|\/(?:us-en\/)?shop\/pdp\/[^"?#]+|\/consumer\/graphics-cards\/[^"?#]+|\/(?:notebooks|monitors|hardware)\/[^"?#]*\d{5,})/i;
const GENERIC_PAGE = /^(?:gaming|deals?|sale|gaming monitors?|graphics cards?|gaming laptops?|gaming desktops?|shop|products?)$/i;
export function categoryFor(title: string) {
  if (/gaming\s*laptop|notebook/i.test(title)) return "Gaming laptop"; if (/gaming\s*(?:desktop|pc)|prebuilt/i.test(title)) return "Gaming desktop";
  if (/rtx|geforce|radeon|graphics\s*card|video\s*card/i.test(title)) return "GPU"; if (/ryzen|core\s+(?:ultra|i[3579])|processor|\bcpu\b/i.test(title)) return "CPU";
  if (/motherboard|\b(?:b[68]\d\d|x[68]\d\d|z[789]\d\d)\b/i.test(title)) return "Motherboard"; if (/\b(?:ddr[45]|ram|memory)\b/i.test(title)) return "Memory";
  if (/\b(?:nvme|ssd|solid state|m\.2)\b/i.test(title)) return "Storage"; if (/monitor|display/i.test(title)) return "Monitor"; if (/oled|television|\btv\b/i.test(title)) return "TV";
  if (/steam\s*deck|rog\s*ally|legion\s*go|handheld/i.test(title)) return "Handheld"; if (/controller|dualsense|gamepad/i.test(title)) return "Controller";
  if (/keyboard/i.test(title)) return "Keyboard"; if (/\bmouse\b/i.test(title)) return "Mouse"; if (/headset|headphone/i.test(title)) return "Headset";
  if (/microphone|\bmic\b|speaker|mixamp|audio interface/i.test(title)) return "Audio"; if (/capture\s*card|stream\s*deck|webcam|camera/i.test(title)) return "Streaming";
  if (/router|mesh|ethernet|network/i.test(title)) return "Networking"; if (/meta\s*quest|vr\s*headset|virtual reality/i.test(title)) return "VR";
  if (/playstation|ps5|xbox|nintendo|switch|console/i.test(title)) return "Console"; return "Gaming hardware";
}
export function knownMsrp(title: string) { if (/rtx\s*5080.*founders|founders.*rtx\s*5080/i.test(title)) return 99999; if (/rtx\s*5090.*founders|founders.*rtx\s*5090/i.test(title)) return 199999; return 0; }

export function discoverProductLinks(html: string, sourceUrl: string) {
  const provider = providerForUrl(sourceUrl); if (!provider) return [];
  const found = new Map<string, { title: string; url: string; retailer: string; category: string; canonical_key: string; manufacturer: string | null; model: string | null; msrp_cents: number; msrp_source_url: string | null; expected_resale_cents: number | null; price_cents: number | null; availability: string; stock_status: StockStatus }>();
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]{0,900}?)<\/a>/gi)) {
    const title = cleanText(match[2]); const normalized = normalizeProduct(title);
    if (title.length < 10 || title.length > 220 || GENERIC_PAGE.test(title) || normalized.suspicious || !DISCOVERY_KEYWORDS.test(title)) continue;
    try {
      const safe = safeRetailerUrl(match[1], sourceUrl); if (!PRODUCT_PATH.test(safe.url.pathname)) continue; safe.url.search = "";
      const url = safe.url.toString(); const known = knownMsrp(title); const index = match.index ?? 0; const cardEnd = html.indexOf("</li>", index);
      const card = cleanText(html.slice(Math.max(0, index - 400), cardEnd > index && cardEnd - index < 12_000 ? cardEnd : index + 5_000)).replace(/\$\s*([0-9,]+)\s*\.\s*(\d{2})/g, "$$$1.$2");
      const prices = [...card.matchAll(/\$\s*([0-9]{1,5}(?:,[0-9]{3})*(?:\.\d{2})?)/g)].map((item) => Number(item[1].replace(/,/g, ""))).filter((price) => price >= 20 && price <= 20_000); const current = prices[0] ?? null;
      const stock = classifyStock(card, false); const msrpSource = known ? (/rtx\s*50(?:80|90)/i.test(title) ? "https://www.nvidia.com/en-us/geforce/graphics-cards/50-series/" : sourceUrl) : null;
      found.set(url, { title, url, retailer: safe.retailer, category: categoryFor(title), canonical_key: normalized.canonicalKey, manufacturer: normalized.manufacturer, model: normalized.model, msrp_cents: known, msrp_source_url: msrpSource, expected_resale_cents: null, price_cents: current == null ? null : Math.round(current * 100), availability: stock.evidence, stock_status: stock.status });
    } catch { /* Ignore malformed and unsupported links. */ }
  }
  return [...found.values()].slice(0, 80);
}

export async function scanProduct(product: ProductRow) {
  const provider = providerForUrl(product.url); const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 12_000); const started = Date.now();
  try { const response = await fetchRetailerPage(product.url, controller.signal); const offer = extractOffer(await response.text()); if (offer.price_cents == null) throw new Error("Price was not exposed in structured product data"); if (provider) await recordProviderResult(provider, { ok: true, responseMs: Date.now() - started, verified: 1 }); return { ...offer, error: null }; }
  catch (error) { const message = error instanceof Error ? error.message.slice(0, 180) : "Check failed"; if (provider) await recordProviderResult(provider, { ok: false, responseMs: Date.now() - started, error: message }); return { price_cents: null, effective_price_cents: null, availability: null, stock_status: "UNKNOWN" as const, stock_evidence: "Provider check failed; last verified data retained", stock_confidence: 0, condition: null, name: null, currency: "USD", confidence: 0, promo_code: null, promotion_text: null, seller: null, sku: null, gtin: null, manufacturer: null, image_url: null, error: message }; }
  finally { clearTimeout(timeout); }
}

export async function scanActiveProducts(limit = 20) {
  const rows = await db().prepare(`SELECT p.id, p.title, p.retailer, p.url, p.category, p.msrp_cents, p.expected_resale_cents, p.active, p.canonical_key, p.manufacturer, p.model FROM products p WHERE p.active=1 ORDER BY EXISTS(SELECT 1 FROM watches w WHERE w.active=1 AND ((w.target_type='PRODUCT' AND w.target_value=p.url) OR (w.target_type='CATEGORY' AND lower(w.target_value)=lower(p.category)))) DESC, coalesce(p.last_checked_at, '1970-01-01') ASC LIMIT ?`).bind(limit).all<ProductRow>();
  const products = rows.results ?? []; let checked = 0;
  for (let i = 0; i < products.length; i += 4) {
    const results = await Promise.all(products.slice(i, i + 4).map(async (product) => ({ product, previous: await db().prepare("SELECT price_cents, stock_status, promo_code FROM observations WHERE product_id=? AND price_cents IS NOT NULL ORDER BY checked_at DESC, id DESC LIMIT 1").bind(product.id).first<{ price_cents: number | null; stock_status: StockStatus | null; promo_code: string | null }>(), offer: await scanProduct(product) })));
    for (const { product, previous, offer } of results) {
      await db().batch([
        db().prepare(`INSERT INTO observations (product_id, price_cents, effective_price_cents, currency, availability, stock_status, stock_evidence, stock_confidence, seller, condition, confidence, error, promo_code, promotion_text, source_type, source_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'site-direct', ?)`).bind(product.id, offer.price_cents, offer.effective_price_cents, offer.currency, offer.availability, offer.stock_status, offer.stock_evidence, offer.stock_confidence, offer.seller, offer.condition, offer.confidence, offer.error, offer.promo_code, offer.promotion_text, product.url),
        db().prepare("UPDATE products SET title=coalesce(?, title), sku=coalesce(?, sku), gtin=coalesce(?, gtin), manufacturer=coalesce(?, manufacturer), image_url=coalesce(?, image_url), last_checked_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(offer.name, offer.sku, offer.gtin, offer.manufacturer, offer.image_url, product.id),
      ]);
      if (offer.promo_code) await db().prepare(`INSERT INTO promo_codes (product_id, retailer, code, status, eligible_text, source_url, confidence, last_verified_at)
        SELECT ?, ?, ?, 'REPORTED', ?, ?, ?, CURRENT_TIMESTAMP WHERE NOT EXISTS (SELECT 1 FROM promo_codes WHERE product_id=? AND retailer=? AND code=?)`).bind(product.id, product.retailer, offer.promo_code, offer.promotion_text, product.url, Math.min(85, offer.confidence), product.id, product.retailer, offer.promo_code).run();
      if (!offer.error) await evaluateAlerts(product, { price_cents: offer.price_cents, stock_status: offer.stock_status, promo_code: offer.promo_code }, previous ?? null); checked++;
    }
  }
  return checked;
}
