import type { GatewayAdapter } from "./types";

/**
 * PayNow notifications
 *
 * https://docs.paynow.pl/pl/docs/v3/integration#payment-notifications
 */
type PayNowNotification = {
    externalId?: string;
};

export const paynow: GatewayAdapter = {
    name: "paynow",

    async extractExternalId(request) {
        let parsed: unknown;
        try {
            parsed = await request.json();
        } catch {
            return null;
        }
        if (parsed === null || typeof parsed !== "object") return null;
        const payload = parsed as PayNowNotification;

        return typeof payload.externalId === "string" && payload.externalId.length > 0 ? payload.externalId : null;
    },
};
