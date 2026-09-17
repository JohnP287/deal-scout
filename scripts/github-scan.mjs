const SITE_URL = process.env.SITE_URL || "https://deal-scout.johnpz287.chatgpt.site";
const TOKEN = process.env.OIDC_TOKEN;
if (!TOKEN) throw new Error("OIDC_TOKEN is required");

const RETAILERS = new Map(Object.entries({
  "bestbuy.com":"Best Buy", "microcenter.com":"Micro Center", "nvidia.com":"NVIDIA", "newegg.com":"Newegg", "walmart.com":"Walmart", "amazon.com":"Amazon", "target.com":"Target", "gamestop.com":"GameStop",
  "bhphotovideo.com":"B&H Photo", "adorama.com":"Adorama", "dell.com":"Dell", "hp.com":"HP", "lenovo.com":"Lenovo", "asus.com":"ASUS", "acer.com":"Acer", "samsung.com":"Samsung", "lg.com":"LG", "sony.com":"Sony", "corsair.com":"Corsair", "logitechg.com":"Logitech G", "razer.com":"Razer", "woot.com":"Woot"
}));
const SOURCES = [
  ["https://www.bestbuy.com/site/searchpage.jsp?st=gaming+deals", "Best Buy"], ["https://www.microcenter.com/search/search_results.aspx?Ntt=gaming&storeid=061", "Micro Center"],
  ["https://www.newegg.com/Homepage-All-Deals/EventSaleStore/ID-9447", "Newegg"], ["https://www.walmart.com/search?q=gaming+tech+deals", "Walmart"],
  ["https://www.bhphotovideo.com/c/search?q=gaming%20monitor", "B&H Photo"], ["https://www.adorama.com/l/?searchinfo=gaming%20monitor", "Adorama"],
  ["https://www.dell.com/en-us/search/gaming%20laptop", "Dell"], ["https://www.hp.com/us-en/shop/slp/weekly-deals/gaming", "HP"],
  ["https://www.lenovo.com/us/en/search?text=gaming%20laptop", "Lenovo"], ["https://www.asus.com/us/searchresult?searchType=products&searchKey=gaming%20monitor", "ASUS"],
  ["https://www.samsung.com/us/search/searchMain/?listType=g&searchTerm=gaming%20monitor", "Samsung"], ["https://www.corsair.com/us/en/search?q=gaming", "Corsair"],
  ["https://www.logitechg.com/en-us/search.html?q=gaming", "Logitech G"], ["https://www.razer.com/search/gaming", "Razer"], ["https://www.woot.com/search?keyword=gaming", "Woot"]
];
const KEYWORDS = /geforce|\brtx\b|radeon|ryzen|core ultra|gaming|oled|monitor|laptop|desktop|keyboard|mouse|headset|controller|playstation|\bps5\b|xbox|nintendo|switch|steam deck|rog ally|legion go|meta quest|ssd|nvme|ddr5|motherboard|limited edition/i;
const headers = { "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/128 Safari/537.36 DealScout/2.0", accept: "text/html,application/xhtml+xml" };
const clean = (s) => String(s || "").replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
function retailerUrl(value, base) { const url = new URL(value, base); const host = url.hostname.toLowerCase().replace(/^www\./, ""); const entry = [...RETAILERS].find(([domain]) => host === domain || host.endsWith(`.${domain}`)); if (url.protocol !== "https:" || !entry) throw new Error("unsupported URL"); url.hash = ""; return { url, retailer: entry[1] }; }
async function getHtml(url, timeout = 15000) { const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeout); try { const response = await fetch(url, { headers, redirect: "follow", signal: controller.signal }); if (!response.ok) throw new Error(`HTTP ${response.status}`); return await response.text(); } finally { clearTimeout(timer); } }
function walk(value, out) { if (!value || typeof value !== "object") return; if (Array.isArray(value)) return value.forEach((v) => walk(v, out)); out.push(value); Object.values(value).forEach((v) => walk(v, out)); }
function promo(html) { const text = clean(html); const match = text.match(/(?:promo(?:tional)?|coupon)\s+code(?:\s+is|\s*:)?\s+[“"']?([A-Z0-9][A-Z0-9-]{2,24})\b/i) || text.match(/\buse\s+code\s+[“"']?([A-Z0-9][A-Z0-9-]{2,24})\b/i); return match ? { promo_code: match[1].toUpperCase(), promotion_text: match[0].slice(0, 180) } : { promo_code: null, promotion_text: null }; }
function offerFrom(html) {
  const objects = [];
  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) { try { walk(JSON.parse(match[1]), objects); } catch {} }
  const product = objects.find((o) => o["@type"] === "Product") || objects.find((o) => o.offers); const raw = product?.offers || objects.find((o) => o["@type"] === "Offer"); const offer = Array.isArray(raw) ? raw[0] : raw;
  let priceValue = offer?.price ?? offer?.priceSpecification?.price; let price = typeof priceValue === "number" ? priceValue : Number(String(priceValue || "").replace(/[^0-9.]/g, "")); let confidence = 94;
  if (!Number.isFinite(price) || price < 1) { const meta = html.match(/(?:itemprop=["']price["'][^>]*content=["']|property=["']product:price:amount["'][^>]*content=["'])([0-9,.]+)/i) || html.match(/(?:content=["'])([0-9,.]+)(?:["'][^>]*(?:itemprop=["']price["']|property=["']product:price:amount["']))/i); price = meta ? Number(meta[1].replace(/,/g, "")) : NaN; confidence = 86; }
  if (!Number.isFinite(price) || price < 1 || price > 20000) return null;
  const availability = String(offer?.availability || (/\bin stock\b|add to cart/i.test(clean(html)) ? "InStock" : "Unknown")).split("/").pop(); const condition = String(offer?.itemCondition || "NewCondition").split("/").pop();
  return { price_cents: Math.round(price * 100), currency: offer?.priceCurrency || "USD", availability, condition, confidence, title: typeof product?.name === "string" ? clean(product.name) : null, ...promo(html) };
}
function category(title) { if (/rtx|geforce|radeon|graphics card/i.test(title)) return "GPU"; if (/monitor|display|oled/i.test(title)) return "Monitor"; if (/laptop|notebook/i.test(title)) return "Gaming laptop"; if (/desktop|gaming pc|prebuilt/i.test(title)) return "Gaming desktop"; if (/keyboard/i.test(title)) return "Keyboard"; if (/\bmouse\b/i.test(title)) return "Mouse"; if (/headset|headphone/i.test(title)) return "Headset"; if (/controller|gamepad/i.test(title)) return "Controller"; if (/ssd|nvme/i.test(title)) return "Storage"; if (/ddr|memory|ram/i.test(title)) return "Memory"; if (/motherboard/i.test(title)) return "Motherboard"; if (/console|playstation|xbox|switch/i.test(title)) return "Console"; return "Gaming hardware"; }
function discover(html, source) { const items = []; const seen = new Set(); for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]{8,800}?)<\/a>/gi)) { const title = clean(match[2]); if (!KEYWORDS.test(title) || title.length > 180) continue; try { const { url } = retailerUrl(match[1], source); if (seen.has(url.href)) continue; const start = match.index || 0; const card = clean(html.slice(Math.max(0, start - 300), start + 3500)); const prices = [...card.matchAll(/\$\s*([0-9]{1,5}(?:,[0-9]{3})*(?:\.\d{2})?)/g)].map((p) => Number(p[1].replace(/,/g, ""))).filter((p) => p >= 1 && p <= 20000); if (!prices.length) continue; seen.add(url.href); items.push({ url: url.href, title, category: category(title), price_cents: Math.round(prices[0] * 100), currency: "USD", availability: /add to cart|in stock|shipping|pickup/i.test(card) ? "InStock" : "Unknown", condition: "NewCondition", confidence: 76, source_type: "github-listing", source_url: source, ...promo(card) }); } catch {} } return items.slice(0, 8); }
async function post(observations) { if (!observations.length) return { accepted: 0 }; const response = await fetch(`${SITE_URL}/api/ingest`, { method: "POST", headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" }, body: JSON.stringify({ observations: observations.slice(0, 80) }) }); if (!response.ok) throw new Error(`Ingest failed ${response.status}: ${await response.text()}`); return response.json(); }

const dealsResponse = await fetch(`${SITE_URL}/api/deals`, { headers: { accept: "application/json" } }); if (!dealsResponse.ok) throw new Error(`Could not load tracked deals: ${dealsResponse.status}`); const deals = (await dealsResponse.json()).deals || [];
const targets = [...deals].sort((a, b) => Number(a.price_cents != null) - Number(b.price_cents != null)).slice(0, 48); const observations = [];
for (let i = 0; i < targets.length; i += 6) await Promise.all(targets.slice(i, i + 6).map(async (deal) => { try { const html = await getHtml(deal.url); const offer = offerFrom(html); if (offer) observations.push({ id: deal.id, ...offer, source_type: "github-direct", source_url: deal.url }); } catch {} }));
for (let i = 0; i < SOURCES.length; i += 5) await Promise.all(SOURCES.slice(i, i + 5).map(async ([source]) => { try { observations.push(...discover(await getHtml(source, 12000), source)); } catch {} }));
const unique = [...new Map(observations.map((item) => [`${item.id || item.url}|${item.price_cents}`, item])).values()].slice(0, 80); const result = await post(unique);
console.log(JSON.stringify({ tracked: targets.length, extracted: unique.length, ...result }));
