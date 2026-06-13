import type { Config } from "@netlify/functions";
import { drizzle } from "drizzle-orm/neon-http";
import { eq, and, desc, sql, inArray, gte } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  stores, users, sessions, products, inventory, orders, orderItems,
} from "../../db/schema.js";

const db = drizzle(process.env.NETLIFY_DATABASE_URL!);
const TAX = 0.13;

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
const fail = (error: string, status = 400) => json({ error }, status);

type AuthedUser = typeof users.$inferSelect;

async function authUser(req: Request): Promise<AuthedUser | null> {
  const h = req.headers.get("authorization") || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!token) return null;
  const rows = await db
    .select({ u: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.token, token));
  return rows[0]?.u ?? null;
}

function num(v: string | number | null | undefined): number {
  return Number(v ?? 0);
}

async function productOut() {
  const prods = await db.select().from(products).orderBy(products.id);
  const inv = await db.select().from(inventory);
  return prods.map((p) => {
    const m: Record<string, number> = {};
    inv.filter((i) => i.productId === p.id).forEach((i) => (m[i.storeId] = i.qty));
    return { ...p, price: num(p.price), inv: m };
  });
}

async function ordersOut(rows: (typeof orders.$inferSelect)[]) {
  if (!rows.length) return [];
  const items = await db.select().from(orderItems).where(inArray(orderItems.orderId, rows.map((o) => o.id)));
  return rows.map((o) => ({
    ...o,
    subtotal: num(o.subtotal), tax: num(o.tax), total: num(o.total),
    items: items.filter((i) => i.orderId === o.id).map((i) => ({ ...i, price: num(i.price) })),
  }));
}

/** Conditionally decrement stock; if any line lacks stock, roll back the lines already taken. */
async function takeStock(storeId: string, lines: { productId: number; qty: number }[]) {
  const taken: { productId: number; qty: number }[] = [];
  for (const l of lines) {
    const res = await db.update(inventory)
      .set({ qty: sql`${inventory.qty} - ${l.qty}` })
      .where(and(
        eq(inventory.productId, l.productId),
        eq(inventory.storeId, storeId),
        gte(inventory.qty, l.qty),
      ))
      .returning({ productId: inventory.productId });
    if (!res.length) {
      await putBackStock(storeId, taken);
      return { ok: false as const, productId: l.productId };
    }
    taken.push(l);
  }
  return { ok: true as const };
}
async function putBackStock(storeId: string, lines: { productId: number; qty: number }[]) {
  for (const l of lines) {
    await db.update(inventory)
      .set({ qty: sql`${inventory.qty} + ${l.qty}` })
      .where(and(eq(inventory.productId, l.productId), eq(inventory.storeId, storeId)));
  }
}

async function nextOrderNumber(storeId: string) {
  const [s] = await db.select().from(stores).where(eq(stores.id, storeId));
  const [{ c }] = await db.select({ c: sql<number>`count(*)` }).from(orders).where(eq(orders.storeId, storeId));
  return `VJ-${s?.tag ?? "X"}-${String(Number(c) + 1).padStart(4, "0")}`;
}

/* ------------------------------------------------------------------ */
/* first-run seed                                                      */
/* ------------------------------------------------------------------ */
const SEED_STORES = [
  { id: "thorold", name: "Thorold", tag: "T", address: "3250 Schmon Pkwy #12 (beside Shell gas station), Thorold, ON L2V 4Y6", phone: "(519) 241-6128", hours: "Open 24 hours" },
  { id: "welland", name: "Welland", tag: "W", address: "456 First Ave, Welland, ON L3C 6A7", phone: "(289) 820-4832", hours: "Open daily until 11 p.m." },
];
const SEED_PRODUCTS: Array<[string, string, string, number, string, string, number, number]> = [
  // sku, name, category, price, nicotine, description, qtyThorold, qtyWelland
  ["DEV-001", "Starter Pod Device", "Devices", 24.99, "—", "Compact refillable pod system. USB-C charging, draw-activated.", 18, 12],
  ["DEV-002", "Mod Kit 80W", "Devices", 64.99, "—", "Adjustable wattage mod with sub-ohm tank. Single 18650 (not included).", 7, 4],
  ["POD-101", "Replacement Pods (4-pack) — 0.8Ω", "Pods & Coils", 15.99, "—", "Fits Starter Pod Device. 0.8 ohm mesh.", 32, 20],
  ["COIL-201", "Mesh Coils (5-pack) — 0.4Ω", "Pods & Coils", 18.99, "—", "For 80W sub-ohm tank.", 21, 15],
  ["EL-301", "E-Liquid 30mL — Tobacco", "E-Liquid", 19.99, "20 mg/mL salt", "Classic tobacco profile. 50/50 VG/PG.", 25, 18],
  ["EL-302", "E-Liquid 30mL — Mint", "E-Liquid", 19.99, "20 mg/mL salt", "Cool mint. 50/50 VG/PG.", 25, 22],
  ["EL-303", "E-Liquid 30mL — Mango", "E-Liquid", 19.99, "12 mg/mL salt", "Mango profile. 50/50 VG/PG.", 14, 9],
  ["DSP-401", "Disposable — Tobacco (2 mL)", "Disposables", 12.99, "20 mg/mL", "Single-use device, approx. 600 puffs.", 40, 33],
  ["DSP-402", "Disposable — Mint (2 mL)", "Disposables", 12.99, "20 mg/mL", "Single-use device, approx. 600 puffs.", 36, 28],
  ["ACC-501", "18650 Battery (single)", "Accessories", 14.99, "—", "High-drain rechargeable cell with case.", 16, 10],
  ["ACC-502", "USB-C Charging Cable", "Accessories", 6.99, "—", "1 m braided cable.", 30, 24],
];

