import type { GatewayAdapter } from "./types";

/**
 * PayU posts JSON to the notifyUrl. Order notifications nest the merchant's own id under `order`,
 * while refund notifications carry it at the top level - both shapes are handled here.
 *
 * https://developers.payu.com/europe/docs/payment-flows/notifications/
 */
type PayuNotification = {
    order?: { extOrderId?: unknown };
    extOrderId?: unknown;
};

export const payu: GatewayAdapter = {
    name: "payu",

    extractRouteId({ rawBody }) {
        let payload: PayuNotification;
        try {
            const parsed: unknown = JSON.parse(rawBody);
            if (parsed === null || typeof parsed !== "object") return null;
            payload = parsed as PayuNotification;
        } catch {
            return null;
        }

        const extOrderId = payload.order?.extOrderId ?? payload.extOrderId;
        return typeof extOrderId === "string" && extOrderId.length > 0 ? extOrderId : null;
    },
};
