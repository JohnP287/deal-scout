import { env } from "cloudflare:workers";

export type ProductRow = { id: number; title: string; retailer: string; url: string; category: string; msrp_cents: number; expected_resale_cents: number | null; active: number };
export function db() { if (!env.DB) throw new Error("Deal database unavailable"); return env.DB; }
const RETAILERS: Record<string, string> = { "bestbuy.com": "Best Buy", "microcenter.com": "Micro Center", "nvidia.com": "NVIDIA", "newegg.com": "Newegg", "walmart.com": "Walmart", "amazon.com": "Amazon", "target.com": "Target", "gamestop.com": "GameStop" };
export function safeRetailerUrl(value: string, base?: string) {
  const url = new URL(value, base);
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const match = Object.entries(RETAILERS).find(([domain]) => host === domain || host.endsWith(`.${domain}`));
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") || !match) throw new Error("Use a supported HTTPS retailer product page.");
  return { url, retailer: match[1] };
}
export function retailerFromUrl(url: string) { return safeRetailerUrl(url).retailer; }
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
  return { price_cents: Number.isFinite(price) ? Math.round(price * 100) : null, availability, condition, name: typeof product?.name === "string" ? product.name : null, currency: typeof offer?.priceCurrency === "string" ? offer.priceCurrency : "USD", confidence: Number.isFinite(price) ? (availability ? 96 : 88) : 0 };
}
export async function scanProduct(product: ProductRow) {
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    let current = safeRetailerUrl(product.url).url;
    let response: Response | null = null;
    for (let redirects = 0; redirects <= 3; redirects++) {
      response = await fetch(current, { headers: { "user-agent": "Mozilla/5.0 (compatible; DealScout/1.0; +https://deal-scout.johnpz287.chatgpt.site)", accept: "text/html,application/xhtml+xml" }, redirect: "manual", signal: controller.signal });
      if (response.status < 300 || response.status >= 400) break;
      const location = response.headers.get("location");
      if (!location || redirects === 3) throw new Error("Retailer redirected too many times");
      current = safeRetailerUrl(location, current.toString()).url;
    }
    if (!response?.ok) throw new Error(`Retailer returned ${response?.status ?? "no response"}`);
    const offer = extractOffer(await response.text()); if (offer.price_cents == null) throw new Error("Price was not exposed in structured product data"); return { ...offer, error: null };
  }
  catch (error) { return { price_cents: null, availability: null, condition: null, name: null, currency: "USD", confidence: 0, error: error instanceof Error ? error.message.slice(0, 180) : "Check failed" }; }
  finally { clearTimeout(timeout); }
}
