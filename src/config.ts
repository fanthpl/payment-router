export type AppConfig = {
    publicBaseUrl: string | null;
    allowPrivateWebhookTargets: boolean;
    forwardTimeoutMs: number;
};

const DEFAULT_FORWARD_TIMEOUT_MS = 30_000;

/**
 * `wrangler types` narrows plain vars to the literal values in wrangler.jsonc, so widen them in
 * one place instead of casting at every use site.
 */
export function readConfig(env: Env): AppConfig {
    const publicBaseUrl = (env.PUBLIC_BASE_URL as string).trim();
    const timeout = Number(env.FORWARD_TIMEOUT_MS as string);

    return {
        publicBaseUrl: publicBaseUrl.length > 0 ? publicBaseUrl : null,
        allowPrivateWebhookTargets: (env.ALLOW_PRIVATE_WEBHOOK_TARGETS as string) === "true",
        forwardTimeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_FORWARD_TIMEOUT_MS,
    };
}
