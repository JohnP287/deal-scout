import { db } from "@/lib/deals";
import { scanAuthorized } from "@/lib/scan-auth";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  if (!(await scanAuthorized(request))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const rows = await db().prepare(`SELECT p.id,p.title,p.retailer,p.url,p.category,p.msrp_cents,p.msrp_source_url,p.canonical_key,p.manufacturer,p.model
    FROM products p WHERE p.active=1 ORDER BY EXISTS(SELECT 1 FROM watches w WHERE w.active=1 AND ((w.target_type='PRODUCT' AND w.target_value=p.url) OR (w.target_type='CATEGORY' AND lower(w.target_value)=lower(p.category)))) DESC, coalesce(p.last_checked_at,'1970-01-01') ASC LIMIT 80`).all();
  return Response.json({ targets: rows.results ?? [] }, { headers: { "Cache-Control": "no-store" } });
}
