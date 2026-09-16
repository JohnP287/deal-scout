import { db, scanProduct, type ProductRow } from "@/lib/deals";
export const dynamic = "force-dynamic";
function decodePart(value: string) { const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "="); return Uint8Array.from(atob(normalized), (char) => char.charCodeAt(0)); }
async function fromGitHubAction(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, ""); if (!token) return false;
  const parts = token.split("."); if (parts.length !== 3) return false;
  try {
    const header = JSON.parse(new TextDecoder().decode(decodePart(parts[0]))) as { alg?: string; kid?: string };
    const claims = JSON.parse(new TextDecoder().decode(decodePart(parts[1]))) as Record<string, unknown>;
    const now = Math.floor(Date.now() / 1000);
    if (header.alg !== "RS256" || !header.kid || claims.iss !== "https://token.actions.githubusercontent.com" || claims.aud !== "deal-scout" || claims.repository !== "JohnP287/deal-scout" || claims.ref !== "refs/heads/main" || !["schedule", "workflow_dispatch"].includes(String(claims.event_name)) || Number(claims.exp) < now || Number(claims.nbf ?? claims.iat) > now + 30) return false;
    const response = await fetch("https://token.actions.githubusercontent.com/.well-known/jwks"); if (!response.ok) return false;
    const jwks = await response.json() as { keys: JsonWebKey[] }; const jwk = jwks.keys.find((key) => key.kid === header.kid); if (!jwk) return false;
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    return crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, decodePart(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  } catch { return false; }
}
async function authorized(request: Request) { const origin = request.headers.get("origin"); const sameOrigin = origin && new URL(origin).host === new URL(request.url).host; return Boolean(sameOrigin) || fromGitHubAction(request); }
export async function POST(request: Request) {
  if (!(await authorized(request))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const rows = await db().prepare("SELECT id, title, retailer, url, category, msrp_cents, expected_resale_cents, active FROM products WHERE active = 1 ORDER BY coalesce(last_checked_at, '1970-01-01') ASC LIMIT 20").all<ProductRow>(); const products = rows.results ?? []; let checked = 0;
  for (let i = 0; i < products.length; i += 4) { const results = await Promise.all(products.slice(i, i + 4).map(async (product) => ({ product, offer: await scanProduct(product) }))); await db().batch(results.flatMap(({ product, offer }) => [db().prepare("INSERT INTO observations (product_id, price_cents, currency, availability, condition, confidence, error) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(product.id, offer.price_cents, offer.currency, offer.availability, offer.condition, offer.confidence, offer.error), db().prepare("UPDATE products SET title = coalesce(?, title), last_checked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(offer.name, product.id)])); checked += results.length; }
  return Response.json({ checked, at: new Date().toISOString() });
}
