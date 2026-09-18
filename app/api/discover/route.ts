import { db, discoverProductLinks, fetchRetailerPage } from "@/lib/deals";
import { normalizeProduct } from "@/lib/deal-core";
import { DISCOVERY_SOURCES } from "@/lib/providers";
import { providerMayRun, recordProviderResult } from "@/lib/provider-health";
import { scanAuthorized } from "@/lib/scan-auth";

export const dynamic = "force-dynamic";
const STARTERS = [
  { title: "NVIDIA GeForce RTX 5080 Founders Edition", retailer: "Best Buy", url: "https://www.bestbuy.com/product/nvidia-geforce-rtx-5080-16gb-gddr7-founders-edition-graphics-card-dark-gun-metal/J3GWYHGP8C", category: "GPU", msrp: 99999, source: "https://www.nvidia.com/en-us/geforce/graphics-cards/50-series/" },
  { title: "NVIDIA GeForce RTX 5080 Founders Edition", retailer: "NVIDIA", url: "https://marketplace.nvidia.com/en-us/consumer/graphics-cards/nvidia-geforce-rtx-5080/", category: "GPU", msrp: 99999, source: "https://www.nvidia.com/en-us/geforce/graphics-cards/50-series/" },
  { title: "NVIDIA GeForce RTX 5090 Founders Edition", retailer: "Best Buy", url: "https://www.bestbuy.com/product/nvidia-geforce-rtx-5090-32gb-gddr7-founders-edition-graphics-card-dark-gun-metal/J3GWYH2KXL", category: "GPU", msrp: 199999, source: "https://www.nvidia.com/en-us/geforce/graphics-cards/50-series/" },
];

export async function POST(request: Request) {
  if (!(await scanAuthorized(request))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  for (const item of STARTERS) {
    const normalized = normalizeProduct(item.title);
    await db().prepare(`INSERT INTO products (title, retailer, url, category, canonical_key, manufacturer, model, msrp_cents, msrp_source_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(url) DO UPDATE SET msrp_cents=excluded.msrp_cents, msrp_source_url=excluded.msrp_source_url, canonical_key=excluded.canonical_key, manufacturer=excluded.manufacturer, model=excluded.model, updated_at=CURRENT_TIMESTAMP`).bind(item.title, item.retailer, item.url, item.category, normalized.canonicalKey, normalized.manufacturer, normalized.model, item.msrp, item.source).run();
  }
  const batchSize = 8; const batchCount = Math.ceil(DISCOVERY_SOURCES.length / batchSize); const batch = Math.floor(Date.now() / 1_800_000) % Math.max(1, batchCount);
  const selected = DISCOVERY_SOURCES.slice(batch * batchSize, batch * batchSize + batchSize); let discovered = 0; let sourcesChecked = 0; let sourcesSkipped = 0; const errors: Array<{ provider: string; error: string }> = [];
  for (let i = 0; i < selected.length; i += 4) {
    const results = await Promise.all(selected.slice(i, i + 4).map(async ({ provider, url }) => {
      if (!(await providerMayRun(provider.id))) return { provider, url, skipped: true, products: [] as ReturnType<typeof discoverProductLinks> };
      const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 12_000); const started = Date.now();
      try { const response = await fetchRetailerPage(url, controller.signal); const products = discoverProductLinks(await response.text(), url); await recordProviderResult(provider, { ok: true, responseMs: Date.now() - started, discovered: products.length }); return { provider, url, skipped: false, products }; }
      catch (error) { const message = error instanceof Error ? error.message : "Discovery failed"; await recordProviderResult(provider, { ok: false, responseMs: Date.now() - started, error: message }); return { provider, url, skipped: false, products: [] as ReturnType<typeof discoverProductLinks>, error: message }; }
      finally { clearTimeout(timeout); }
    }));
    for (const result of results) {
      if (result.skipped) { sourcesSkipped++; continue; } sourcesChecked++; if (result.error) errors.push({ provider: result.provider.name, error: result.error.slice(0, 120) });
      for (const product of result.products) {
        await db().prepare(`INSERT INTO products (title, retailer, url, category, canonical_key, manufacturer, model, msrp_cents, msrp_source_url, expected_resale_cents) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(url) DO UPDATE SET title=excluded.title, retailer=excluded.retailer, category=excluded.category, canonical_key=excluded.canonical_key, manufacturer=coalesce(excluded.manufacturer, products.manufacturer), model=coalesce(excluded.model, products.model), msrp_cents=CASE WHEN excluded.msrp_cents>0 THEN excluded.msrp_cents ELSE products.msrp_cents END, msrp_source_url=coalesce(excluded.msrp_source_url, products.msrp_source_url), updated_at=CURRENT_TIMESTAMP`).bind(product.title, product.retailer, product.url, product.category, product.canonical_key, product.manufacturer, product.model, product.msrp_cents, product.msrp_source_url, product.expected_resale_cents).run(); discovered++;
      }
    }
  }
  return Response.json({ sources_checked: sourcesChecked, sources_skipped: sourcesSkipped, products_discovered: discovered, provider_errors: errors, at: new Date().toISOString() });
}
