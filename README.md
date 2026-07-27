# payment-router

Some payment gateways for some reason only let you configure a single webhook URL. If you have multiple apps that need to receive payments then it is a nightmare to handle those cases. This project tries to solve this by acting as a router: you register your real webhook URL with this API, and then point the gateway at the worker's URL. The worker will forward the callback to your real webhook URL.

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
    "externalId": "3f6a1c0e-9a6b-4a5f-8d21-7c1b0f2e9d44",
    "webhookUrl": "https://shop.example.com/webhooks/paymentic",
    "expiresAt": "2026-07-12T10:00:00.000Z",
    "createdAt": "2026-07-11T12:00:00.000Z",
    "callbackUrls": { "paymentic": "https://router.example.com/webhooks/paymentic" }
}
```

`externalId` is a UUID generated for you - it is the value you send to the gateway and that callbacks
are matched on. Keep it alongside your own order id so you can correlate the callback when it lands.

`expiresAt` is optional, defaults to 12h out.

## 3. Create transaction in your payment gateway

Create a transaction according to the gateway's API, using the `externalId` from the previous step as the external payment id. You can look up the correct field in the [table above](#supported-gateways).

## 4. Verify the callback

The router forwards the gateway's request verbatim - same method, same body byte for byte, same
headers - and adds nothing of its own. So verify it exactly as you would if the gateway called you
directly: check the gateway's own signature (PayU's `OpenPayU-Signature`, PayNow's `Signature`, ...)
against the raw body you received. Your `externalId` is inside that payload, where the gateway put it.

## Notes

- Your webhook endpoint's response is passed straight back to the gateway. Return 2xx or the gateway
  will treat the callback as failed and retry.
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
