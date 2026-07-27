import type { PaymentRoute } from "../db/schema";

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
    request: Request;
    rawBody: string;
    timeoutMs: number;
};

/**
 * Replay the gateway callback at the route's real webhook URL, verbatim: same method, same body byte
 * for byte, same headers, so the receiver can still verify the gateway's own signature. We add
 * nothing of our own - the route id is already inside the payload, where the gateway put it.
 */
export async function forwardWebhook({ route, request, rawBody, timeoutMs }: ForwardInput): Promise<ForwardResult> {
    const target = buildTargetUrl(route.webhookUrl, new URL(request.url));
    const headers = new Headers();

    for (const [name, value] of request.headers) {
        if (STRIPPED_HEADERS.has(name.toLowerCase()) || name.toLowerCase().startsWith("cf-")) continue;
        headers.set(name, value);
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
