import { db } from "@/lib/deals";
const starters: Array<[string, string, string, string, number, number]> = [
  ["NVIDIA GeForce RTX 5080 Founders Edition", "Best Buy", "https://www.bestbuy.com/product/nvidia-geforce-rtx-5080-16gb-gddr7-founders-edition-graphics-card-dark-gun-metal/J3GWYHGP8C", "GPU", 99999, 145000],
  ["NVIDIA GeForce RTX 5080 Founders Edition", "NVIDIA", "https://marketplace.nvidia.com/en-us/consumer/graphics-cards/nvidia-geforce-rtx-5080/", "GPU", 99999, 145000],
  ["NVIDIA GeForce RTX 5090 Founders Edition", "Best Buy", "https://www.bestbuy.com/product/nvidia-geforce-rtx-5090-32gb-gddr7-founders-edition-graphics-card-dark-gun-metal/J3GWYH2KXL", "GPU", 199999, 275000],
];
export async function POST() { await db().batch(starters.map((item) => db().prepare("INSERT OR IGNORE INTO products (title, retailer, url, category, msrp_cents, expected_resale_cents) VALUES (?, ?, ?, ?, ?, ?)").bind(...item))); return Response.json({ added: starters.length }); }
