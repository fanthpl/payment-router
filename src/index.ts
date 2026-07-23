import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";
import { routesApi } from "./api/routes";
import { webhooksApi } from "./api/webhooks";
import { readConfig } from "./config";
import { createDb } from "./db/client";
import { buildJwks } from "./lib/signature";
import type { AppEnv } from "./types";

/**
 * Payment router - a URL shortener for payment gateway webhooks.
 *
 * Gateways that only accept a single webhook URL still let you set your own external payment id.
 * So: register the real webhook URL here, get a UUID back, send that UUID to the gateway as the
 * external payment id, and point the gateway at `/webhooks/<gateway>`. When the callback arrives, that
 * gateway's adapter reads the UUID out of it and we replay the request at the URL you registered.
 */
const app = new Hono<AppEnv>();

app.use("*", logger());
app.use("*", async (c, next) => {
    c.set("db", createDb(c.env.DB));
    await next();
});

app.get("/", (c) => c.json({ service: "payment-router", status: "ok" }));

/** JWKS receivers use to verify the EdDSA JWT that signs each forwarded callback. */
app.get("/.well-known/jwks.json", async (c) => {
    const { signingPrivateKey, additionalPublicKeys } = readConfig(c.env);
    if (!signingPrivateKey) {
        return c.json({ error: "signing_disabled" }, 404);
    }
    const jwks = await buildJwks(signingPrivateKey, additionalPublicKeys);
    c.header("Cache-Control", "public, max-age=3600");
    return c.json(jwks);
});

app.route("/v1/routes", routesApi);
app.route("/webhooks", webhooksApi);

app.notFound((c) => c.json({ error: "not_found" }, 404));

app.onError((error, c) => {
    if (error instanceof HTTPException) {
        return c.json({ error: error.message }, error.status);
    }
    console.error("Unhandled error", error);
    return c.json({ error: "internal_error" }, 500);
});

export default app;