async function seedIfEmpty() {
  const existing = await db.select().from(stores);
  if (existing.length) return;
  await db.insert(stores).values(SEED_STORES);
  await db.insert(users).values({ name: "Admin", pin: "1919", role: "admin", store: "all" });
  for (const [sku, name, category, price, nicotine, description, qT, qW] of SEED_PRODUCTS) {
    const [p] = await db.insert(products)
      .values({ sku, name, category, price: price.toFixed(2), nicotine, description, active: true })
      .returning();
    await db.insert(inventory).values([
      { productId: p.id, storeId: "thorold", qty: qT },
      { productId: p.id, storeId: "welland", qty: qW },
    ]);
  }
}

/* ------------------------------------------------------------------ */
/* Clover                                                              */
/* ------------------------------------------------------------------ */
function cloverCfg(storeId: string) {
  const S = storeId.toUpperCase();
  const env = (process.env.CLOVER_ENV || "sandbox").toLowerCase();
  const base = env === "production" ? "https://api.clover.com" : "https://apisandbox.dev.clover.com";
  return {
    base,
    merchantId: process.env[`CLOVER_MERCHANT_ID_${S}`],
    apiToken: process.env[`CLOVER_API_TOKEN_${S}`],
    deviceId: process.env[`CLOVER_DEVICE_ID_${S}`],
  };
}

/** Send a payment to the store's Clover device via REST Pay Display.
 *  Requires the "Cloud Pay Display" app running on the device and an
 *  OAuth/API token with payments permission. */
