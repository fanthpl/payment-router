/**
 * Generates an Ed25519 keypair for signing forwarded callbacks (as EdDSA JWTs).
 *
 * Run: node scripts/generate-signing-key.mjs
 *
 * - Put the PRIVATE key JWK into the `WEBHOOK_SIGNING_PRIVATE_KEY` secret
 *   (`wrangler secret put WEBHOOK_SIGNING_PRIVATE_KEY`, or `.dev.vars` for local dev).
 * - The PUBLIC key JWK is what receivers verify with; the worker serves it (with all others) at
 *   `GET /.well-known/jwks.json`, so you usually do not need to distribute it by hand.
 * - Both carry a `kid` (RFC 7638 thumbprint) so callbacks name the key they were signed with, which
 *   is what lets you rotate keys without breaking receivers.
 */
import { calculateJwkThumbprint } from "jose";

const { subtle } = globalThis.crypto;

const pair = await subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
const privateJwk = await subtle.exportKey("jwk", pair.privateKey);
const publicJwk = await subtle.exportKey("jwk", pair.publicKey);

// Node tags OKP keys as `alg: "Ed25519"`; the JWT/JWK spec wants "EdDSA". Drop it and let the worker
// and receivers use the standard value.
delete privateJwk.alg;
delete publicJwk.alg;

const kid = await calculateJwkThumbprint(publicJwk);
privateJwk.kid = kid;

console.log("WEBHOOK_SIGNING_PRIVATE_KEY (keep secret):\n");
console.log(JSON.stringify(privateJwk));
console.log("\nPublic key (served at GET /.well-known/jwks.json; keep for the rotation list later):\n");
console.log(JSON.stringify({ kty: publicJwk.kty, crv: publicJwk.crv, x: publicJwk.x, kid, use: "sig", alg: "EdDSA" }));
