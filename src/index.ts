import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";
import { routesApi } from "./api/routes";
import { webhooksApi } from "./api/webhooks";
import { createDb } from "./db/client";
import type { AppEnv } from "./types";

/**
 * Payment router - a URL shortener for payment gateway webhooks.
 *
 * Gateways that only accept a single webhook URL still let you set your own external payment id.
 * So: register the real webhook URL here against an id of your choosing, send that id to the gateway
 * as the external payment id, and point the gateway at `/webhooks/<gateway>`. When the callback
 * arrives, that gateway's adapter reads the id out of it and we replay the request, unchanged, at the
 * URL you registered.
 */
const app = new Hono<AppEnv>();

app.use("*", logger());
app.use("*", async (c, next) => {
    c.set("db", createDb(c.env.DB));
    await next();
});

app.get("/", (c) => c.json({ service: "payment-router", status: "ok" }));

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
