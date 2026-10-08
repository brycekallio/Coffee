// Provider definitions and the OAuth 2.0 + PKCE dance.
//
// Two providers, and the second one is not optional: CU Boulder runs Microsoft
// (colorado.edu MX -> colorado-edu.mail.protection.outlook.com), and Coffee's
// stated audience is CU freshmen and sophomores. Google-only sign-in would show
// every one of them a button they cannot use.

export type ProviderId = "google" | "microsoft";

interface Provider {
  authorizeUrl: string;
  tokenUrl: string;
  scope: string;
  /** Accepted `iss` values on the returned ID token. */
  issuers: (iss: string) => boolean;
  extraAuthParams?: Record<string, string>;
}

export const PROVIDERS: Record<ProviderId, Provider> = {
  google: {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scope: "openid email profile",
    issuers: (iss) => iss === "https://accounts.google.com" || iss === "accounts.google.com",
    // Without this Google silently reuses the last account on shared machines.
    extraAuthParams: { prompt: "select_account" },
  },
  microsoft: {
    // `common` rather than a tenant id: it accepts both work/school accounts
    // (colorado.edu) and personal Microsoft accounts. A tenant-scoped endpoint
    // would lock the app to a single university.
    authorizeUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    scope: "openid email profile",
    // Multi-tenant issuers carry the tenant GUID, so this has to be a pattern.
    issuers: (iss) =>
      /^https:\/\/login\.microsoftonline\.com\/[0-9a-f-]{36}\/v2\.0$/i.test(iss) ||
      iss === "https://login.microsoftonline.com/9188040d-6c67-4c5b-b112-36a304b66dad/v2.0",
    extraAuthParams: { prompt: "select_account" },
  },
};

export function isProviderId(v: string | null): v is ProviderId {
  return v === "google" || v === "microsoft";
}

const enc = new TextEncoder();

export function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const byte of b) s += String.fromCharCode(byte);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64urlDecode(s: string): Uint8Array {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(pad + "=".repeat((4 - (pad.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export function randomString(bytes = 32): string {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

/** PKCE S256 challenge. Both providers support it; neither requires it. We use it
 *  anyway so a stolen authorization code is useless without the verifier. */
export async function pkceChallenge(verifier: string): Promise<string> {
  return b64url(await crypto.subtle.digest("SHA-256", enc.encode(verifier)));
}

export interface IdTokenClaims {
  iss: string;
  aud: string | string[];
  exp: number;
  sub: string;
  email?: string;
  email_verified?: boolean | string;
  preferred_username?: string;
  name?: string;
  picture?: string;
}

/**
 * Reads the ID token's claims and checks the ones that matter.
 *
 * The signature is deliberately NOT re-verified. The token did not arrive from
 * the browser — we fetched it ourselves over TLS from the provider's token
 * endpoint, authenticating with our client secret and the PKCE verifier. That
 * channel is the trust anchor; a JWKS round trip would re-prove something the
 * transport already established. (This is the same reasoning Google documents
 * for the server-side code exchange.) If this ever changes to accept a token
 * from the client, signature verification becomes mandatory.
 */
export function readIdToken(idToken: string, provider: Provider, clientId: string): IdTokenClaims {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("id_token is not a JWT");

  let claims: IdTokenClaims;
  try {
    claims = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[1])));
  } catch {
    throw new Error("id_token payload is not JSON");
  }

  if (!provider.issuers(claims.iss)) throw new Error(`unexpected id_token issuer: ${claims.iss}`);

  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.includes(clientId)) throw new Error("id_token audience is not this client");

  if (typeof claims.exp !== "number" || claims.exp * 1000 < Date.now()) {
    throw new Error("id_token is expired");
  }
  return claims;
}

/** Microsoft work/school tokens sometimes carry the address in preferred_username
 *  instead of email, and personal accounts carry it in both. */
export function emailFrom(claims: IdTokenClaims): string | null {
  const raw = claims.email ?? claims.preferred_username ?? null;
  if (!raw || !raw.includes("@")) return null;
  return raw.trim().toLowerCase();
}

export async function exchangeCode(opts: {
  provider: Provider;
  clientId: string;
  clientSecret: string;
  code: string;
  verifier: string;
  redirectUri: string;
}): Promise<{ id_token: string }> {
  const res = await fetch(opts.provider.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: opts.code,
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      redirect_uri: opts.redirectUri,
      code_verifier: opts.verifier,
    }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`token exchange failed (${res.status}): ${body.slice(0, 300)}`);

  const json = JSON.parse(body) as { id_token?: string };
  if (!json.id_token) throw new Error("token response carried no id_token");
  return { id_token: json.id_token };
}
