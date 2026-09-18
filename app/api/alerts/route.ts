import { db } from "@/lib/deals";
export const dynamic = "force-dynamic";
const validClient = (value: unknown) => typeof value === "string" && /^[a-zA-Z0-9_-]{16,80}$/.test(value);
export async function GET(request: Request) {
  const clientId = new URL(request.url).searchParams.get("client_id"); if (!validClient(clientId)) return Response.json({ error: "Invalid client identifier." }, { status: 400 });
  const alerts = await db().prepare("SELECT a.*,p.url,p.title AS product_title FROM alert_events a JOIN watches w ON w.id=a.watch_id LEFT JOIN products p ON p.id=a.product_id WHERE w.client_id=? ORDER BY a.created_at DESC LIMIT 100").bind(clientId).all(); return Response.json({ alerts: alerts.results ?? [], unread: (alerts.results ?? []).filter((row) => !(row as Record<string,unknown>).seen_at).length });
}
export async function POST(request: Request) {
  const body = await request.json() as Record<string, unknown>; if (!validClient(body.client_id)) return Response.json({ error: "Invalid client identifier." }, { status: 400 });
  await db().prepare("UPDATE alert_events SET seen_at=CURRENT_TIMESTAMP WHERE seen_at IS NULL AND watch_id IN (SELECT id FROM watches WHERE client_id=?)").bind(body.client_id).run(); return Response.json({ ok: true });
}
