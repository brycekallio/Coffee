#!/usr/bin/env node
// Generates the ES256 key pair that ties the Worker to Supabase.
//
// ONE key, used in two places:
//   - the private half goes into Supabase (Dashboard -> Auth -> JWT Keys -> import),
//     which publishes the public half at /auth/v1/.well-known/jwks.json
//   - the same private half goes into the Worker as SUPABASE_JWT_PRIVATE_JWK
//
// Supabase then verifies the Worker's tokens against a key it already trusts,
// which is what lets auth.uid() work for a token GoTrue never issued.
//
// Writes nothing to disk. Pipe it somewhere deliberate or copy from the terminal.

import { generateKeyPairSync } from "node:crypto";

const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });

const privateJwk = privateKey.export({ format: "jwk" });
const publicJwk = publicKey.export({ format: "jwk" });

// A stable kid derived from the public key, so regenerating the same key would
// give the same id and a different key can never silently reuse one.
const kid = Buffer.from(JSON.stringify([publicJwk.crv, publicJwk.x, publicJwk.y]))
  .toString("base64url")
  .slice(0, 22);

const withMeta = (jwk) => JSON.stringify({ ...jwk, kid, alg: "ES256", use: "sig" });

console.log(`
# ───────────────────────────────────────────────────────────────────────
# 1. Supabase  ·  Dashboard → Authentication → JWT Keys → Import key
#    Paste this PEM. Then confirm the kid Supabase displays matches below.
# ───────────────────────────────────────────────────────────────────────
${privateKey.export({ type: "pkcs8", format: "pem" }).trim()}

# ───────────────────────────────────────────────────────────────────────
# 2. Worker secrets  ·  run each line, paste the value when prompted
# ───────────────────────────────────────────────────────────────────────
#   wrangler secret put SUPABASE_JWT_KID
${kid}

#   wrangler secret put SUPABASE_JWT_PRIVATE_JWK
${withMeta(privateJwk)}

#   wrangler secret put SESSION_SECRET
${Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url")}

# ───────────────────────────────────────────────────────────────────────
# Public half, for reference only — Supabase derives and publishes this itself.
# ${withMeta(publicJwk)}
# ───────────────────────────────────────────────────────────────────────

# This output is a private key. It was not written to disk; do not paste it into
# a file the repo tracks, a chat, or a terminal you are screen-sharing.
`);
