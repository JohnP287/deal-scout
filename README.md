# DealScout

Open-source gaming deal intelligence. DealScout discovers offers across 41 approved retailer and manufacturer providers, verifies exact product pages, preserves price and stock history, compares prices only with an authoritative MSRP, merges duplicate offers, and calculates resale profit only when a recent sold-comp source exists.

## Accuracy model

- Product price, availability, condition and currency come from retailer JSON-LD when exposed.
- MSRP is accepted from a manufacturer-owned store page or entered with an official source; retailer crossed-out or “was” pricing is never treated as MSRP.
- Search pages are discovery-only. A listing cannot appear publicly until an exact product page or official feed confirms price and stock.
- Explicit out-of-stock evidence overrides page existence and generic purchase text. Inventory uses `IN_STOCK`, `LOW_STOCK`, `PREORDER`, `BACKORDER`, `COMING_SOON`, `OUT_OF_STOCK`, or `UNKNOWN`.
- Promo codes are stored as `REPORTED` until stronger validation is available; expired-code language is rejected.
- A failed refresh never erases the last successful observation. The prior data keeps its original timestamp and becomes `STALE`.
- Main-feed states are `LIVE`, `VERIFIED`, and `STALE`. Provider failures are isolated in diagnostics instead of becoming deal cards.
- Resale fees, net profit, and ROI remain unavailable unless the resale comp has a source and verification date.
- Alert events are generated only for meaningful state changes and deduplicated by watch, product, event, and value.

No scanner can literally cover every store or guarantee future value. Retailers can block automated requests or change markup. Add official APIs or licensed feeds for high-volume commercial use and comply with each retailer's terms.

## Run locally

```bash
pnpm install
pnpm run db:generate
pnpm run db:local
pnpm test
pnpm run build
```

Apply the generated D1 migration before starting the Worker. See the starter's D1 documentation for local Wrangler commands.

## 30-minute scheduling

The included GitHub Actions workflow calls the fixed DealScout `/api/scan` endpoint every 30 minutes. It uses GitHub Actions OIDC: the site verifies GitHub's signature plus the repository, branch, audience, event type, and token lifetime. No reusable scheduler secret is required. Forks should replace the fixed URL and expected repository identity with their own verified deployment details.

## Adding retailer support

Providers live in `lib/providers.ts`; each has domains, reputation, MSRP authority and discovery URLs. The scanner accepts only HTTPS URLs from this registry, validates every redirect, applies timeouts and exponential backoff, and extracts standard `Product` / `Offer` JSON-LD. Add retailer-specific adapters when a store does not expose structured data. Prefer official APIs and licensed feeds wherever possible.

## Diagnostics and alerts

- `/api/diagnostics` reports safe provider-health totals, failures, latency, discoveries and successful verification activity.
- `/api/watchlists` stores product, category or query watches with price, discount, retailer and event constraints.
- `/api/alerts` returns deduplicated in-app events. Email, SMS and push delivery are intentionally not claimed until a delivery provider is configured.

## License

MIT
