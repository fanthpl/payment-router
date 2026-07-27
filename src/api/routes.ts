import { zValidator } from "@hono/zod-validator";
import { lt } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { readConfig } from "../config";
import { paymentRoutes, type PaymentRoute } from "../db/schema";
import { listGatewayNames } from "../gateways";
import { validateWebhookUrl } from "../lib/webhook-url";
import type { AppEnv } from "../types";

/** How long a route stays usable when the caller does not pick an expiry themselves. */
const DEFAULT_ROUTE_TTL_MS = 12 * 60 * 60 * 1000;

const createRouteSchema = z.object({
    webhookUrl: z.string().min(1),
    /** Caller's own id for this payment, sent on to the gateway. Defaults to a random UUID. */
    externalId: z.string().min(1).max(256).optional(),
    /** ISO 8601 timestamp after which callbacks carrying this id are rejected. Defaults to 12h out. */
    expiresAt: z.iso.datetime({ offset: true }).optional(),
});

export const routesApi = new Hono<AppEnv>();

/** Create the "short link": the external id you hand the gateway, paired with the real webhook URL. */
routesApi.post("/", zValidator("json", createRouteSchema), async (c) => {
    // Public endpoint, so throttle per client IP to keep it from being used as an open relay.
    const limiter = c.env.ROUTES_RATE_LIMITER;
    if (limiter) {
        const key = c.req.header("cf-connecting-ip") ?? "anonymous";
        const { success } = await limiter.limit({ key });
        if (!success) {
            throw new HTTPException(429, { message: "rate_limited" });
        }
    }

    const input = c.req.valid("json");

    const validation = validateWebhookUrl(input.webhookUrl, readConfig(c.env).allowPrivateWebhookTargets);
    if (!validation.ok) {
        throw new HTTPException(422, { message: validation.reason });
    }

    const now = new Date();
    const values = {
        externalId: input.externalId ?? crypto.randomUUID(),
        webhookUrl: validation.url.toString(),
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : new Date(now.getTime() + DEFAULT_ROUTE_TTL_MS),
        createdAt: now,
    };

    const [route] = await c
        .get("db")
        .insert(paymentRoutes)
        .values(values)
        // Caller-chosen ids share one namespace, so an id still in use must not be silently rebound.
        // An expired one is dead weight though, so let it be claimed again - as one statement, so two
        // concurrent claims cannot both win. A route with no expiry is never reclaimed.
        .onConflictDoUpdate({ target: paymentRoutes.externalId, set: values, setWhere: lt(paymentRoutes.expiresAt, now) })
        .returning();

    if (!route) {
        throw new HTTPException(409, { message: "external_id_already_used" });
    }

    return c.json(serializeRoute(route, c.env), 201);
});

/**
 * `externalId` is what you send to the gateway as its external payment id; `callbackUrls` are the
 * fixed URLs you paste into each gateway's dashboard - the same for every route, by design.
 */
function serializeRoute(route: PaymentRoute, env: Env) {
    const { publicBaseUrl } = readConfig(env);

    return {
        ...route,
        callbackUrls: publicBaseUrl
            ? Object.fromEntries(
                  listGatewayNames().map((gateway) => [gateway, new URL(`/webhooks/${gateway}`, publicBaseUrl).toString()])
              )
            : null,
    };
}
