// The long-lived session cookie.
//
// Deliberately NOT a Supabase refresh token. This cookie says only "the browser
// holding me proved it controls <email> at <time>"; the Worker re-derives a fresh
// one-hour access token from it on every /auth/session call. That means the
// browser never holds anything long-lived, nothing survives a revocation longer
// than an hour, and signing out is a single Set-Cookie.

import { b64url, b64urlDecode } from "./oauth";

const enc = new TextEncoder();

export const SESSION_COOKIE = "coffee_session";
export const OAUTH_COOKIE = "coffee_oauth";
export const SESSION_TTL = 60 * 60 * 24 * 30; // 30 days

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function sign<T>(value: T, secret: string): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify(value)));
  const mac = await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(body));
  return `${body}.${b64url(mac)}`;
}

export async function unsign<T>(token: string | null, secret: string): Promise<T | null> {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;

  const body = token.slice(0, dot);
  const mac = b64urlDecode(token.slice(dot + 1));

  // crypto.subtle.verify is constant-time, so this comparison does not leak the
  // signature byte by byte the way a string === would.
  const ok = await crypto.subtle.verify(
    "HMAC",
    await hmacKey(secret),
    mac as BufferSource,
    enc.encode(body),
  );
  if (!ok) return null;

  try {
    return JSON.parse(new TextDecoder().decode(b64urlDecode(body))) as T;
  } catch {
    return null;
  }
}

export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

/** SameSite=Lax, not Strict: the provider redirects back as a top-level GET, and
 *  Strict would withhold the cookie on exactly that navigation. */
export function setCookie(name: string, value: string, maxAge: number): string {
  return [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ].join("; ");
}

export function clearCookie(name: string): string {
  return `${name}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export interface SessionPayload {
  id: string;
  email: string;
  provider: string;
  /** Supabase's refresh token. HttpOnly and signed, so script cannot read it and
   *  a tampered cookie fails the HMAC before it reaches Supabase. */
  refresh_token: string;
  name?: string;
  avatar_url?: string;
  /** Issued-at, so a cookie that outlives SESSION_TTL in a stale browser is
   *  rejected here rather than relying on the browser to have expired it. */
  iat: number;
}

export function sessionExpired(s: SessionPayload): boolean {
  return Math.floor(Date.now() / 1000) - s.iat > SESSION_TTL;
}
