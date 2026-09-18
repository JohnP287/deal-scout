import { env } from "cloudflare:workers";
import type { ProviderDefinition } from "@/lib/providers";

function database() { if (!env.DB) throw new Error("Deal database unavailable"); return env.DB; }

export async function recordProviderResult(provider: ProviderDefinition, result: { ok: boolean; responseMs: number; discovered?: number; verified?: number; error?: string }) {
  const failures = result.ok ? 0 : 1;
  const successes = result.ok ? 1 : 0;
  const current = await database().prepare("SELECT consecutive_failures FROM provider_health WHERE id=?").bind(provider.id).first<{ consecutive_failures: number }>();
  const backoffMinutes = result.ok ? 0 : Math.min(360, 5 * 2 ** Math.min(6, Number(current?.consecutive_failures ?? 0)));
  await database().prepare(`INSERT INTO provider_health
    (id, provider_name, status, consecutive_failures, successful_requests, failed_requests, response_ms_total, products_discovered, products_verified, last_attempt_at, last_success_at, next_retry_at, last_error, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE NULL END, CASE WHEN ? THEN NULL ELSE datetime('now', '+' || ? || ' minutes') END, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      provider_name=excluded.provider_name,
      status=CASE WHEN excluded.status='HEALTHY' THEN 'HEALTHY' WHEN provider_health.consecutive_failures + 1 >= 3 THEN 'DEGRADED' ELSE 'RETRYING' END,
      consecutive_failures=CASE WHEN excluded.status='HEALTHY' THEN 0 ELSE provider_health.consecutive_failures + 1 END,
      successful_requests=provider_health.successful_requests + excluded.successful_requests,
      failed_requests=provider_health.failed_requests + excluded.failed_requests,
      response_ms_total=provider_health.response_ms_total + excluded.response_ms_total,
      products_discovered=provider_health.products_discovered + excluded.products_discovered,
      products_verified=provider_health.products_verified + excluded.products_verified,
      last_attempt_at=CURRENT_TIMESTAMP,
      last_success_at=CASE WHEN excluded.status='HEALTHY' THEN CURRENT_TIMESTAMP ELSE provider_health.last_success_at END,
      next_retry_at=excluded.next_retry_at,
      last_error=excluded.last_error,
      updated_at=CURRENT_TIMESTAMP`)
    .bind(provider.id, provider.name, result.ok ? "HEALTHY" : "RETRYING", result.ok ? 0 : 1, successes, failures, Math.max(0, Math.round(result.responseMs)), result.discovered ?? 0, result.verified ?? 0, result.ok ? 1 : 0, result.ok ? 1 : 0, backoffMinutes, result.error?.slice(0, 180) ?? null).run();
}

export async function providerMayRun(providerId: string) {
  const row = await database().prepare("SELECT next_retry_at FROM provider_health WHERE id = ?").bind(providerId).first<{ next_retry_at: string | null }>();
  return !row?.next_retry_at || new Date(`${row.next_retry_at}Z`).getTime() <= Date.now();
}
