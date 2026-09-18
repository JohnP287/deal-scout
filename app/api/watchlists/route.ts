import { db } from "@/lib/deals";
export const dynamic = "force-dynamic";
const validClient = (value: unknown) => typeof value === "string" && /^[a-zA-Z0-9_-]{16,80}$/.test(value);
export async function GET(request: Request) {
  const clientId = new URL(request.url).searchParams.get("client_id"); if (!validClient(clientId)) return Response.json({ error: "Invalid client identifier." }, { status: 400 });
  const watches = await db().prepare("SELECT * FROM watches WHERE client_id=? AND active=1 ORDER BY created_at DESC LIMIT 100").bind(clientId).all(); return Response.json({ watches: watches.results ?? [] });
}
export async function POST(request: Request) {
  const body = await request.json() as Record<string, unknown>; if (!validClient(body.client_id)) return Response.json({ error: "Invalid client identifier." }, { status: 400 });
  const targetType = String(body.target_type ?? "QUERY").toUpperCase(); const targetValue = String(body.target_value ?? "").replace(/\s+/g," ").trim().slice(0,180); const retailer = String(body.retailer ?? "").trim().slice(0,80) || null;
  if (!["PRODUCT","CATEGORY","QUERY"].includes(targetType) || targetValue.length < 2) return Response.json({ error: "Choose a valid product, category, or search watch." }, { status: 400 });
  const existing = await db().prepare("SELECT COUNT(*) AS count FROM watches WHERE client_id=? AND active=1").bind(body.client_id).first<{count:number}>(); if (Number(existing?.count) >= 50) return Response.json({ error: "Watch limit reached." }, { status: 429 });
  const maxPrice = Number(body.max_price); const minDiscount = Number(body.min_discount_percent); const eventTypes = Array.isArray(body.event_types) ? body.event_types.map(String).filter((value) => ["RESTOCK","PRICE_DROP","THRESHOLD","PROMO_CODE"].includes(value)).join(",") : "RESTOCK,PRICE_DROP,THRESHOLD,PROMO_CODE";
  const result = await db().prepare("INSERT INTO watches (client_id,target_type,target_value,max_price_cents,min_discount_percent,retailer,event_types) VALUES (?,?,?,?,?,?,?)").bind(body.client_id, targetType, targetValue, Number.isFinite(maxPrice)&&maxPrice>0?Math.round(maxPrice*100):null, Number.isFinite(minDiscount)&&minDiscount>0?Math.round(minDiscount):null, retailer, eventTypes || "RESTOCK,PRICE_DROP,THRESHOLD,PROMO_CODE").run(); return Response.json({ id: result.meta.last_row_id }, { status: 201 });
}
export async function DELETE(request: Request) {
  const body = await request.json() as Record<string, unknown>; if (!validClient(body.client_id) || !Number.isSafeInteger(Number(body.id))) return Response.json({ error: "Invalid request." }, { status: 400 });
  await db().prepare("UPDATE watches SET active=0,updated_at=CURRENT_TIMESTAMP WHERE id=? AND client_id=?").bind(Number(body.id), body.client_id).run(); return Response.json({ ok: true });
}
