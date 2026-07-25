import type { GatewayAdapter } from "./types";

/**
 * Cashbill notifications
 *
 * https://api.cashbill.pl/api/payment-gateway/notification-service
 */
export const cashbill: GatewayAdapter = {
    name: "cashbill",

    async extractRouteId(request) {
        const searchParams = new URL(request.url).searchParams;
        const additionalData = searchParams.get("args");
        return additionalData && additionalData.length > 0 ? additionalData : null;
    },
};
