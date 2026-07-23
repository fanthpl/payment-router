import ipaddr from "ipaddr.js";

/** Names that never leave the local machine or network, so they can only be an SSRF target. */
const BLOCKED_HOSTNAMES = ["localhost"];
const BLOCKED_HOSTNAME_SUFFIXES = [".localhost", ".local", ".internal", ".home.arpa"];

export type WebhookUrlValidation = { ok: true; url: URL } | { ok: false; reason: string };

/**
 * The stored target is fetched by the worker on every gateway callback, so an unchecked URL
 * would turn this service into an open relay into private networks.
 *
 * Best-effort by design: a public hostname can still resolve to a private address, and Workers
 * cannot resolve DNS ahead of the request to find out.
 */
export function validateWebhookUrl(rawUrl: string, allowPrivateTargets: boolean): WebhookUrlValidation {
    let url: URL;
    try {
        url = new URL(rawUrl);
    } catch {
        return { ok: false, reason: "webhookUrl is not a valid absolute URL" };
    }

    if (url.protocol !== "https:" && url.protocol !== "http:") {
        return { ok: false, reason: "webhookUrl must use http or https" };
    }

    if (allowPrivateTargets) {
        return { ok: true, url };
    }

    if (url.protocol !== "https:") {
        return { ok: false, reason: "webhookUrl must use https" };
    }
    if (!isPublicHost(url.hostname)) {
        return { ok: false, reason: "webhookUrl points at a private, loopback or otherwise non-public host" };
    }

    return { ok: true, url };
}

function isPublicHost(hostname: string): boolean {
    // URL keeps IPv6 literals in brackets, which ipaddr.js does not accept.
    const host = hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;

    if (ipaddr.isValid(host)) {
        const address = ipaddr.parse(host);
        // Everything that is not `unicast` is loopback, private, link-local, reserved and friends.
        // IPv4-mapped IPv6 (::ffff:127.0.0.1) is its own range, so it never passes as unicast either.
        return address.range() === "unicast";
    }

    const lower = host.toLowerCase();
    return !BLOCKED_HOSTNAMES.includes(lower) && !BLOCKED_HOSTNAME_SUFFIXES.some((suffix) => lower.endsWith(suffix));
}
