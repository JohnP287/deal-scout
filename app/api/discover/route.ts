import { db, discoverProductLinks, fetchRetailerPage, scanActiveProducts } from "@/lib/deals";
import { scanAuthorized } from "@/lib/scan-auth";
export const dynamic = "force-dynamic";
const SEARCHES: Array<[string, string]> = [
  ["Best Buy", "graphics card"], ["Best Buy", "gaming monitor"], ["Best Buy", "gaming laptop"], ["Best Buy", "gaming desktop"],
  ["Best Buy", "gaming keyboard mouse"], ["Best Buy", "gaming headset"], ["Best Buy", "capture card streaming"], ["Best Buy", "gaming router"],
  ["Best Buy", "ps5 xbox nintendo console"], ["Best Buy", "gaming handheld"], ["Best Buy", "limited edition gaming"],
  ["Micro Center", "graphics card"], ["Micro Center", "gaming monitor"], ["Micro Center", "gaming laptop"], ["Micro Center", "gaming desktop"],
  ["Micro Center", "cpu motherboard"], ["Micro Center", "ddr5 memory"], ["Micro Center", "nvme ssd"], ["Micro Center", "gaming peripherals"],
  ["Newegg", "graphics card"], ["Newegg", "gaming monitor"], ["Newegg", "gaming laptop"], ["Newegg", "cpu motherboard"],
  ["Newegg", "ddr5 nvme gaming"], ["Walmart", "gaming console limited edition"], ["Walmart", "gaming monitor"],
  ["Target", "gaming console limited edition"], ["Target", "gaming controller"], ["GameStop", "limited edition console"], ["GameStop", "gaming controller"]
];
function sourceUrl(retailer: string, query: string) {
  const q = encodeURIComponent(query);
  if (retailer === "Best Buy") return `https://www.bestbuy.com/site/searchpage.jsp?st=${q}`;
  if (retailer === "Micro Center") return `https://www.microcenter.com/search/search_results.aspx?Ntt=${q}&storeid=061`;
  if (retailer === "Newegg") return `https://www.newegg.com/p/pl?d=${q}`;
  if (retailer === "Walmart") return `https://www.walmart.com/search?q=${q}`;
  if (retailer === "Target") return `https://www.target.com/s?searchTerm=${q}`;
  return `https://www.gamestop.com/search/?q=${q}`;
}
const SOURCES = SEARCHES.map(([retailer, query]) => sourceUrl(retailer, query));
const STARTERS: Array<[string, string, string, string, number, number]> = [["NVIDIA GeForce RTX 5080 Founders Edition", "Best Buy", "https://www.bestbuy.com/product/nvidia-geforce-rtx-5080-16gb-gddr7-founders-edition-graphics-card-dark-gun-metal/J3GWYHGP8C", "GPU", 99999, 145000], ["NVIDIA GeForce RTX 5080 Founders Edition", "NVIDIA", "https://marketplace.nvidia.com/en-us/consumer/graphics-cards/nvidia-geforce-rtx-5080/", "GPU", 99999, 145000], ["NVIDIA GeForce RTX 5090 Founders Edition", "Best Buy", "https://www.bestbuy.com/product/nvidia-geforce-rtx-5090-32gb-gddr7-founders-edition-graphics-card-dark-gun-metal/J3GWYH2KXL", "GPU", 199999, 275000]];
export async function POST(request: Request) {
  if (!(await scanAuthorized(request))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  await db().batch(STARTERS.map((item) => db().prepare("INSERT OR IGNORE INTO products (title, retailer, url, category, msrp_cents, expected_resale_cents) VALUES (?, ?, ?, ?, ?, ?)").bind(...item)));
  let discovered = 0; let sourcesChecked = 0; const sourceErrors: string[] = [];
  for (let i = 0; i < SOURCES.length; i += 6) {
    const results = await Promise.all(SOURCES.slice(i, i + 6).map(async (source) => {
      const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 9_000);
      try { const response = await fetchRetailerPage(source, controller.signal); return { source, products: discoverProductLinks(await response.text(), source) }; }
      catch { return { source, products: [] }; }
      finally { clearTimeout(timeout); }
    }));
    for (const result of results) { sourcesChecked++; if (!result.products.length) sourceErrors.push(new URL(result.source).hostname); for (const product of result.products) { const insert = await db().prepare("INSERT OR IGNORE INTO products (title, retailer, url, category, msrp_cents, expected_resale_cents) VALUES (?, ?, ?, ?, ?, ?)").bind(product.title, product.retailer, product.url, product.category, product.msrp_cents, product.expected_resale_cents).run(); if (insert.meta.changes) discovered++; } }
  }
  const checked = await scanActiveProducts(36);
  return Response.json({ discovered, checked, sources_checked: sourcesChecked, sources_without_results: [...new Set(sourceErrors)].length, categories: [...new Set(SEARCHES.map(([, query]) => query))].length, at: new Date().toISOString() });
}
