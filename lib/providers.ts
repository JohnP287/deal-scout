export type ProviderDefinition = {
  id: string;
  name: string;
  domains: string[];
  reputation: number;
  officialMsrp: boolean;
  discoveryUrls: string[];
};

export const PROVIDERS: ProviderDefinition[] = [
  { id: "best-buy", name: "Best Buy", domains: ["bestbuy.com"], reputation: 96, officialMsrp: false, discoveryUrls: ["https://www.bestbuy.com/site/all-computers-tablets-on-sale/pc-gaming-on-sale/pcmcat1720705199469.c?id=pcmcat1720705199469", "https://www.bestbuy.com/site/searchpage.jsp?st=gaming+monitor", "https://www.bestbuy.com/site/searchpage.jsp?st=graphics+card"] },
  { id: "micro-center", name: "Micro Center", domains: ["microcenter.com"], reputation: 96, officialMsrp: false, discoveryUrls: ["https://www.microcenter.com/search/search_results.aspx?Ntt=gaming&storeid=061", "https://www.microcenter.com/search/search_results.aspx?Ntt=graphics%20card&storeid=061"] },
  { id: "newegg", name: "Newegg", domains: ["newegg.com"], reputation: 91, officialMsrp: false, discoveryUrls: ["https://www.newegg.com/Newegg-Deals/EventSaleStore/ID-9447", "https://www.newegg.com/p/pl?d=gaming+monitor", "https://www.newegg.com/p/pl?d=graphics+card"] },
  { id: "amazon", name: "Amazon", domains: ["amazon.com"], reputation: 88, officialMsrp: false, discoveryUrls: [] },
  { id: "walmart", name: "Walmart", domains: ["walmart.com"], reputation: 86, officialMsrp: false, discoveryUrls: ["https://www.walmart.com/search?q=gaming+tech+deals"] },
  { id: "target", name: "Target", domains: ["target.com"], reputation: 90, officialMsrp: false, discoveryUrls: ["https://www.target.com/s?searchTerm=gaming+controller"] },
  { id: "costco", name: "Costco", domains: ["costco.com"], reputation: 95, officialMsrp: false, discoveryUrls: ["https://www.costco.com/pc-gaming.html", "https://www.costco.com/gaming-monitors.html"] },
  { id: "game-stop", name: "GameStop", domains: ["gamestop.com"], reputation: 88, officialMsrp: false, discoveryUrls: ["https://www.gamestop.com/search/?q=limited%20edition%20controller"] },
  { id: "bh", name: "B&H Photo", domains: ["bhphotovideo.com"], reputation: 95, officialMsrp: false, discoveryUrls: ["https://www.bhphotovideo.com/c/search?q=gaming%20monitor", "https://www.bhphotovideo.com/c/search?q=graphics%20card"] },
  { id: "adorama", name: "Adorama", domains: ["adorama.com"], reputation: 92, officialMsrp: false, discoveryUrls: ["https://www.adorama.com/l/?searchinfo=gaming%20monitor"] },
  { id: "antonline", name: "Antonline", domains: ["antonline.com"], reputation: 84, officialMsrp: false, discoveryUrls: ["https://www.antonline.com/nvidia/geforce-rtx50/laptops", "https://www.antonline.com/Nvidia/G-Sync-monitors"] },
  { id: "central-computers", name: "Central Computers", domains: ["centralcomputer.com"], reputation: 88, officialMsrp: false, discoveryUrls: ["https://www.centralcomputer.com/all-products/hardware/video-cards.html"] },
  { id: "abt", name: "Abt", domains: ["abt.com"], reputation: 91, officialMsrp: false, discoveryUrls: ["https://www.abt.com/Computer-Monitors/c/442.html"] },
  { id: "woot", name: "Woot", domains: ["woot.com"], reputation: 84, officialMsrp: false, discoveryUrls: ["https://www.woot.com/category/computers"] },
  { id: "nvidia", name: "NVIDIA", domains: ["nvidia.com"], reputation: 100, officialMsrp: true, discoveryUrls: ["https://marketplace.nvidia.com/en-us/consumer/graphics-cards/"] },
  { id: "amd", name: "AMD", domains: ["amd.com"], reputation: 100, officialMsrp: true, discoveryUrls: ["https://www.amd.com/en/direct-buy/us"] },
  { id: "dell", name: "Dell / Alienware", domains: ["dell.com"], reputation: 98, officialMsrp: true, discoveryUrls: ["https://www.dell.com/en-us/shop/deals/electronics-accessories-deals", "https://www.dell.com/en-us/shop/deals/gaming-deals"] },
  { id: "hp", name: "HP / OMEN", domains: ["hp.com"], reputation: 98, officialMsrp: true, discoveryUrls: ["https://www.hp.com/us-en/shop/slp/weekly-deals/gaming"] },
  { id: "lenovo", name: "Lenovo", domains: ["lenovo.com"], reputation: 98, officialMsrp: true, discoveryUrls: ["https://www.lenovo.com/us/en/d/deals/gaming-deals/"] },
  { id: "asus", name: "ASUS", domains: ["asus.com"], reputation: 98, officialMsrp: true, discoveryUrls: ["https://shop.asus.com/us/deals.html"] },
  { id: "acer", name: "Acer", domains: ["acer.com"], reputation: 97, officialMsrp: true, discoveryUrls: ["https://store.acer.com/en-us/sale/monitor-sale"] },
  { id: "msi", name: "MSI", domains: ["msi.com"], reputation: 97, officialMsrp: true, discoveryUrls: ["https://us-store.msi.com/Sale"] },
  { id: "gigabyte", name: "Gigabyte", domains: ["gigabyte.com"], reputation: 97, officialMsrp: true, discoveryUrls: ["https://store.gigabyte.us/"] },
  { id: "pny", name: "PNY", domains: ["pny.com"], reputation: 96, officialMsrp: true, discoveryUrls: ["https://www.pny.com/promotions"] },
  { id: "samsung", name: "Samsung", domains: ["samsung.com"], reputation: 98, officialMsrp: true, discoveryUrls: ["https://www.samsung.com/us/computing/monitors/gaming/"] },
  { id: "lg", name: "LG", domains: ["lg.com"], reputation: 98, officialMsrp: true, discoveryUrls: ["https://www.lg.com/us/promotions"] },
  { id: "sony", name: "Sony", domains: ["sony.com"], reputation: 98, officialMsrp: true, discoveryUrls: ["https://electronics.sony.com/sale/c/all-sale"] },
  { id: "corsair", name: "Corsair", domains: ["corsair.com"], reputation: 97, officialMsrp: true, discoveryUrls: ["https://www.corsair.com/us/en/c/special-offers"] },
  { id: "logitech", name: "Logitech G", domains: ["logitechg.com"], reputation: 97, officialMsrp: true, discoveryUrls: ["https://www.logitechg.com/en-us/promotions.html"] },
  { id: "razer", name: "Razer", domains: ["razer.com"], reputation: 97, officialMsrp: true, discoveryUrls: ["https://www.razer.com/campaigns/sales"] },
  { id: "steelseries", name: "SteelSeries", domains: ["steelseries.com"], reputation: 97, officialMsrp: true, discoveryUrls: ["https://steelseries.com/deals"] },
  { id: "hyperx", name: "HyperX", domains: ["hyperx.com"], reputation: 97, officialMsrp: true, discoveryUrls: ["https://hyperx.com/collections/sale"] },
  { id: "elgato", name: "Elgato", domains: ["elgato.com"], reputation: 97, officialMsrp: true, discoveryUrls: ["https://www.elgato.com/us/en/s/sale"] },
  { id: "nzxt", name: "NZXT", domains: ["nzxt.com"], reputation: 96, officialMsrp: true, discoveryUrls: ["https://nzxt.com/collection/sale"] },
  { id: "viewsonic", name: "ViewSonic", domains: ["viewsonic.com"], reputation: 96, officialMsrp: true, discoveryUrls: ["https://www.viewsonic.com/us/products/shop/monitors/gaming.html"] },
  { id: "microsoft", name: "Microsoft Store", domains: ["microsoft.com"], reputation: 99, officialMsrp: true, discoveryUrls: ["https://www.microsoft.com/en-us/store/b/sale"] },
  { id: "playstation", name: "PlayStation Direct", domains: ["playstation.com"], reputation: 99, officialMsrp: true, discoveryUrls: ["https://direct.playstation.com/en-us/deals"] },
  { id: "nintendo", name: "Nintendo", domains: ["nintendo.com"], reputation: 99, officialMsrp: true, discoveryUrls: ["https://www.nintendo.com/us/store/sales-and-deals/"] },
  { id: "meta", name: "Meta", domains: ["meta.com"], reputation: 98, officialMsrp: true, discoveryUrls: ["https://www.meta.com/quest/"] },
  { id: "monoprice", name: "Monoprice", domains: ["monoprice.com"], reputation: 92, officialMsrp: true, discoveryUrls: ["https://www.monoprice.com/category/computers-&-gaming"] },
  { id: "zotac", name: "ZOTAC", domains: ["zotacstore.com", "zotac.com"], reputation: 96, officialMsrp: true, discoveryUrls: ["https://www.zotacstore.com/us/graphics-cards"] },
];

export function providerForUrl(value: string) {
  const host = new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  return PROVIDERS.find((provider) => provider.domains.some((domain) => host === domain || host.endsWith(`.${domain}`))) ?? null;
}

export const APPROVED_SOURCE_COUNT = PROVIDERS.length;
export const DISCOVERY_SOURCES = PROVIDERS.flatMap((provider) => provider.discoveryUrls.map((url) => ({ provider, url })));
