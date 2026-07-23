export type GatewayCallback = {
    url: URL;
    rawBody: string;
    contentType: string | null;
};

export type GatewayAdapter = {
    /** Path segment this adapter is reachable at: POST /hooks/<name>. */
    name: string;
    /**
     * Pull out the external payment id we set when creating the payment - that id is the route id.
     * Returns null when the callback carries none, which means we cannot route it.
     */
    extractRouteId(callback: GatewayCallback): string | null;
};
