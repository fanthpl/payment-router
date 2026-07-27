export type GatewayAdapter = {
    /** Path segment this adapter is reachable at: POST /hooks/<name>. */
    name: string;
    /**
     * Pull out the external payment id we set when creating the payment - that is what we route on.
     * Receives a clone of the incoming request, so reading its body here does not consume it for
     * the caller. Returns null when the callback carries none, which means we cannot route it.
     */
    extractExternalId(request: Request): Promise<string | null> | string | null;
};
