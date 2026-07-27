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

    async extractExternalId(request) {
        let parsed: unknown;
        try {
            parsed = await request.json();
        } catch {
            return null;
        }
        if (parsed === null || typeof parsed !== "object") return null;
        const payload = parsed as PayuNotification;

        const extOrderId = payload.order?.extOrderId ?? payload.extOrderId;
        return typeof extOrderId === "string" && extOrderId.length > 0 ? extOrderId : null;
    },
};
