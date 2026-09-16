# DealScout

Open-source resale deal intelligence for new, sealed products. DealScout checks exact retailer product pages, keeps a price/stock history, compares current pricing with a manually verified MSRP, and estimates net resale profit after tax and marketplace fees.

## Accuracy model

- Product price, availability, condition and currency come from retailer JSON-LD when exposed.
- MSRP is entered separately and is never inferred from crossed-out or “was” pricing.
- Failed and blocked checks remain visible instead of being treated as out of stock.
- A check is considered fresh for 45 minutes.
- Default profit math assumes 6% purchase tax and 13.25% marketplace fees.

No scanner can literally cover every store or guarantee future value. Retailers can block automated requests or change markup. Add official APIs or licensed feeds for high-volume commercial use and comply with each retailer's terms.

## Run locally

```bash
pnpm install
pnpm run db:generate
pnpm run build
```

Apply the generated D1 migration before starting the Worker. See the starter's D1 documentation for local Wrangler commands.

## 30-minute scheduling

The included GitHub Actions workflow calls the fixed DealScout `/api/scan` endpoint every 30 minutes. It uses GitHub Actions OIDC: the site verifies GitHub's signature plus the repository, branch, audience, event type, and token lifetime. No reusable scheduler secret is required. Forks should replace the fixed URL and expected repository identity with their own verified deployment details.

## Adding retailer support

The scanner accepts HTTPS product pages from an explicit retailer allowlist and validates every redirect before extracting standard `Product` / `Offer` JSON-LD. This prevents the scanner from being used to request private or arbitrary network targets. Retailer-specific adapters can be added in `lib/deals.ts` when a store does not expose standard structured data. Prefer official APIs and feeds wherever possible.

## License

MIT
