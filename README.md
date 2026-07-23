# payment-router

A URL shortener, but for payment gateway webhooks.

Some gateways let you configure only **one** webhook URL - yet all of them let you attach your own
external payment id to a payment. This worker exploits that: you register the real webhook URL here
and get back a UUID. You hand that UUID to the gateway as the external payment id, and you point the
gateway's single webhook URL at `https://<worker>/webhooks/<gateway>`. When the callback arrives, the
gateway's adapter reads the UUID out of the payload, the worker looks up the matching route and
replays the request at the real webhook URL - body byte for byte, original headers intact, so
signature verification still works upstream.

## Setup

```bash
npx wrangler d1 create payment-router   # paste the printed id into wrangler.jsonc
pnpm db:generate                        # regenerate SQL after schema changes
pnpm db:migrate:local                   # apply migrations to the local D1
pnpm db:migrate                         # apply migrations to the remote D1
pnpm dev
```

Set `PUBLIC_BASE_URL` in `wrangler.jsonc` to the worker's public origin.

## Creating a route

The only endpoint. No auth.

```bash
curl -X POST https://router.example.com/v1/routes \
  -H "Content-Type: application/json" \
  -d '{
        "webhookUrl": "https://shop.example.com/webhooks/payu",
        "expiresAt": "2026-07-12T10:00:00Z"
      }'
```

```json
{
    "id": "3f6a1c0e-9a6b-4a5f-8d21-7c1b0f2e9d44",
    "webhookUrl": "https://shop.example.com/webhooks/payu",
    "expiresAt": "2026-07-12T10:00:00.000Z",
    "createdAt": "2026-07-11T12:00:00.000Z",
    "callbackUrls": { "payu": "https://router.example.com/webhooks/payu" }
}
```

`expiresAt` is optional. Send `id` to the gateway as its external payment id (for PayU: `extOrderId`
on the order) and set the matching `callbackUrls` entry as the gateway's webhook URL.

## Gateway callbacks

`ALL /webhooks/:gateway` - the callback endpoint. `:gateway` selects the adapter; an unknown one is a
404, there is no guessing fallback.

Supported gateways live in `src/gateways/`, one file each:

| Gateway | Adapter          | Where the route id comes from                            |
| ------- | ---------------- | -------------------------------------------------------- |
| PayU    | `gateways/payu.ts` | `order.extOrderId` (order notifications), `extOrderId` (refunds) |

Adding a gateway: write `src/gateways/<name>.ts` exporting a `GatewayAdapter` and add it to the
`adapters` array in `src/gateways/index.ts`. Nothing else changes.

The forwarded request carries extra headers for the receiver:

- `X-Payment-Router-Id` - the route id that matched
- `X-Payment-Router-Gateway` - the adapter that handled the callback
- `X-Forwarded-Host` - the host the gateway called this worker on
- `X-Payment-Router-External-Id` - the caller's own id, if one was set when creating the route

The values above are for convenience only - authenticity comes from the signed JWT below, whose
claims carry the same facts. A receiver that verifies should trust the token, not these headers.

### Verifying a callback (signed JWT)

When `WEBHOOK_SIGNING_PRIVATE_KEY` is set, every forwarded callback carries a standard **EdDSA
(Ed25519) JWT** in the `X-Payment-Router-Signature` header. The signing is asymmetric: the worker
holds the private key, receivers only ever get the public key (as a JWKS), so anyone can verify a
callback came from here but nobody can forge one. Because it is a plain JWT, you verify it with any
off-the-shelf library - no custom crypto to implement.

The JWT claims are:

- `iss` - this worker's public origin (`PUBLIC_BASE_URL`)
- `iat` / `exp` - issued-at and expiry (5 min TTL); reject expired tokens to stop replays
- `route_id` - the route id that matched
- `gateway` - the adapter that handled the callback
- `external_id` - the caller's own id, if one was set when creating the route
- `body_sha256` - hex SHA-256 of the forwarded request body, so the signature also covers the payload

The public keys are served as a JWKS at `GET /.well-known/jwks.json`. Each key has a `kid`, and the
JWT names the `kid` it was signed with, so keys can be rotated without breaking receivers. Verifying
in Node with [`jose`](https://github.com/panva/jose):

```js
import { jwtVerify, createRemoteJWKSet } from "jose";
import { createHash } from "node:crypto";

const JWKS = createRemoteJWKSet(new URL("https://router.example.com/.well-known/jwks.json"));

// rawBody is the exact bytes you received on your webhook
const token = req.headers["x-payment-router-signature"];
const { payload } = await jwtVerify(token, JWKS, { issuer: "https://router.example.com" });

const bodyOk = payload.body_sha256 === createHash("sha256").update(rawBody).digest("hex");
if (!bodyOk) throw new Error("body does not match signature");
// payload.route_id / payload.external_id tell you which of your payments this is
```

`createRemoteJWKSet` fetches, caches, and picks the right key by `kid` for you, so rotation is
transparent. When `WEBHOOK_SIGNING_PRIVATE_KEY` is unset the callback is forwarded unsigned and the
JWKS endpoint returns 404.

Generate a keypair with `node scripts/generate-signing-key.mjs`, then set the private key with
`wrangler secret put WEBHOOK_SIGNING_PRIVATE_KEY` (or in `.dev.vars` locally).

**Rotating keys:** generate a new keypair, move the current *public* JWK into the
`WEBHOOK_SIGNING_PUBLIC_KEYS` secret (a JSON array - it keeps being published in the JWKS), then set
the new private key as `WEBHOOK_SIGNING_PRIVATE_KEY`. Once every callback signed by the old key has
expired (5 min), drop it from `WEBHOOK_SIGNING_PUBLIC_KEYS`.

Responses back to the gateway:

- **2xx** - the real webhook's own status and body are passed through verbatim (some gateways insist
  on an exact response body).
- **502** - the real webhook was unreachable or answered with an error, so the gateway retries.
- **404** - unknown gateway, or no unexpired route for the id in the callback. Also a retry signal:
  the route may simply not have been created yet.
- **400** - the callback carried no external payment id at all, so it cannot be routed.

## Notes

- The create endpoint is open, so two things keep this worker from being an open relay: the target
  check (registered URLs must be `https` and must not point at a private or loopback host;
  `ALLOW_PRIVATE_WEBHOOK_TARGETS=true` lifts that, for local testing only), and a per-client-IP rate
  limit on `POST /v1/routes` (Cloudflare's native rate limiter, configured under `unsafe.bindings` in
  `wrangler.jsonc` - 60 creations per IP per minute by default; tune `limit`/`period` there).
- Gateway signatures (PayU's `OpenPayU-Signature`) are not verified here - the header is forwarded
  untouched, so verify it in the receiving webhook as you would without this worker.
