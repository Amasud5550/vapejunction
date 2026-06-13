# Vape Junction — site, order boards, inventory & POS

One app, four jobs:

| Who | What they see |
|---|---|
| Customers | Age gate (19+) → pick Thorold or Welland → browse that store's stock → place a pickup order |
| Store tablet | **Staff → Order board**: live tickets for that store, chime on new orders, print 72mm tickets |
| Staff | **Inventory**: per-store stock, barcode scanning (USB + camera), Clover import. **POS**: ring up walk-in sales (cash or Clover terminal) |
| Admin | **Admin** tab: add/remove staff, set PINs, roles, and store assignment |

Default admin PIN: **1919** — change it in the Admin tab right after first sign-in.

## Deploy

```bash
npm install
npm i -g netlify-cli          # if you don't have it
netlify login
netlify init                  # link/create the site
netlify db init               # provisions Neon Postgres + sets NETLIFY_DATABASE_URL

# create the tables (migration is already generated in netlify/database/migrations)
netlify env:get NETLIFY_DATABASE_URL   # or pull env with: netlify env:list
NETLIFY_DATABASE_URL="postgres://..." npm run db:migrate

netlify deploy --prod
```

Local dev: `npm run dev` (runs the function + static site together at localhost:8888).

The first request to `/api/bootstrap` seeds the two stores, the Admin user, and a sample catalog — replace the samples in the Inventory tab or via Clover import.

If you change `db/schema.ts`: `npm run db:generate` then `npm run db:migrate`.

## Clover setup

Two integrations are built in, configured per store via environment variables
(Netlify → Site settings → Environment variables; see `.env.example`):

```
CLOVER_ENV=sandbox            # or "production" when live
CLOVER_MERCHANT_ID_THOROLD=   CLOVER_API_TOKEN_THOROLD=   CLOVER_DEVICE_ID_THOROLD=
CLOVER_MERCHANT_ID_WELLAND=   CLOVER_API_TOKEN_WELLAND=   CLOVER_DEVICE_ID_WELLAND=
```

**1. Card payments at the POS** — uses Clover's REST Pay Display API. When staff
tap "Card — Clover terminal", the total is pushed to that store's Clover device;
the customer taps/inserts there; the sale is recorded with the Clover payment ID
on success. Requirements:
- The **Cloud Pay Display** app installed and running on the Clover device
- The device serial/ID in `CLOVER_DEVICE_ID_*`
- An API token with payments permission (from your Clover developer dashboard)

**2. Inventory import** — Inventory tab → "Import from Clover" pulls the
merchant's item list (name, price, SKU/UPC, stock count) into the catalog for
the working store. Imported items arrive **inactive** so they don't appear on
the website until you review and switch them on. Re-running updates prices and
counts on already-linked items.

Test in `CLOVER_ENV=sandbox` with a Clover sandbox merchant before going live,
and verify the endpoints against current Clover docs (docs.clover.com) — their
API surface changes periodically. If a Clover payment fails or the terminal is
unreachable, the sale is not recorded and stock is restored.

## How data flows

- Frontend (`public/index.html`) calls `/api/*` (Netlify Function in
  `netlify/functions/api.ts`) backed by Neon Postgres via Drizzle.
- Online orders and POS sales share one `orders` table (`type: pickup | pos`)
  and one numbering sequence per store (VJ-T-0001, VJ-W-0001…), so reporting is
  in one place. POS sales also count in the "Today" totals on the POS screen.
- Stock is decremented atomically with a `qty >= n` guard — two people can't
  buy the last unit twice. Cancelling a pickup order restores stock.
- Staff sessions are PIN + bearer token. PINs are a convenience for in-store
  devices, not strong auth — don't expose the staff URL pattern publicly and
  consider adding Netlify password protection or IP rules on top if needed.

## Ontario compliance notes (built in, but verify)

19+ age gate, Health Canada nicotine warning masthead, ID-at-pickup language,
no health/cessation claims, 20 mg/mL maximum-nicotine note, text-only product
display. The Smoke-Free Ontario Act's display/promotion rules for vapour
products online are strict and enforcement is local — confirm with Niagara
Region Public Health and/or your lawyer that the online catalog is permitted
under each store's specialty vape store registration before launch.
