import { calculateJwkThumbprint, importJWK, SignJWT, type JWK } from "jose";

/**
 * Authenticates a forwarded callback by wrapping its provenance in a standard EdDSA (Ed25519) JWT.
 *
 * The signing is asymmetric: this worker holds the private key, receivers only ever get the public
 * key (served as a JWKS), so anyone can verify a callback came from here but nobody can forge one.
 * Emitting a plain JWT + JWKS means receivers verify with any off-the-shelf library (`jose`, `PyJWT`,
 * ...) instead of implementing a bespoke scheme, and the `kid` lets us rotate keys without breaking
 * them.
 *
 * The JWT is sent in the `X-Payment-Router-Signature` header. It binds the callback's provenance
 * (`route_id`, `gateway`, `external_id`) and its body (`body_sha256`), and is short-lived (`exp`) to
 * stop replays.
 */
const CALLBACK_TTL = "5m";

export type CallbackClaims = {
    routeId: string;
    gateway: string;
    externalId: string | null;
    /** Hex SHA-256 of the forwarded request body, so the signature also covers the payload. */
    bodySha256: string;
};

/** Node/OpenSSL tag the JWK `alg` as "Ed25519"; jose and the spec want it absent or "EdDSA". */
function normalizeJwk(raw: string): JWK {
    const jwk = JSON.parse(raw) as JWK;
    delete jwk.alg;
    return jwk;
}

/** The `kid` for a key: its own `kid` if set, otherwise the deterministic RFC 7638 thumbprint. */
async function keyId(jwk: JWK): Promise<string> {
    return jwk.kid ?? (await calculateJwkThumbprint(jwk));
}

/** Sign a callback as a compact EdDSA JWT, keyed by the private JWK stored in the signing secret. */
export async function signCallback(privateJwk: string, issuer: string, claims: CallbackClaims): Promise<string> {
    const jwk = normalizeJwk(privateJwk);
    const key = await importJWK(jwk, "EdDSA");

    return new SignJWT({
        route_id: claims.routeId,
        gateway: claims.gateway,
        external_id: claims.externalId ?? undefined,
        body_sha256: claims.bodySha256,
    })
        .setProtectedHeader({ alg: "EdDSA", typ: "JWT", kid: await keyId(jwk) })
        .setIssuer(issuer)
        .setIssuedAt()
        .setExpirationTime(CALLBACK_TTL)
        .sign(key);
}

/**
 * Build the public JWKS receivers verify against: the active key's public half, plus any retired
 * public keys still inside their validity window (so a rotation does not reject in-flight callbacks).
 */
export async function buildJwks(privateJwk: string, additionalPublicKeys: string | null): Promise<{ keys: JWK[] }> {
    const jwk = normalizeJwk(privateJwk);
    const kid = await keyId(jwk);

    const active: JWK = { kty: jwk.kty, crv: jwk.crv, x: jwk.x, kid, use: "sig", alg: "EdDSA" };
    const retired: JWK[] = additionalPublicKeys ? (JSON.parse(additionalPublicKeys) as JWK[]) : [];

    return { keys: [active, ...retired.filter((k) => k.kid !== kid)] };
}

/** Hex SHA-256, used to bind the callback body into the signature. */
export async function sha256Hex(data: string): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data));
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
