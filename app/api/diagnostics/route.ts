import { db } from "@/lib/deals";
import { APPROVED_SOURCE_COUNT } from "@/lib/providers";
export const dynamic = "force-dynamic";
export async function GET() {
  const [providers, totals] = await Promise.all([
    db().prepare("SELECT id,provider_name,status,consecutive_failures,successful_requests,failed_requests,CASE WHEN successful_requests>0 THEN round(response_ms_total*1.0/successful_requests) ELSE NULL END AS average_response_ms,products_discovered,products_verified,last_attempt_at,last_success_at,next_retry_at,last_error FROM provider_health ORDER BY status,provider_name").all(),
    db().prepare(`SELECT (SELECT COUNT(*) FROM products WHERE active=1) AS products_tracked,(SELECT COUNT(*) FROM observations) AS checks,(SELECT COUNT(*) FROM observations WHERE price_cents IS NOT NULL) AS successful_checks,(SELECT COUNT(*) FROM watches WHERE active=1) AS watches,(SELECT COUNT(*) FROM alert_events) AS alerts,(SELECT COUNT(*) FROM promo_codes WHERE status IN ('VERIFIED','REPORTED')) AS promo_codes`).first(),
  ]);
  return Response.json({ configured_providers: APPROVED_SOURCE_COUNT, providers: providers.results ?? [], totals, generated_at: new Date().toISOString() }, { headers: { "Cache-Control": "public,max-age=30" } });
}
