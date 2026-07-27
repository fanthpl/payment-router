import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * A payment route pairs the id we hand to the payment gateway (as its "external payment id")
 * with the webhook URL the gateway callback should end up at.
 */
export const paymentRoutes = sqliteTable(
    "payment_routes",
    {
        /** Caller-supplied, sent to the gateway as its external payment id, matched back on callback. */
        externalId: text("external_id").primaryKey(),
        webhookUrl: text("webhook_url").notNull(),
        expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
        createdAt: integer("created_at", { mode: "timestamp_ms" })
            .notNull()
            .$defaultFn(() => new Date()),
    },
    (table) => [index("payment_routes_created_at_idx").on(table.createdAt)]
);

export type PaymentRoute = typeof paymentRoutes.$inferSelect;
