import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { readConfig } from "../config";
import { paymentRoutes } from "../db/schema";
import { getGatewayAdapter } from "../gateways";
import { forwardWebhook } from "../lib/forward";
import type { AppEnv } from "../types";

export const webhooksApi = new Hono<AppEnv>();

/**
 * The single URL a gateway points at. The external id travels inside the callback itself (it is the
 * external payment id set when creating the payment), so the gateway's adapter digs it out and we
 * replay the request at that route's real webhook URL.
 */
webhooksApi.all("/:gateway", async (c) => {
    const gatewayName = c.req.param("gateway");
    const adapter = getGatewayAdapter(gatewayName);
    if (!adapter) {
        return c.json({ error: "unknown_gateway", gateway: gatewayName }, 404);
    }

    const request = c.req.raw;
    const externalId = await adapter.extractExternalId(request.clone());
    if (!externalId) {
        return c.json({ error: "no_external_id_in_callback" }, 400);
    }

    const route = await c.get("db").query.paymentRoutes.findFirst({ where: eq(paymentRoutes.externalId, externalId) });
    if (!route || (route.expiresAt && route.expiresAt.getTime() < Date.now())) {
        // 404 keeps the gateway retrying: a route that has not been created yet may still show up.
        return c.json({ error: "no_matching_route", externalId }, 404);
    }

    const rawBody = request.method === "GET" || request.method === "HEAD" ? "" : await request.text();

    const result = await forwardWebhook({
        route,
        request,
        rawBody,
        timeoutMs: readConfig(c.env).forwardTimeoutMs,
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
