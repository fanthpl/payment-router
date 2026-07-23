export type AppConfig = {
    publicBaseUrl: string | null;
    allowPrivateWebhookTargets: boolean;
    forwardTimeoutMs: number;
    /** Ed25519 private key (JWK JSON) for signing forwarded callbacks; null disables signing. */
    signingPrivateKey: string | null;
    /** Retired public JWKs (JSON array) still published in the JWKS during a rotation; null if none. */
    additionalPublicKeys: string | null;
};

const DEFAULT_FORWARD_TIMEOUT_MS = 30_000;

/**
 * `wrangler types` narrows plain vars to the literal values in wrangler.jsonc, so widen them in
 * one place instead of casting at every use site.
 */
export function readConfig(env: Env): AppConfig {
    const publicBaseUrl = (env.PUBLIC_BASE_URL as string).trim();
    const timeout = Number(env.FORWARD_TIMEOUT_MS as string);
    const signingPrivateKey = (env.WEBHOOK_SIGNING_PRIVATE_KEY ?? "").trim();
    const additionalPublicKeys = (env.WEBHOOK_SIGNING_PUBLIC_KEYS ?? "").trim();

    return {
        publicBaseUrl: publicBaseUrl.length > 0 ? publicBaseUrl : null,
        allowPrivateWebhookTargets: (env.ALLOW_PRIVATE_WEBHOOK_TARGETS as string) === "true",
        forwardTimeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_FORWARD_TIMEOUT_MS,
        signingPrivateKey: signingPrivateKey.length > 0 ? signingPrivateKey : null,
        additionalPublicKeys: additionalPublicKeys.length > 0 ? additionalPublicKeys : null,
    };
}
