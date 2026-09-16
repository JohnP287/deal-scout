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

The included GitHub Actions workflow calls `/api/scan` every 30 minutes. Configure repository variable `DEALSCOUT_URL` and secret `DEALSCOUT_CRON_SECRET`, then set the same `CRON_SECRET` in the hosted environment.

## Adding retailer support

The generic scanner accepts any HTTP(S) product URL and extracts standard `Product` / `Offer` JSON-LD. Retailer-specific adapters can be added in `lib/deals.ts` when a store does not expose standard structured data. Prefer official APIs and feeds wherever possible.

## License

MIT
