# payment-router

Some payment gateways for some reason only let you configure a single webhook URL. If you have multiple apps that need to receive payments then it is a headache to handle those cases. This project tries to solve this by acting as a router: you register your real webhook URL with this API, and then point the gateway at the worker's URL. The worker will forward the callback to your real webhook URL.

A hosted instance is live at https://payment-r.fanth.pl. You can also [self-host this on Cloudflare Workers](#self-hosting).

## Supported gateways

| Gateway                                 | Callback endpoint                               | External ID field                                                                                   |
| --------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| [PayU](https://poland.payu.com/)        | `https://router.example.com/webhooks/payu`      | [`extOrderId`](https://developers.payu.com/europe/pl/api/#tag/Order/operation/create-an-order)      |
| [Paymentic](https://www.paymentic.com/) | `https://router.example.com/webhooks/paymentic` | [`externalReferenceId`](https://docs.paymentic.com/api/v1.2/payment-api/create-payment-transaction) |
| [PayNow](https://www.paynow.pl/)        | `https://router.example.com/webhooks/paynow`    | [`externalId`](https://docs.paynow.pl/pl/docs/reference/v3/send-payment-request)                    |
| [Cashbill](https://www.cashbill.pl/)    | `https://router.example.com/webhooks/cashbill`  | [`additionalData`](https://api.cashbill.pl/api/payment-gateway/creating-new-transaction)            |

Each gateway's adapter lives in `src/gateways/`. Adding a new one is a single file, see that
directory for the pattern.

## 1. Set notification url in your payment gateway dashboard

Set the notification URL according to the [table above](#supported-gateways). Replace `https://router.example.com` with your own instance's public origin. The path is fixed per gateway.

## 2. Register your webhook on payment initalization

```bash
curl -X POST https://router.example.com/v1/routes \
  -H "Content-Type: application/json" \
  -d '{
        "webhookUrl": "https://shop.example.com/webhooks/paymentic",
        "expiresAt": "2026-07-12T10:00:00Z"
      }'
```

```json
{
    "id": "3f6a1c0e-9a6b-4a5f-8d21-7c1b0f2e9d44",
    "webhookUrl": "https://shop.example.com/webhooks/paymentic",
    "expiresAt": "2026-07-12T10:00:00.000Z",
    "createdAt": "2026-07-11T12:00:00.000Z",
    "callbackUrls": { "paymentic": "https://router.example.com/webhooks/paymentic" }
}
```

`expiresAt` is optional, defaults to 12h out.

## 3. Create transaction in your payment gateway

Create a transaction according to the gateway's API, using the `id` from the previous step as the external payment id. You can look up the correct field in the [table above](#supported-gateways).

## 4. Verify the callback (recommended)

Every forwarded callback carries a signed EdDSA JWT in `X-Payment-Router-Signature`, verifiable
against the JWKS at `GET /.well-known/jwks.json`:

```js
import { jwtVerify, createRemoteJWKSet } from "jose";
import { createHash } from "node:crypto";

const JWKS = createRemoteJWKSet(new URL("https://router.example.com/.well-known/jwks.json"));

// rawBody is the exact bytes you received on your webhook
const token = req.headers["x-payment-router-signature"];
const { payload } = await jwtVerify(token, JWKS, { issuer: "https://router.example.com" });

if (payload.body_sha256 !== createHash("sha256").update(rawBody).digest("hex")) {
    throw new Error("body does not match signature");
}
// payload.route_id / payload.external_id tell you which of your payments this is
```

Claims: `route_id`, `gateway`, `external_id`, `body_sha256` (hex SHA-256 of the forwarded body),
`exp` (5 min TTL). If the router isn't configured to sign, this header is simply absent.

The forwarded request also carries plain headers with the same facts (`X-Payment-Router-Id`,
`X-Payment-Router-Gateway`, `X-Payment-Router-External-Id`) - convenience only, trust the JWT above
for anything that matters.

## Notes

- Your webhook endpoint's response is passed straight back to the gateway. Return 2xx or the gateway
  will treat the callback as failed and retry.
- Gateway signatures (e.g. PayU's `OpenPayU-Signature`) pass through untouched - verify them as you
  normally would, independent of the router's own JWT.
- Route creation is rate-limited per IP (60/min by default).

## Self-hosting

This is built for Cloudflare Workers (D1, `wrangler`) - to run 24/7 you need to deploy it there
with `pnpm deploy`, not just run it locally.

```bash
npx wrangler d1 create payment-router   # paste the printed id into wrangler.jsonc
pnpm db:generate                        # regenerate SQL after schema changes
pnpm db:migrate:local                   # apply migrations to the local D1
pnpm db:migrate                         # apply migrations to the remote D1
pnpm dev                                # local dev only - stops when your machine does
pnpm deploy                             # ship it to Cloudflare Workers
```

Set `PUBLIC_BASE_URL` in `wrangler.jsonc` to the worker's public origin.
