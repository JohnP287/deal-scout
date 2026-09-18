import { env } from "cloudflare:workers";

export type ProductRow = { id: number; title: string; retailer: string; url: string; category: string; msrp_cents: number; expected_resale_cents: number | null; active: number };
export function db() { if (!env.DB) throw new Error("Deal database unavailable"); return env.DB; }
export const RETAILERS: Record<string, string> = {
  "bestbuy.com": "Best Buy", "microcenter.com": "Micro Center", "nvidia.com": "NVIDIA", "newegg.com": "Newegg", "walmart.com": "Walmart", "amazon.com": "Amazon", "target.com": "Target", "gamestop.com": "GameStop",
  "bhphotovideo.com": "B&H Photo", "adorama.com": "Adorama", "dell.com": "Dell", "hp.com": "HP", "lenovo.com": "Lenovo", "asus.com": "ASUS", "acer.com": "Acer", "samsung.com": "Samsung", "lg.com": "LG", "sony.com": "Sony", "corsair.com": "Corsair", "logitechg.com": "Logitech G", "razer.com": "Razer", "woot.com": "Woot"
};
export function safeRetailerUrl(value: string, base?: string) {
  const url = new URL(value, base);
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const match = Object.entries(RETAILERS).find(([domain]) => host === domain || host.endsWith(`.${domain}`));
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") || !match) throw new Error("Use a supported HTTPS retailer product page.");
  return { url, retailer: match[1] };
}
export function retailerFromUrl(url: string) { return safeRetailerUrl(url).retailer; }
export async function fetchRetailerPage(value: string, signal?: AbortSignal) {
  let current = safeRetailerUrl(value).url; let response: Response | null = null;
  for (let redirects = 0; redirects <= 3; redirects++) { response = await fetch(current, { headers: { "user-agent": "Mozilla/5.0 (compatible; DealScout/1.0; +https://deal-scout.johnpz287.chatgpt.site)", accept: "text/html,application/xhtml+xml" }, redirect: "manual", signal }); if (response.status < 300 || response.status >= 400) break; const location = response.headers.get("location"); if (!location || redirects === 3) throw new Error("Retailer redirected too many times"); current = safeRetailerUrl(location, current.toString()).url; }
  if (!response?.ok) throw new Error(`Retailer returned ${response?.status ?? "no response"}`); return response;
}
function walk(value: unknown, out: Record<string, unknown>[]) { if (!value || typeof value !== "object") return; if (Array.isArray(value)) return value.forEach((v) => walk(v, out)); const obj = value as Record<string, unknown>; out.push(obj); Object.values(obj).forEach((v) => walk(v, out)); }
export function extractOffer(html: string) {
  const objects: Record<string, unknown>[] = [];
  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) { try { walk(JSON.parse(match[1]), objects); } catch { /* malformed retailer data */ } }
  const product = objects.find((o) => o["@type"] === "Product") ?? objects.find((o) => o.offers);
  const rawOffers = product?.offers ?? objects.find((o) => o["@type"] === "Offer");
  const offer = (Array.isArray(rawOffers) ? rawOffers[0] : rawOffers) as Record<string, unknown> | undefined;
  const priceValue = offer?.price ?? (offer?.priceSpecification as Record<string, unknown> | undefined)?.price;
  const price = typeof priceValue === "number" ? priceValue : typeof priceValue === "string" ? Number(priceValue.replace(/[^0-9.]/g, "")) : NaN;
  const availability = String(offer?.availability ?? "").split("/").pop() || null;
  const condition = String(offer?.itemCondition ?? "").split("/").pop() || "NewCondition";
  const promoMatch = cleanText(html).match(/(?:promo(?:tional)?|coupon)\s+code(?:\s+is|\s*:)?\s+[“\"']?([A-Z0-9][A-Z0-9-]{2,24})\b/i) ?? cleanText(html).match(/\buse\s+code\s+[“\"']?([A-Z0-9][A-Z0-9-]{2,24})\b/i);
  return { price_cents: Number.isFinite(price) ? Math.round(price * 100) : null, availability, condition, name: typeof product?.name === "string" ? product.name : null, currency: typeof offer?.priceCurrency === "string" ? offer.priceCurrency : "USD", confidence: Number.isFinite(price) ? (availability ? 96 : 88) : 0, promo_code: promoMatch?.[1]?.toUpperCase() ?? null, promotion_text: promoMatch ? promoMatch[0].slice(0, 160) : null };
}
const DISCOVERY_KEYWORDS = /(?:geforce|rtx|radeon|arc)\s*[a-z0-9 -]*|(?:ryzen|core\s+(?:ultra|i[3579]))\s*[a-z0-9 -]*|(?:gaming|ddr[45]|nvme|pcie)\s*(?:desktop|pc|laptop|monitor|motherboard|memory|ram|ssd)|(?:motherboard|graphics\s*card|video\s*card|mechanical\s*keyboard|gaming\s*mouse|gaming\s*headset|capture\s*card|stream\s*deck|webcam|microphone|wifi\s*[67e]*\s*router|gaming\s*router)|oled|qd-oled|woled|dual?sense|xbox|playstation|ps5|nintendo|switch|steam\s*deck|rog\s*ally|legion\s*go|meta\s*quest|vr\s*headset|limited\s*edition/i;
const PRODUCT_PATH = /(?:\/site\/[^"?#]+\/\d+\.p|\/product\/\d+\/[^"?#]+|\/p\/[A-Z0-9-]+|\/ip\/[^"?#]+\/\d+|\/dp\/[A-Z0-9]{10}|\/-\/A-\d+|\/products?\/[^"?#]+|\/(?:us-en\/)?shop\/pdp\/[^"?#]+|\/consumer\/graphics-cards\/[^"?#]+|\/store\/[^"?#]+|\/gaming\/[^"?#]+)/i;
function cleanText(value: string) { return value.replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim(); }
function categoryFor(title: string) {
  if (/rtx|geforce|radeon|graphics\s*card|video\s*card/i.test(title)) return "GPU";
  if (/ryzen|core\s+(?:ultra|i[3579])|processor|\bcpu\b/i.test(title)) return "CPU";
  if (/motherboard|\b(?:b[68]\d\d|x[68]\d\d|z[789]\d\d)\b/i.test(title)) return "Motherboard";
  if (/\b(?:ddr[45]|ram|memory)\b/i.test(title)) return "Memory";
  if (/\b(?:nvme|ssd|solid state|m\.2)\b/i.test(title)) return "Storage";
  if (/gaming\s*laptop|notebook/i.test(title)) return "Gaming laptop";
  if (/gaming\s*(?:desktop|pc)|prebuilt/i.test(title)) return "Gaming desktop";
  if (/monitor|display/i.test(title)) return "Monitor";
  if (/oled|television|\btv\b/i.test(title)) return "TV";
  if (/steam\s*deck|rog\s*ally|legion\s*go|handheld/i.test(title)) return "Handheld";
  if (/controller|dualsense|gamepad/i.test(title)) return "Controller";
  if (/keyboard/i.test(title)) return "Keyboard";
  if (/\bmouse\b/i.test(title)) return "Mouse";
  if (/headset|headphone/i.test(title)) return "Headset";
  if (/microphone|\bmic\b|speaker|mixamp|audio interface/i.test(title)) return "Audio";
  if (/capture\s*card|stream\s*deck|webcam|camera/i.test(title)) return "Streaming";
  if (/router|mesh|ethernet|network/i.test(title)) return "Networking";
  if (/meta\s*quest|vr\s*headset|virtual reality/i.test(title)) return "VR";
  if (/playstation|ps5|xbox|nintendo|switch|console/i.test(title)) return "Console";
  return "Gaming hardware";
}
function knownMsrp(title: string) { if (/rtx\s*5080.*founders|founders.*rtx\s*5080/i.test(title)) return 99999; if (/rtx\s*5090.*founders|founders.*rtx\s*5090/i.test(title)) return 199999; return 0; }
export function discoverProductLinks(html: string, sourceUrl: string) {
  const found = new Map<string, { title: string; url: string; retailer: string; category: string; msrp_cents: number; expected_resale_cents: number | null; price_cents: number | null; availability: string | null }>();
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]{0,900}?)<\/a>/gi)) {
    const title = cleanText(match[2]); if (title.length < 8 || title.length > 220 || !DISCOVERY_KEYWORDS.test(title)) continue;
    try {
      const safe = safeRetailerUrl(match[1], sourceUrl); if (!PRODUCT_PATH.test(safe.url.pathname)) continue; safe.url.hash = "";
      safe.url.search = ""; const url = safe.url.toString(); const msrp = knownMsrp(title); const index = match.index ?? 0;
      const cardEnd = html.indexOf("</li>", index); const rawCard = html.slice(Math.max(0, index - 500), cardEnd > index && cardEnd - index < 14_000 ? cardEnd : index + 7_000);
      const card = cleanText(rawCard).replace(/\$\s*([0-9,]+)\s*\.\s*(\d{2})/g, "$$$1.$2");
      const prices = [...card.matchAll(/\$\s*([0-9]{1,5}(?:,[0-9]{3})*(?:\.\d{2})?)/g)].map((p) => Number(p[1].replace(/,/g, ""))).filter((p) => Number.isFinite(p) && p >= 20 && p <= 20_000);
      const current = prices[0] ?? null; const reference = current == null ? null : prices.find((p) => p > current * 1.03 && p < current * 2.5) ?? null;
      const known = msrp || (reference ? Math.round(reference * 100) : 0);
      found.set(url, { title, url, retailer: safe.retailer, category: categoryFor(title), msrp_cents: known, expected_resale_cents: msrp === 99999 ? 145000 : msrp === 199999 ? 275000 : null, price_cents: current == null ? null : Math.round(current * 100), availability: "Unknown" });
    } catch { /* Ignore non-retailer and malformed links. */ }
  }
  return [...found.values()].slice(0, 80);
}
export async function scanProduct(product: ProductRow) {
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetchRetailerPage(product.url, controller.signal);
    const offer = extractOffer(await response.text()); if (offer.price_cents == null) throw new Error("Price was not exposed in structured product data"); return { ...offer, error: null };
  }
  catch (error) { return { price_cents: null, availability: null, condition: null, name: null, currency: "USD", confidence: 0, error: error instanceof Error ? error.message.slice(0, 180) : "Check failed" }; }
  finally { clearTimeout(timeout); }
}
export async function scanActiveProducts(limit = 20) {
  const rows = await db().prepare("SELECT id, title, retailer, url, category, msrp_cents, expected_resale_cents, active FROM products WHERE active = 1 ORDER BY coalesce(last_checked_at, '1970-01-01') ASC LIMIT ?").bind(limit).all<ProductRow>(); const products = rows.results ?? []; let checked = 0;
  for (let i = 0; i < products.length; i += 4) { const results = await Promise.all(products.slice(i, i + 4).map(async (product) => ({ product, offer: await scanProduct(product) }))); await db().batch(results.flatMap(({ product, offer }) => [db().prepare("INSERT INTO observations (product_id, price_cents, currency, availability, condition, confidence, error, promo_code, promotion_text, source_type, source_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'site-direct', ?)").bind(product.id, offer.price_cents, offer.currency, offer.availability, offer.condition, offer.confidence, offer.error, offer.promo_code ?? null, offer.promotion_text ?? null, product.url), db().prepare("UPDATE products SET title = coalesce(?, title), last_checked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(offer.name, product.id)])); checked += results.length; }
  return checked;
}
