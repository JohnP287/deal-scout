export type StockStatus = "IN_STOCK" | "LOW_STOCK" | "PREORDER" | "BACKORDER" | "COMING_SOON" | "OUT_OF_STOCK" | "UNKNOWN";
export type StockEvidence = { status: StockStatus; confidence: number; evidence: string };

export function cleanText(value: string) { return value.replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim(); }

export function classifyStock(value: string, structured = false): StockEvidence {
  const text = cleanText(value).toLowerCase();
  if (/outofstock|out of stock|sold out|currently unavailable|not available for (?:shipping|pickup|purchase)|unavailable nearby/.test(text)) return { status: "OUT_OF_STOCK", confidence: structured ? 99 : 94, evidence: structured ? "Structured availability: OutOfStock" : "Explicit out-of-stock text" };
  if (/preorder|pre-order|pre order/.test(text)) return { status: "PREORDER", confidence: structured ? 98 : 92, evidence: "Explicit preorder status" };
  if (/backorder|back-order|back order/.test(text)) return { status: "BACKORDER", confidence: structured ? 98 : 92, evidence: "Explicit backorder status" };
  if (/coming soon|notify me|release date/.test(text)) return { status: "COMING_SOON", confidence: structured ? 96 : 86, evidence: "Explicit coming-soon status" };
  if (/lowstock|low stock|only \d+ left|few left/.test(text)) return { status: "LOW_STOCK", confidence: structured ? 98 : 92, evidence: "Explicit low-stock signal" };
  if (/instock|in stock|available for shipping|available for pickup/.test(text)) return { status: "IN_STOCK", confidence: structured ? 99 : 94, evidence: structured ? "Structured availability: InStock" : "Explicit stock text" };
  if (/add to cart|buy now/.test(text)) return { status: "IN_STOCK", confidence: 86, evidence: "Active purchase control" };
  return { status: "UNKNOWN", confidence: 35, evidence: "No reliable inventory signal" };
}

const ACCESSORY = /water\s*block|gpu\s*bracket|backplate|empty\s*box|replacement\s*fan|cooler\s*only|cable\s*only|skin\s*only/i;
export function normalizeProduct(title: string) {
  const normalized = cleanText(title).toLowerCase().replace(/[™®]/g, "").replace(/\b(?:new|sale|deal)\b[!:\s-]*/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
  const manufacturer = normalized.match(/\b(nvidia|amd|asus|msi|gigabyte|pny|zotac|lg|samsung|sony|acer|alienware|dell|hp|omen|lenovo|corsair|razer|logitech|steelseries|hyperx|viewsonic|aoc|intel|microsoft|nintendo|playstation)\b/)?.[1] ?? null;
  const model = normalized.match(/\b(?:rtx\s*)?\d{4}(?:\s*ti|\s*super)?\b|\b[a-z]{1,5}\d{2,5}[a-z0-9-]*\b/)?.[0] ?? null;
  const canonical = [manufacturer, model, normalized.replace(/\b(?:black|white|silver|gray|grey)\b/g, "")].filter(Boolean).join("|").slice(0, 220);
  return { canonicalKey: canonical, manufacturer, model, suspicious: ACCESSORY.test(title) };
}

export function relevanceScore(title: string, query: string) {
  const q = normalizeProduct(query); const t = normalizeProduct(title);
  if (t.suspicious) return 0;
  if (/laptop|notebook/i.test(title) && !/laptop|notebook/i.test(query)) return 0;
  if (/\bti\b/i.test(title) !== /\bti\b/i.test(query) && /\brtx\s*\d{4}/i.test(query)) return 0;
  if (/founders edition|\bfe\b/i.test(query) && !/founders edition/i.test(title)) return 0;
  let score = 0; const qWords = q.canonicalKey.split(/\W+/).filter((word) => word.length > 1); const haystack = ` ${t.canonicalKey} `;
  for (const word of qWords) if (haystack.includes(` ${word} `)) score += 8;
  if (q.model && t.model === q.model) score += 45;
  if (q.model && t.model && q.model !== t.model) score -= 80;
  if (q.manufacturer && t.manufacturer === q.manufacturer) score += 15;
  if (/founders edition|\bfe\b/i.test(query) && /founders edition/i.test(title)) score += 25;
  return Math.max(0, score);
}

export function extractPromo(text: string) {
  const clean = cleanText(text);
  for (const match of clean.matchAll(/(?:promo(?:tional)?|coupon)\s+code(?:\s+is|\s*:)?\s+[“"']?([A-Z0-9][A-Z0-9-]{2,24})\b|\buse\s+code\s+[“"']?([A-Z0-9][A-Z0-9-]{2,24})\b/gi)) {
    const context = clean.slice(Math.max(0, (match.index ?? 0) - 100), (match.index ?? 0) + match[0].length + 180);
    if (/expired|has ended|no longer valid|was valid/i.test(context)) continue;
    const expiration = context.match(/(?:expires?|ends?)\s*(?:on)?\s*([A-Za-z]{3,9}\s+\d{1,2}(?:,\s*\d{4})?|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i)?.[1] ?? null;
    const code = (match[1] ?? match[2]).toUpperCase();
    return { code, text: context.slice(0, 180), expiration, status: "REPORTED" as const, confidence: 78 };
  }
  return null;
}

export function alertEventKey(watchId: number, productId: number, eventType: string, value: string) {
  return `${watchId}:${productId}:${eventType}:${value}`.toLowerCase();
}
