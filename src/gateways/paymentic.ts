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

    extractRouteId({ rawBody }) {
        let payload: PaymenticNotification;
        try {
            const parsed: unknown = JSON.parse(rawBody);
            if (parsed === null || typeof parsed !== "object") return null;
            payload = parsed as PaymenticNotification;
        } catch {
            return null;
        }

        return typeof payload.externalReferenceId === "string" && payload.externalReferenceId.length > 0
            ? payload.externalReferenceId
            : null;
    },
};