async function cloverCharge(storeId: string, amountCents: number, externalId: string) {
  const c = cloverCfg(storeId);
  if (!c.merchantId || !c.apiToken || !c.deviceId) {
    throw new Error("Clover isn't configured for this store yet (set the CLOVER_* environment variables).");
  }
  const res = await fetch(`${c.base}/connect/v1/payments`, {
    method: "POST",
    headers: {
      "authorization": `Bearer ${c.apiToken}`,
      "content-type": "application/json",
      "x-clover-device-id": c.deviceId,
      "x-pos-id": "VapeJunctionPOS",
      "idempotency-key": externalId,
    },
    body: JSON.stringify({ amount: amountCents, final: true, capture: true, externalPaymentId: externalId }),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Clover payment failed (${res.status}): ${data?.message || data?.error || "see device"}`);
  }
  return data; // contains payment details incl. id
}

/** Pull the merchant's Clover inventory into our catalog (per store). */
async function cloverImport(storeId: string) {
  const c = cloverCfg(storeId);
  if (!c.merchantId || !c.apiToken) {
    throw new Error("Clover isn't configured for this store yet (set the CLOVER_* environment variables).");
  }
  let offset = 0, created = 0, updated = 0;
  for (;;) {
    const res = await fetch(
      `${c.base}/v3/merchants/${c.merchantId}/items?limit=100&offset=${offset}&expand=itemStock`,
      { headers: { authorization: `Bearer ${c.apiToken}` } },
    );
    if (!res.ok) throw new Error(`Clover inventory fetch failed (${res.status}).`);
    const data: any = await res.json();
    const els: any[] = data.elements || [];
    for (const it of els) {
      const price = ((it.price ?? 0) / 100).toFixed(2);
      const fields = {
        name: it.name || "Clover item",
        sku: it.sku || it.code || `CLV-${String(it.id).slice(0, 6)}`,
        barcode: it.code || "",
        price,
      };
      const [existing] = await db.select().from(products).where(eq(products.cloverItemId, it.id));
      let pid: number;
      if (existing) {
        await db.update(products).set(fields).where(eq(products.id, existing.id));
        pid = existing.id; updated++;
      } else {
        const [p] = await db.insert(products)
          .values({ ...fields, category: "Imported", active: false, cloverItemId: it.id })
          .returning();
        pid = p.id; created++;
        await db.insert(inventory).values([
          { productId: pid, storeId: "thorold", qty: 0 },
          { productId: pid, storeId: "welland", qty: 0 },
        ]).onConflictDoNothing();
      }
      const qty = it.itemStock?.quantity;
      if (typeof qty === "number") {
        await db.insert(inventory).values({ productId: pid, storeId, qty: Math.max(0, Math.round(qty)) })
          .onConflictDoUpdate({
            target: [inventory.productId, inventory.storeId],
            set: { qty: Math.max(0, Math.round(qty)) },
          });
      }
    }
    if (els.length < 100) break;
    offset += 100;
  }
  return { created, updated };
}

/* ------------------------------------------------------------------ */
/* router                                                              */
/* ------------------------------------------------------------------ */
export default async (req: Request) => {
  const url = new URL(req.url);
  const seg = url.pathname.replace(/^\/api\/?/, "").replace(/\/$/, "").split("/");
  const route = seg[0] || "";
  const id = seg[1];
  const method = req.method.toUpperCase();
  const body = method === "GET" || method === "DELETE" ? {} : await req.json().catch(() => ({}));

  try {
    /* ---------- public ---------- */
    if (route === "bootstrap" && method === "GET") {
      await seedIfEmpty();
      const st = await db.select().from(stores);
      return json({ stores: st, products: await productOut() });
    }

    if (route === "login" && method === "POST") {
      const pin = String(body.pin || "");
      const [u] = pin ? await db.select().from(users).where(eq(users.pin, pin)) : [];
      if (!u) return fail("PIN not recognized.", 401);
      const token = randomUUID();
      await db.insert(sessions).values({ token, userId: u.id });
      return json({ token, user: { id: u.id, name: u.name, role: u.role, store: u.store } });
    }

    if (route === "orders" && method === "POST") {
      // customer pickup order (public)
      const storeId = String(body.store || "");
      const [st] = await db.select().from(stores).where(eq(stores.id, storeId));
      if (!st) return fail("Unknown store.");
      const name = String(body.name || "").trim();
      const phone = String(body.phone || "").trim();
      if (!name || !phone) return fail("Name and phone are required.");
      if (!body.ageConfirmed) return fail("You must confirm you are 19+.");
      const lines: { productId: number; qty: number }[] = (body.items || [])
        .map((i: any) => ({ productId: Number(i.productId), qty: Math.max(1, Number(i.qty) || 1) }));
      if (!lines.length) return fail("Cart is empty.");

      const prods = await db.select().from(products)
        .where(inArray(products.id, lines.map((l) => l.productId)));
      if (prods.length !== lines.length) return fail("One or more products no longer exist.");

      const stockRes = await takeStock(storeId, lines);
      if (!stockRes.ok) {
        const p = prods.find((x) => x.id === stockRes.productId);
        return fail(`Sorry — "${p?.name}" just went out of stock at ${st.name}. Please adjust your cart.`, 409);
      }

      const subtotal = lines.reduce((a, l) => a + num(prods.find((p) => p.id === l.productId)!.price) * l.qty, 0);
      const tax = subtotal * TAX;
      const [order] = await db.insert(orders).values({
        number: await nextOrderNumber(storeId),
        storeId, type: "pickup", status: "NEW",
        customerName: name, phone,
        email: String(body.email || "").trim(), notes: String(body.notes || "").trim(),
        subtotal: subtotal.toFixed(2), tax: tax.toFixed(2), total: (subtotal + tax).toFixed(2),
      }).returning();
      await db.insert(orderItems).values(lines.map((l) => {
        const p = prods.find((x) => x.id === l.productId)!;
        return { orderId: order.id, productId: p.id, name: p.name, price: p.price, qty: l.qty };
      }));
      return json({ order: (await ordersOut([order]))[0] });
    }

    /* ---------- everything below requires a signed-in staff user ---------- */
    const user = await authUser(req);
    if (!user) return fail("Sign in required.", 401);

    if (route === "me" && method === "GET") {
      return json({ user: { id: user.id, name: user.name, role: user.role, store: user.store } });
    }
    if (route === "logout" && method === "POST") {
      const h = req.headers.get("authorization") || "";
      await db.delete(sessions).where(eq(sessions.token, h.slice(7)));
      return json({ ok: true });
    }

    if (route === "orders" && method === "GET") {
      const storeId = url.searchParams.get("store") || "";
      const rows = await db.select().from(orders)
        .where(eq(orders.storeId, storeId))
        .orderBy(desc(orders.createdAt)).limit(200);
      return json({ orders: await ordersOut(rows) });
    }

    if (route === "orders" && method === "PATCH" && id) {
      const [o] = await db.select().from(orders).where(eq(orders.id, Number(id)));
      if (!o) return fail("Order not found.", 404);
      const status = String(body.status || "");
      if (!["NEW", "PREPARING", "READY", "COMPLETE", "CANCELLED"].includes(status)) return fail("Bad status.");
      if (status === "CANCELLED" && o.status !== "CANCELLED") {
        const items = await db.select().from(orderItems).where(eq(orderItems.orderId, o.id));
        await putBackStock(o.storeId, items.filter((i) => i.productId != null)
          .map((i) => ({ productId: i.productId!, qty: i.qty })));
      }
      const [upd] = await db.update(orders).set({ status }).where(eq(orders.id, o.id)).returning();
      return json({ order: (await ordersOut([upd]))[0] });
    }

    /* ---------- products / inventory ---------- */
    if (route === "products" && method === "POST") {
      const [p] = await db.insert(products).values({
        sku: body.sku || `NEW-${Math.floor(Math.random() * 900) + 100}`,
        barcode: body.barcode || "", name: body.name || "New product",
        category: body.category || "Accessories",
        price: Number(body.price || 0).toFixed(2),
        nicotine: body.nicotine || "—", description: body.description || "",
        active: !!body.active,
      }).returning();
      await db.insert(inventory).values([
        { productId: p.id, storeId: "thorold", qty: Number(body?.inv?.thorold || 0) },
        { productId: p.id, storeId: "welland", qty: Number(body?.inv?.welland || 0) },
      ]);
      return json({ products: await productOut() });
    }

    if (route === "products" && method === "PATCH" && id) {
      const pid = Number(id);
      const fields: any = {};
      for (const k of ["sku", "barcode", "name", "category", "nicotine", "description"]) {
        if (k in body) fields[k] = String(body[k] ?? "");
      }
      if ("price" in body) fields.price = Number(body.price || 0).toFixed(2);
      if ("active" in body) fields.active = !!body.active;
      if (Object.keys(fields).length) await db.update(products).set(fields).where(eq(products.id, pid));
      if (body.inv) {
        for (const storeId of ["thorold", "welland"]) {
          if (storeId in body.inv) {
            const qty = Math.max(0, Number(body.inv[storeId]) || 0);
            await db.insert(inventory).values({ productId: pid, storeId, qty })
              .onConflictDoUpdate({ target: [inventory.productId, inventory.storeId], set: { qty } });
          }
        }
      }
      return json({ ok: true });
    }

    if (route === "products" && method === "DELETE" && id) {
      await db.delete(products).where(eq(products.id, Number(id)));
      return json({ ok: true });
    }

    /* receive +1 by barcode (scanner) */
    if (route === "receive" && method === "POST") {
      const code = String(body.barcode || "");
      const storeId = String(body.store || "");
      const [p] = await db.select().from(products).where(eq(products.barcode, code));
      if (!p) return json({ found: false });
      if (body.increment) {
        await db.insert(inventory).values({ productId: p.id, storeId, qty: 1 })
          .onConflictDoUpdate({
            target: [inventory.productId, inventory.storeId],
            set: { qty: sql`${inventory.qty} + 1` },
          });
      }
      return json({ found: true, productId: p.id });
    }

    /* ---------- POS ---------- */
    if (route === "pos" && id === "sale" && method === "POST") {
      const storeId = String(body.store || "");
      const [st] = await db.select().from(stores).where(eq(stores.id, storeId));
      if (!st) return fail("Unknown store.");
      const lines: { productId: number; qty: number }[] = (body.items || [])
        .map((i: any) => ({ productId: Number(i.productId), qty: Math.max(1, Number(i.qty) || 1) }));
      if (!lines.length) return fail("Sale is empty.");
      const method_ = String(body?.payment?.method || "");
      if (!["cash", "clover"].includes(method_)) return fail("Choose cash or Clover.");

      const prods = await db.select().from(products)
        .where(inArray(products.id, lines.map((l) => l.productId)));
      const subtotal = lines.reduce((a, l) => a + num(prods.find((p) => p.id === l.productId)?.price) * l.qty, 0);
      const tax = subtotal * TAX;
      const total = subtotal + tax;

      const stockRes = await takeStock(storeId, lines);
      if (!stockRes.ok) {
        const p = prods.find((x) => x.id === stockRes.productId);
        return fail(`Not enough stock of "${p?.name}" at ${st.name}.`, 409);
      }

      let cloverPaymentId: string | null = null;
      const externalId = `pos-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;
      if (method_ === "clover") {
        try {
          const pay = await cloverCharge(storeId, Math.round(total * 100), externalId);
          cloverPaymentId = pay?.payment?.id || pay?.id || externalId;
        } catch (e: any) {
          await putBackStock(storeId, lines);
          return fail(e?.message || "Clover payment failed.", 502);
        }
      }

      let change = 0;
      if (method_ === "cash") {
        const tendered = Number(body?.payment?.tendered || 0);
        if (tendered + 0.005 < total) { await putBackStock(storeId, lines); return fail("Cash received is less than the total."); }
        change = tendered - total;
      }

      const [order] = await db.insert(orders).values({
        number: await nextOrderNumber(storeId),
        storeId, type: "pos", status: "COMPLETE",
        customerName: "Walk-in", subtotal: subtotal.toFixed(2), tax: tax.toFixed(2), total: total.toFixed(2),
        paymentMethod: method_, cloverPaymentId,
      }).returning();
      await db.insert(orderItems).values(lines.map((l) => {
        const p = prods.find((x) => x.id === l.productId)!;
        return { orderId: order.id, productId: p.id, name: p.name, price: p.price, qty: l.qty };
      }));
      return json({ order: (await ordersOut([order]))[0], change: Number(change.toFixed(2)) });
    }

    if (route === "pos" && id === "summary" && method === "GET") {
      const storeId = url.searchParams.get("store") || "";
      const start = new Date(); start.setHours(0, 0, 0, 0);
      const rows = await db.select().from(orders).where(and(
        eq(orders.storeId, storeId),
        gte(orders.createdAt, start),
        inArray(orders.status, ["COMPLETE", "READY", "PREPARING", "NEW"]),
      ));
      const pos = rows.filter((o) => o.type === "pos");
      const pickup = rows.filter((o) => o.type === "pickup");
      return json({
        posCount: pos.length, posTotal: pos.reduce((a, o) => a + num(o.total), 0),
        pickupCount: pickup.length, pickupTotal: pickup.reduce((a, o) => a + num(o.total), 0),
      });
    }

    /* ---------- Clover import ---------- */
    if (route === "clover" && id === "import" && method === "POST") {
      const result = await cloverImport(String(body.store || ""));
      return json({ ...result, products: await productOut() });
    }

    /* ---------- admin: users ---------- */
    if (route === "users") {
      if (user.role !== "admin") return fail("Admin access required.", 403);
      if (method === "GET") return json({ users: await db.select().from(users).orderBy(users.id) });
      if (method === "POST") {
        let pin: string;
        do { pin = String(Math.floor(1000 + Math.random() * 9000)); }
        while ((await db.select().from(users).where(eq(users.pin, pin))).length);
        const [u] = await db.insert(users)
          .values({ name: body.name || "New staff member", pin, role: "staff", store: body.store || "thorold" })
          .returning();
        return json({ user: u });
      }
      if (method === "PATCH" && id) {
        const fields: any = {};
        for (const k of ["name", "pin", "role", "store"]) if (k in body) fields[k] = String(body[k]);
        if (fields.role === "staff") {
          const admins = await db.select().from(users).where(eq(users.role, "admin"));
          if (admins.length === 1 && admins[0].id === Number(id)) return fail("At least one admin account must exist.");
        }
        try {
          await db.update(users).set(fields).where(eq(users.id, Number(id)));
        } catch { return fail("That PIN is already in use."); }
        return json({ ok: true });
      }
      if (method === "DELETE" && id) {
        const [target] = await db.select().from(users).where(eq(users.id, Number(id)));
        if (target?.role === "admin") {
          const admins = await db.select().from(users).where(eq(users.role, "admin"));
          if (admins.length <= 1) return fail("You can't delete the last admin account.");
        }
        await db.delete(users).where(eq(users.id, Number(id)));
        return json({ ok: true });
      }
    }

    return fail("Not found.", 404);
  } catch (e: any) {
    console.error(e);
    return fail(e?.message || "Server error.", 500);
  }
};

export const config: Config = { path: "/api/*" };
