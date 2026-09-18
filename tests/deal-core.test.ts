import test from "node:test";
import assert from "node:assert/strict";
import { alertEventKey, classifyStock, extractPromo, normalizeProduct, relevanceScore } from "../lib/deal-core.ts";

test("explicit out-of-stock wins over add-to-cart text", () => {
  const result = classifyStock("Add to cart — currently unavailable — out of stock", false);
  assert.equal(result.status, "OUT_OF_STOCK");
  assert.ok(result.confidence >= 90);
});

test("stock taxonomy distinguishes low stock, preorder, backorder, and unknown", () => {
  assert.equal(classifyStock("Only 2 left", false).status, "LOW_STOCK");
  assert.equal(classifyStock("Pre-order today", false).status, "PREORDER");
  assert.equal(classifyStock("Ships on backorder", false).status, "BACKORDER");
  assert.equal(classifyStock("Great graphics card", false).status, "UNKNOWN");
});

test("RTX 5080 matching excludes 5070, 5080 Ti, laptops, and accessories", () => {
  const exact = relevanceScore("NVIDIA GeForce RTX 5080 Founders Edition", "RTX 5080");
  assert.ok(exact >= 45);
  assert.equal(relevanceScore("GeForce RTX 5070 graphics card", "RTX 5080"), 0);
  assert.equal(relevanceScore("RTX 5080 Ti graphics card", "RTX 5080"), 0);
  assert.equal(relevanceScore("RTX 5080 gaming laptop", "RTX 5080"), 0);
  assert.equal(relevanceScore("ASUS RTX 5080 TUF OC", "RTX 5080 FE"), 0);
  assert.equal(relevanceScore("RTX 5080 water block", "RTX 5080"), 0);
});

test("normalization flags misleading accessory listings", () => {
  assert.equal(normalizeProduct("RTX 5080 empty box only").suspicious, true);
  assert.equal(normalizeProduct("ASUS RTX 5080 TUF OC").suspicious, false);
});

test("promo extraction rejects expired codes and keeps reported active codes", () => {
  assert.equal(extractPromo("Promo code SAVE20 has expired"), null);
  assert.equal(extractPromo("Use code GAME20. Ends September 30, 2026")?.code, "GAME20");
});

test("alert keys deduplicate the same state transition", () => {
  assert.equal(alertEventKey(4, 8, "RESTOCK", "IN_STOCK"), alertEventKey(4, 8, "RESTOCK", "IN_STOCK"));
  assert.notEqual(alertEventKey(4, 8, "PRICE_DROP", "99999"), alertEventKey(4, 8, "PRICE_DROP", "94999"));
});
