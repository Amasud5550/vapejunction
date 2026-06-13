import {
  pgTable, serial, text, integer, numeric, boolean, timestamp, primaryKey,
} from "drizzle-orm/pg-core";

export const stores = pgTable("stores", {
  id: text("id").primaryKey(),                 // 'thorold' | 'welland'
  name: text("name").notNull(),
  tag: text("tag").notNull(),                  // 'T' | 'W' for order numbers
  address: text("address").notNull(),
  phone: text("phone").notNull(),
  hours: text("hours").notNull(),
});

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  pin: text("pin").notNull().unique(),
  role: text("role").notNull().default("staff"),   // 'staff' | 'admin'
  store: text("store").notNull().default("all"),   // 'thorold' | 'welland' | 'all'
});

export const sessions = pgTable("sessions", {
  token: text("token").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  sku: text("sku").notNull(),
  barcode: text("barcode").notNull().default(""),
  name: text("name").notNull(),
  category: text("category").notNull().default("Accessories"),
  price: numeric("price", { precision: 10, scale: 2 }).notNull().default("0"),
  nicotine: text("nicotine").notNull().default("—"),
  description: text("description").notNull().default(""),
  active: boolean("active").notNull().default(false),
  cloverItemId: text("clover_item_id"),        // set when imported/synced from Clover
});

export const inventory = pgTable("inventory", {
  productId: integer("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  storeId: text("store_id").notNull().references(() => stores.id),
  qty: integer("qty").notNull().default(0),
}, (t) => [primaryKey({ columns: [t.productId, t.storeId] })]);

export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  number: text("number").notNull(),            // VJ-T-0001 / VJ-W-0001
  storeId: text("store_id").notNull().references(() => stores.id),
  type: text("type").notNull().default("pickup"),   // 'pickup' (online) | 'pos' (in-store sale)
  status: text("status").notNull().default("NEW"),  // NEW PREPARING READY COMPLETE CANCELLED
  customerName: text("customer_name").notNull().default(""),
  phone: text("phone").notNull().default(""),
  email: text("email").notNull().default(""),
  notes: text("notes").notNull().default(""),
  subtotal: numeric("subtotal", { precision: 10, scale: 2 }).notNull(),
  tax: numeric("tax", { precision: 10, scale: 2 }).notNull(),
  total: numeric("total", { precision: 10, scale: 2 }).notNull(),
  paymentMethod: text("payment_method"),       // 'cash' | 'clover' | null (pickup: pays at counter)
  cloverPaymentId: text("clover_payment_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const orderItems = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  productId: integer("product_id"),
  name: text("name").notNull(),                // snapshot at time of sale
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  qty: integer("qty").notNull(),
});
