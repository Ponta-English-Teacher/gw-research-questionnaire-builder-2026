import { createHmac, timingSafeEqual, createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

/**
 * Shared access-code protection.
 *  - The code lives ONLY in the server env var ACCESS_CODE (never in source).
 *  - A successful login sets a signed, httpOnly session cookie.
 *  - If ACCESS_CODE is not configured, everything fails CLOSED (503).
 */

export const SESSION_COOKIE = "gw_session";
export const SESSION_MAX_AGE_SEC = 60 * 60 * 8; // 8 hours

function getAccessCode(): string {
  return (process.env.ACCESS_CODE || "").trim();
}

export function isAuthConfigured(): boolean {
  return getAccessCode().length > 0;
}

function signingKey(): Buffer {
  // Derived from the access code (+ optional SESSION_SECRET), so changing the
  // code immediately invalidates every existing session.
  return createHash("sha256")
    .update("gw-session-v1|" + getAccessCode() + "|" + (process.env.SESSION_SECRET || ""))
    .digest();
}

function sign(payload: string): string {
  return createHmac("sha256", signingKey()).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  // Hash first so both buffers have equal length (constant-time compare).
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function checkAccessCode(candidate: string): boolean {
  const code = getAccessCode();
  if (!code) return false;
  return safeEqual(candidate, code);
}

export function createSessionToken(now = Date.now()): string {
  const payload = `v1.${now + SESSION_MAX_AGE_SEC * 1000}`;
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string | undefined, now = Date.now()): boolean {
  if (!token || !isAuthConfigured()) return false;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return false;
  const payload = `${parts[0]}.${parts[1]}`;
  if (!safeEqual(parts[2], sign(payload))) return false;
  const exp = Number(parts[1]);
  return Number.isFinite(exp) && exp > now;
}

export function isAuthenticated(req: NextRequest): boolean {
  return verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
}

/** Call first in every API route. Returns a response to send if denied, otherwise null. */
export function requireAuth(req: NextRequest): NextResponse | null {
  if (!isAuthConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Access protection is not configured on the server." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
  if (!isAuthenticated(req)) {
    return NextResponse.json(
      { ok: false, error: "Authentication required. Please log in with the access code." },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }
  return null;
}

export function sessionCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    maxAge,
  };
}
