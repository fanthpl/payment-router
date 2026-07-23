import type { PaymentRoute } from "../db/schema";
import { sha256Hex, signCallback } from "./signature";

/** Headers that describe the hop to us, not the payload - they must not be replayed upstream. */
const STRIPPED_HEADERS = new Set([
    "host",
    "content-length",
    "connection",
    "keep-alive",
    "transfer-encoding",
    "upgrade",
    "expect",
    "accept-encoding",
]);

export type ForwardResult = {
    delivered: boolean;
    status: number | null;
    body: string;
    contentType: string | null;
    error: string | null;
    durationMs: number;
};

export type ForwardInput = {
    route: PaymentRoute;
    gateway: string;
    request: Request;
    rawBody: string;
    timeoutMs: number;
    /** Ed25519 private key (JWK JSON); when set, the callback is signed as a JWT. */
    signingPrivateKey: string | null;
    /** JWT `iss` claim - the public origin of this worker; used only when signing. */
    issuer: string;
};

/**
 * Replay the gateway callback at the route's real webhook URL. The body is passed through byte for
 * byte and the original headers are kept so the receiver can still verify the gateway's signature.
 */
export async function forwardWebhook({ route, gateway, request, rawBody, timeoutMs, signingPrivateKey, issuer }: ForwardInput): Promise<ForwardResult> {
    const target = buildTargetUrl(route.webhookUrl, new URL(request.url));
    const headers = new Headers();

    for (const [name, value] of request.headers) {
        if (STRIPPED_HEADERS.has(name.toLowerCase()) || name.toLowerCase().startsWith("cf-")) continue;
        headers.set(name, value);
    }

    // Convenience headers for the receiver. Authenticity comes from the signed JWT below, not these -
    // the same facts live in its claims, so a receiver that verifies should trust the token, not here.
    headers.set("X-Payment-Router-Id", route.id);
    headers.set("X-Payment-Router-Gateway", gateway);
    headers.set("X-Forwarded-Host", new URL(request.url).host);
    if (route.externalId) headers.set("X-Payment-Router-External-Id", route.externalId);

    if (signingPrivateKey) {
        const jwt = await signCallback(signingPrivateKey, issuer, {
            routeId: route.id,
            gateway,
            externalId: route.externalId,
            bodySha256: await sha256Hex(rawBody),
        });
        headers.set("X-Payment-Router-Signature", jwt);
    }

    const hasBody = request.method !== "GET" && request.method !== "HEAD";
    const startedAt = performance.now();

    try {
        const response = await fetch(target, {
            method: request.method,
            headers,
            body: hasBody ? rawBody : undefined,
            redirect: "follow",
            signal: AbortSignal.timeout(timeoutMs),
        });
        const body = await response.text();

        return {
            delivered: response.ok,
            status: response.status,
            body,
            contentType: response.headers.get("content-type"),
            error: response.ok ? null : `target responded with ${response.status}`,
            durationMs: Math.round(performance.now() - startedAt),
        };
    } catch (error) {
        return {
            delivered: false,
            status: null,
            body: "",
            contentType: null,
            error: error instanceof Error ? `${error.name}: ${error.message}` : "unknown fetch failure",
            durationMs: Math.round(performance.now() - startedAt),
        };
    }
}

/** Gateways sometimes put the payload in the query string, so carry it over to the target. */
function buildTargetUrl(webhookUrl: string, incoming: URL): URL {
    const target = new URL(webhookUrl);
    for (const [key, value] of incoming.searchParams) {
        if (!target.searchParams.has(key)) {
            target.searchParams.append(key, value);
        }
    }
    return target;
}
