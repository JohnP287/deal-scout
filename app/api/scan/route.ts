import { scanActiveProducts } from "@/lib/deals";
import { scanAuthorized } from "@/lib/scan-auth";
export const dynamic = "force-dynamic";
export async function POST(request: Request) { if (!(await scanAuthorized(request))) return Response.json({ error: "Unauthorized" }, { status: 401 }); const checked = await scanActiveProducts(20); return Response.json({ checked, at: new Date().toISOString() }); }
