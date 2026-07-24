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

    extractRouteId({ rawBody }) {
        let payload: PayNowNotification;
        try {
            const parsed: unknown = JSON.parse(rawBody);
            if (parsed === null || typeof parsed !== "object") return null;
            payload = parsed as PayNowNotification;
        } catch {
            return null;
        }

        return typeof payload.externalId === "string" && payload.externalId.length > 0 ? payload.externalId : null;
    },
};
