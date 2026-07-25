import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { readConfig } from "../config";
import { paymentRoutes } from "../db/schema";
import { getGatewayAdapter } from "../gateways";
import { forwardWebhook } from "../lib/forward";
import type { AppEnv } from "../types";

export const webhooksApi = new Hono<AppEnv>();

/**
 * The single URL a gateway points at. The route id travels inside the callback itself (as the
 * external payment id we set when creating the payment), so the gateway's adapter digs it out and
 * we replay the request at that route's real webhook URL.
 */
webhooksApi.all("/:gateway", async (c) => {
    const gatewayName = c.req.param("gateway");
    const adapter = getGatewayAdapter(gatewayName);
    if (!adapter) {
        return c.json({ error: "unknown_gateway", gateway: gatewayName }, 404);
    }

    const request = c.req.raw;
    const routeId = await adapter.extractRouteId(request.clone());
    if (!routeId) {
        return c.json({ error: "no_route_id_in_callback" }, 400);
    }

    const route = await c.get("db").query.paymentRoutes.findFirst({ where: eq(paymentRoutes.id, routeId) });
    if (!route || (route.expiresAt && route.expiresAt.getTime() < Date.now())) {
        // 404 keeps the gateway retrying: a route that has not been created yet may still show up.
        return c.json({ error: "no_matching_route", routeId }, 404);
    }

    const rawBody = request.method === "GET" || request.method === "HEAD" ? "" : await request.text();

    const config = readConfig(c.env);
    const result = await forwardWebhook({
        route,
        gateway: adapter.name,
        request,
        rawBody,
        timeoutMs: config.forwardTimeoutMs,
        signingPrivateKey: config.signingPrivateKey,
        issuer: config.publicBaseUrl ?? new URL(request.url).origin,
    });

    if (!result.delivered) {
        // Fail loudly so the gateway retries instead of marking the callback as consumed.
        return c.json({ error: "forwarding_failed", reason: result.error }, 502);
    }

    // Pass the real webhook's own answer back to the gateway - some expect an exact body.
    const headers = new Headers();
    if (result.contentType) headers.set("Content-Type", result.contentType);
    return new Response(result.body.length > 0 ? result.body : null, { status: result.status ?? 200, headers });
});
