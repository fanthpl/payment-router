import { cashbill } from "./cashbill";
import { paymentic } from "./paymentic";
import { paynow } from "./paynow";
import { payu } from "./payu";
import type { GatewayAdapter } from "./types";

/**
 * Every supported gateway gets its own adapter - the id lives in a different field in each of them
 * and guessing it from the payload is how you end up routing on the gateway's own transaction id.
 * Adding a gateway means adding a file here, nothing else.
 */
const adapters: GatewayAdapter[] = [payu, paymentic, paynow, cashbill];

const byName = new Map(adapters.map((adapter) => [adapter.name, adapter]));

export function getGatewayAdapter(name: string): GatewayAdapter | null {
    return byName.get(name.toLowerCase()) ?? null;
}

export function listGatewayNames(): string[] {
    return adapters.map((adapter) => adapter.name);
}

export type { GatewayAdapter } from "./types";
