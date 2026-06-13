CREATE TABLE "inventory" (
	"product_id" integer,
	"store_id" text,
	"qty" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "inventory_pkey" PRIMARY KEY("product_id","store_id")
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" serial PRIMARY KEY,
	"order_id" integer NOT NULL,
	"product_id" integer,
	"name" text NOT NULL,
	"price" numeric(10,2) NOT NULL,
	"qty" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" serial PRIMARY KEY,
	"number" text NOT NULL,
	"store_id" text NOT NULL,
	"type" text DEFAULT 'pickup' NOT NULL,
	"status" text DEFAULT 'NEW' NOT NULL,
	"customer_name" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"subtotal" numeric(10,2) NOT NULL,
	"tax" numeric(10,2) NOT NULL,
	"total" numeric(10,2) NOT NULL,
	"payment_method" text,
	"clover_payment_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY,
	"sku" text NOT NULL,
	"barcode" text DEFAULT '' NOT NULL,
	"name" text NOT NULL,
	"category" text DEFAULT 'Accessories' NOT NULL,
	"price" numeric(10,2) DEFAULT '0' NOT NULL,
	"nicotine" text DEFAULT '—' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"clover_item_id" text
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"token" text PRIMARY KEY,
	"user_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stores" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"tag" text NOT NULL,
	"address" text NOT NULL,
	"phone" text NOT NULL,
	"hours" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY,
	"name" text NOT NULL,
	"pin" text NOT NULL UNIQUE,
	"role" text DEFAULT 'staff' NOT NULL,
	"store" text DEFAULT 'all' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_product_id_products_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_store_id_stores_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id");--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_store_id_stores_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id");--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;