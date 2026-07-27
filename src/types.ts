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
        /** Rate limiter for `POST /v1/routes`. Absent in some local setups, so treated as optional. */
        ROUTES_RATE_LIMITER?: RateLimiterBinding;
    }
}
