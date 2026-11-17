import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SEC,
  checkAccessCode,
  createSessionToken,
  isAuthConfigured,
  sessionCookieOptions,
} from "@/lib/auth";

const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(req: NextRequest) {
  if (!isAuthConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Access protection is not configured on the server." },
      { status: 503, headers: NO_STORE }
    );
  }

  let code = "";
  try {
    const body = await req.json();
    code = typeof body?.code === "string" ? body.code.trim().slice(0, 200) : "";
  } catch {
    code = "";
  }

  if (!code || !checkAccessCode(code)) {
    return NextResponse.json(
      { ok: false, error: "Incorrect access code." },
      { status: 401, headers: NO_STORE }
    );
  }

  const res = NextResponse.json({ ok: true }, { headers: NO_STORE });
  res.cookies.set(SESSION_COOKIE, createSessionToken(), sessionCookieOptions(SESSION_MAX_AGE_SEC));
  return res;
}
