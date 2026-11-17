import { NextRequest, NextResponse } from "next/server";
import { isAuthConfigured, isAuthenticated } from "@/lib/auth";

export async function GET(req: NextRequest) {
  return NextResponse.json(
    { ok: true, configured: isAuthConfigured(), authenticated: isAuthenticated(req) },
    { headers: { "Cache-Control": "no-store" } }
  );
}
