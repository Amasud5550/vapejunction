# Vape Junction — Web App

Full-stack web application for Vape Junction (Thorold & Welland, Ontario).  
Built with **React + Vite + Supabase**, deployed via **Cloudflare Pages**.

---

## Features

| Area | What's included |
|---|---|
| **Customer Storefront** | Ontario AGCO-compliant 19+ age gate, product catalogue, cart, checkout, order confirmation |
| **Order Display** | Real-time tablet/print view for in-store order fulfilment |
| **POS** | Barcode scanner support, cash/card payment, change calculator, receipt printing |
| **Inventory** | Per-location stock, barcode scan receiving, CSV export, low-stock alerts |
| **Admin Portal** | Sales dashboard, product CRUD, staff management |
| **2 Locations** | Thorold & Welland — fully separate inventory per location |

---

## Tech Stack

- **Frontend:** React 18 + Vite + Tailwind CSS
- **Backend / DB:** Supabase (PostgreSQL + Realtime + Row Level Security)
- **Hosting:** Cloudflare Pages
- **Auth:** Supabase Auth (email) + 4-digit PIN for quick POS login

---

## 1. Supabase Setup

### 1a. Create a project
1. Go to [supabase.com](https://supabase.com) and create a new project.
2. Note your **Project URL** and **anon public key** (Settings → API).

### 1b. Run migrations
In the Supabase dashboard → **SQL Editor**, run these files in order:

```
supabase/migrations/001_initial_schema.sql
supabase/migrations/002_seed_data.sql
```

This creates all tables, views, functions, RLS policies, and seeds:
- 2 locations (Thorold + Welland)
- 8 product categories
- ~15 sample products with inventory

### 1c. Create your first admin user
In SQL Editor:
```sql
-- After creating a user via Supabase Auth dashboard:
UPDATE admin_users SET role = 'owner' WHERE email = 'your@email.com';
```

Or insert directly:
```sql
INSERT INTO admin_users (email, name, pin, role, location_id, is_active)
VALUES ('manager@vapejunction.ca', 'Manager Name', '1234', 'manager',
  (SELECT id FROM locations WHERE slug = 'thorold'), true);
```

---

## 2. Local Development

### 2a. Install dependencies
```bash
npm install
```

### 2b. Environment variables
```bash
cp .env.example .env
```

Edit `.env`:
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
VITE_HST_RATE=0.13
```

### 2c. Run dev server
```bash
npm run dev
```

App runs at `http://localhost:5173`

---

## 3. Cloudflare Pages Deployment

### 3a. Push to GitHub
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/vapejunction.git
git push -u origin main
```

### 3b. Connect to Cloudflare Pages
1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com) → Pages → Create a project
2. Connect your GitHub repo
3. Set build settings:
   - **Framework preset:** Vite
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`

### 3c. Add environment variables in Cloudflare
Under Pages → Settings → Environment Variables, add:
```
VITE_SUPABASE_URL = https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY = your-anon-key-here
VITE_HST_RATE = 0.13
```

### 3d. SPA Routing
The `public/_redirects` file is already included — it routes all 404s to `index.html` so React Router works correctly.

---

## 4. App Routes

| URL | Page | Access |
|---|---|---|
| `/` | Customer storefront | Public (19+ age gate) |
| `/products/:id` | Product detail | Public |
| `/cart` | Shopping cart | Public |
| `/checkout` | Checkout form | Public |
| `/order-confirmation/:id` | Order receipt | Public |
| `/staff/login` | Staff PIN login | Public |
| `/staff/orders` | Real-time order display | Staff+ |
| `/staff/pos` | Point of Sale | Staff+ |
| `/staff/inventory` | Inventory management | Staff+ |
| `/admin` | Admin dashboard | Manager+ |

---

## 5. Barcode Scanner Setup

The POS and Inventory pages support **any USB or Bluetooth HID barcode scanner** — no drivers needed.

- Scanners work by emulating keyboard input ending with `Enter`
- The app listens for fast keydown sequences (< 150ms between chars) and treats them as scanner input
- Scan a product barcode in POS to instantly add it to cart
- Scan in Inventory to look up or receive stock

**Recommended scanners:** Any Honeywell, Zebra, or generic USB/BT HID scanner.

---

## 6. Ontario AGCO Compliance

- **Age gate:** Customers must enter their date of birth. Under-19 visitors are blocked and logged.
- **Checkout:** Secondary DOB verification + checkbox acknowledgement required before order submission.
- **POS:** Staff manually toggle age-verified status per transaction.
- **All nicotine products** are flagged and display compliance notices throughout.
- Age verification events are logged to the `age_verification_log` table with timestamps and IP (where available).

> ⚠️ This app is a tool to assist compliance — store staff remain legally responsible for verifying ID at point of pickup/sale.

---

## 7. Printing

- **Order Display** (`/staff/orders`) has a **Print Order** button per order — opens the browser print dialog with print-optimized styles.
- **POS** has a **Print Receipt** button after each transaction.
- **Order Confirmation** page has a customer print button.

For dedicated receipt printing, connect a thermal printer (e.g. Epson TM-T88) to the tablet/PC and set it as the default printer in OS settings. The browser print dialog will pick it up.

---

## 8. Tablet Setup (Order Display)

For the in-store tablet:

1. Open `https://your-site.pages.dev/staff/login` in Chrome/Safari
2. Log in with staff PIN
3. Navigate to `/staff/orders`
4. The page auto-refreshes in real-time via Supabase Realtime — no manual refresh needed
5. Optionally use **Chrome → Add to Home Screen** to create a PWA-style shortcut

---

## 9. Database Schema Overview

```
locations          — Thorold + Welland store records
categories         — Product categories (Disposables, E-Liquids, etc.)
products           — Master product catalogue (shared across locations)
inventory          — Stock levels per product per location
inventory_transactions — All stock movements (receive, remove, sale, adjustment)
customers          — Customer records from online orders
orders             — Online orders with status tracking
order_items        — Line items for each order
pos_transactions   — In-store POS sales
pos_transaction_items — Line items for POS sales
admin_users        — Staff accounts with PIN and role
age_verification_log — AGCO compliance log
```

---

## 10. Staff Roles

| Role | Access |
|---|---|
| `staff` | POS, Order Display, Inventory (view/adjust own location) |
| `manager` | All staff features + Admin dashboard + All locations |
| `owner` | Full access including staff management |

---

## Project Structure

```
vapejunction/
├── public/
│   ├── _redirects          # Cloudflare SPA routing
│   ├── favicon.svg
│   └── logo.svg
├── src/
│   ├── components/
│   │   ├── customer/       # AgeGate, CustomerHeader, ProductCard
│   │   └── shared/         # StaffGuard, StaffNav
│   ├── context/            # Auth, Location, Cart providers
│   ├── pages/              # All page components
│   ├── App.jsx
│   ├── main.jsx
│   ├── index.css
│   └── supabaseClient.js
├── supabase/
│   └── migrations/
│       ├── 001_initial_schema.sql
│       └── 002_seed_data.sql
├── .env.example
├── package.json
├── vite.config.js
└── tailwind.config.js
```

---

## Support / Customization

- To add products: Admin portal → Products tab → Add Product
- To change HST rate: Update `VITE_HST_RATE` env variable
- To add staff: Admin portal → Staff tab → Add Staff Member
- To update store hours/info: Edit `src/pages/StoreFront.jsx` footer section
