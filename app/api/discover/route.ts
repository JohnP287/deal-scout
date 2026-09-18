import { db, discoverProductLinks, fetchRetailerPage } from "@/lib/deals";
import { scanAuthorized } from "@/lib/scan-auth";
export const dynamic = "force-dynamic";
const SEARCHES: Array<[string, string]> = [
  ["Best Buy", "graphics card"], ["Best Buy", "gaming monitor"], ["Best Buy", "gaming laptop"], ["Best Buy", "gaming desktop"],
  ["Best Buy", "gaming keyboard mouse"], ["Best Buy", "gaming headset"], ["Best Buy", "capture card streaming"], ["Best Buy", "gaming router"],
  ["Best Buy", "ps5 xbox nintendo console"], ["Best Buy", "gaming handheld"], ["Best Buy", "limited edition gaming"],
  ["Micro Center", "graphics card"], ["Micro Center", "gaming monitor"], ["Micro Center", "gaming laptop"], ["Micro Center", "gaming desktop"],
  ["Micro Center", "cpu motherboard"], ["Micro Center", "ddr5 memory"], ["Micro Center", "nvme ssd"], ["Micro Center", "gaming peripherals"],
  ["Newegg", "top deals"], ["Newegg", "graphics card"], ["Newegg", "gaming monitor"], ["Newegg", "gaming laptop"], ["Newegg", "cpu motherboard"],
  ["Newegg", "ddr5 nvme gaming"], ["Walmart", "gaming console limited edition"], ["Walmart", "gaming monitor"],
  ["Target", "gaming console limited edition"], ["Target", "gaming controller"], ["GameStop", "limited edition console"], ["GameStop", "gaming controller"]
  , ["B&H Photo", "gaming monitor"], ["B&H Photo", "graphics card"], ["Adorama", "gaming monitor"], ["Dell", "gaming laptop"],
  ["HP", "weekly gaming deals"], ["Lenovo", "gaming laptop"], ["ASUS", "gaming monitor"], ["Samsung", "gaming monitor"],
  ["Corsair", "gaming keyboard"], ["Logitech G", "gaming mouse"], ["Razer", "gaming headset"], ["Woot", "gaming"]
];
function sourceUrl(retailer: string, query: string) {
  const q = encodeURIComponent(query);
  if (retailer === "Best Buy") return `https://www.bestbuy.com/site/searchpage.jsp?st=${q}`;
  if (retailer === "Micro Center") return `https://www.microcenter.com/search/search_results.aspx?Ntt=${q}&storeid=061`;
  if (retailer === "Newegg" && query === "top deals") return "https://www.newegg.com/Homepage-All-Deals/EventSaleStore/ID-9447";
  if (retailer === "Newegg") return `https://www.newegg.com/p/pl?d=${q}`;
  if (retailer === "Walmart") return `https://www.walmart.com/search?q=${q}`;
  if (retailer === "Target") return `https://www.target.com/s?searchTerm=${q}`;
  if (retailer === "GameStop") return `https://www.gamestop.com/search/?q=${q}`;
  if (retailer === "B&H Photo") return `https://www.bhphotovideo.com/c/search?q=${q}`;
  if (retailer === "Adorama") return `https://www.adorama.com/l/?searchinfo=${q}`;
  if (retailer === "Dell") return `https://www.dell.com/en-us/search/${q}`;
  if (retailer === "HP" && query === "weekly gaming deals") return "https://www.hp.com/us-en/shop/slp/weekly-deals/gaming";
  if (retailer === "HP") return `https://www.hp.com/us-en/shop/sitesearch?keyword=${q}`;
  if (retailer === "Lenovo") return `https://www.lenovo.com/us/en/search?text=${q}`;
  if (retailer === "ASUS") return `https://www.asus.com/us/searchresult?searchType=products&searchKey=${q}`;
  if (retailer === "Samsung") return `https://www.samsung.com/us/search/searchMain/?listType=g&searchTerm=${q}`;
  if (retailer === "Corsair") return `https://www.corsair.com/us/en/search?q=${q}`;
  if (retailer === "Logitech G") return `https://www.logitechg.com/en-us/search.html?q=${q}`;
  if (retailer === "Razer") return `https://www.razer.com/search/${q}`;
  return `https://www.woot.com/search?keyword=${q}`;
}
const SOURCES = SEARCHES.map(([retailer, query]) => sourceUrl(retailer, query));
const STARTERS: Array<[string, string, string, string, number, number]> = [["NVIDIA GeForce RTX 5080 Founders Edition", "Best Buy", "https://www.bestbuy.com/product/nvidia-geforce-rtx-5080-16gb-gddr7-founders-edition-graphics-card-dark-gun-metal/J3GWYHGP8C", "GPU", 99999, 145000], ["NVIDIA GeForce RTX 5080 Founders Edition", "NVIDIA", "https://marketplace.nvidia.com/en-us/consumer/graphics-cards/nvidia-geforce-rtx-5080/", "GPU", 99999, 145000], ["NVIDIA GeForce RTX 5090 Founders Edition", "Best Buy", "https://www.bestbuy.com/product/nvidia-geforce-rtx-5090-32gb-gddr7-founders-edition-graphics-card-dark-gun-metal/J3GWYH2KXL", "GPU", 199999, 275000]];
export async function POST(request: Request) {
  if (!(await scanAuthorized(request))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  await db().batch(STARTERS.map((item) => db().prepare("INSERT OR IGNORE INTO products (title, retailer, url, category, msrp_cents, expected_resale_cents) VALUES (?, ?, ?, ?, ?, ?)").bind(...item)));
  const batchSize = 8;
  const batchCount = Math.ceil(SOURCES.length / batchSize);
  const batch = Math.floor(Date.now() / 1_800_000) % batchCount;
  const selectedSources = SOURCES.slice(batch * batchSize, batch * batchSize + batchSize);
  let discovered = 0; let sourcesChecked = 0; const sourceErrors: string[] = [];
  for (let i = 0; i < selectedSources.length; i += 6) {
    const results = await Promise.all(selectedSources.slice(i, i + 6).map(async (source) => {
      const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 9_000);
      try { const response = await fetchRetailerPage(source, controller.signal); return { source, products: discoverProductLinks(await response.text(), source) }; }
      catch { return { source, products: [] }; }
      finally { clearTimeout(timeout); }
    }));
    for (const result of results) {
      sourcesChecked++; if (!result.products.length) sourceErrors.push(new URL(result.source).hostname);
      for (const product of result.products) {
        const insert = await db().prepare("INSERT OR IGNORE INTO products (title, retailer, url, category, msrp_cents, expected_resale_cents) VALUES (?, ?, ?, ?, ?, ?)").bind(product.title, product.retailer, product.url, product.category, product.msrp_cents, product.expected_resale_cents).run();
        if (insert.meta.changes) discovered++;
        if (product.msrp_cents > 0) await db().prepare("UPDATE products SET msrp_cents = CASE WHEN msrp_cents = 0 THEN ? ELSE msrp_cents END, updated_at = CURRENT_TIMESTAMP WHERE url = ?").bind(product.msrp_cents, product.url).run();
        if (product.price_cents != null) {
          const saved = await db().prepare("SELECT id FROM products WHERE url = ?").bind(product.url).first<{ id: number }>();
          if (saved) await db().prepare("INSERT INTO observations (product_id, price_cents, currency, availability, condition, confidence, error, source_type, source_url) VALUES (?, ?, 'USD', ?, 'NewCondition', 82, NULL, 'retailer-listing', ?)").bind(saved.id, product.price_cents, product.availability, result.source).run();
        }
      }
    }
  }
  return Response.json({ discovered, batch: batch + 1, batches: batchCount, sources_checked: sourcesChecked, sources_without_results: [...new Set(sourceErrors)].length, categories: [...new Set(SEARCHES.map(([, query]) => query))].length, at: new Date().toISOString() });
}
