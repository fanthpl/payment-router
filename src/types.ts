import type { Db } from "./db/client";

export type AppEnv = {
    Bindings: Env;
    Variables: {
        db: Db;
    };
};

/** Cloudflare Workers native rate limiter binding (configured under `unsafe.bindings`). */
export interface RateLimiterBinding {
    limit(options: { key: string }): Promise<{ success: boolean }>;
}

declare global {
    interface Env {
        /**
         * Ed25519 private key (JWK JSON) used to sign forwarded callbacks as EdDSA JWTs. Asymmetric:
         * receivers only get the public key (via the JWKS endpoint) and can verify but never forge.
         * Not in wrangler.jsonc since it is a secret: set it with
         * `wrangler secret put WEBHOOK_SIGNING_PRIVATE_KEY` (production) or in `.dev.vars` (local).
         * Generate a keypair with `node scripts/generate-signing-key.mjs`. When unset, callbacks are
         * forwarded unsigned.
         */
        WEBHOOK_SIGNING_PRIVATE_KEY?: string;
        /**
         * Optional JSON array of retired public JWKs to keep publishing in the JWKS during a key
         * rotation, so callbacks signed by the previous key still verify until they expire.
         */
        WEBHOOK_SIGNING_PUBLIC_KEYS?: string;
        /** Rate limiter for `POST /v1/routes`. Absent in some local setups, so treated as optional. */
        ROUTES_RATE_LIMITER?: RateLimiterBinding;
    }
}
