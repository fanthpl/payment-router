import { zValidator } from "@hono/zod-validator";
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
    /** Caller's own id for this payment, echoed back as a header on the forwarded callback. */
    externalId: z.string().min(1).max(256).optional(),
    /** ISO 8601 timestamp after which callbacks carrying this id are rejected. Defaults to 12h out. */
    expiresAt: z.iso.datetime({ offset: true }).optional(),
});

export const routesApi = new Hono<AppEnv>();

/** Create the "short link": a UUID to hand the gateway, paired with the real webhook URL. */
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

    const [route] = await c
        .get("db")
        .insert(paymentRoutes)
        .values({
            id: crypto.randomUUID(),
            webhookUrl: validation.url.toString(),
            externalId: input.externalId ?? null,
            expiresAt: input.expiresAt ? new Date(input.expiresAt) : new Date(Date.now() + DEFAULT_ROUTE_TTL_MS),
        })
        .returning();

    return c.json(serializeRoute(route, c.env), 201);
});

/**
 * `id` is what you send to the gateway as its external payment id; `callbackUrls` are the fixed URLs
 * you paste into each gateway's dashboard - the same for every route, by design.
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
