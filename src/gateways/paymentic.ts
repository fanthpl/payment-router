import type { GatewayAdapter } from "./types";

/**
 * Paymentic notifications
 *
 * https://docs.paymentic.com/docs/notifications/payment/transaction-status-changed
 */
type PaymenticNotification = {
    externalReferenceId?: string | null;
};

export const paymentic: GatewayAdapter = {
    name: "paymentic",

    async extractExternalId(request) {
        let parsed: unknown;
        try {
            parsed = await request.json();
        } catch {
            return null;
        }
        if (parsed === null || typeof parsed !== "object") return null;
        const payload = parsed as PaymenticNotification;

        return typeof payload.externalReferenceId === "string" && payload.externalReferenceId.length > 0
            ? payload.externalReferenceId
            : null;
    },
};
