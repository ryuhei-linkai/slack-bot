import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

const COOKIE_NAME = "dashboard_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function generateSessionToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function hashSecret(secret: string): string {
  return crypto.createHash("sha256").update(secret).digest("hex");
}

/**
 * POST /api/dashboard/login - Password login, sets session cookie.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json();
  const { password } = body;

  if (!password) {
    return NextResponse.json({ error: "パスワードを入力してください" }, { status: 400 });
  }

  const expected = process.env.DASHBOARD_PASSWORD || process.env.DASHBOARD_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "サーバー側の認証設定がされていません" }, { status: 500 });
  }

  if (password !== expected) {
    return NextResponse.json({ error: "パスワードが正しくありません" }, { status: 401 });
  }

  const token = generateSessionToken();
  const hashedToken = hashSecret(token);

  const response = NextResponse.json({ success: true });

  response.cookies.set(COOKIE_NAME, `${token}:${hashedToken}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });

  return response;
}

/**
 * DELETE /api/dashboard/login - Logout, clears session cookie.
 */
export async function DELETE(): Promise<NextResponse> {
  const response = NextResponse.json({ success: true });
  response.cookies.delete(COOKIE_NAME);
  return response;
}

/**
 * GET /api/dashboard/login - Check if session is valid.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const isValid = verifySession(request);
  return NextResponse.json({ authenticated: isValid });
}

/**
 * Verify session cookie.
 */
export function verifySession(request: NextRequest): boolean {
  const cookie = request.cookies.get(COOKIE_NAME)?.value;
  if (!cookie) return false;

  const parts = cookie.split(":");
  if (parts.length !== 2) return false;

  const [token, storedHash] = parts;
  const computedHash = hashSecret(token);

  return crypto.timingSafeEqual(
    Buffer.from(computedHash),
    Buffer.from(storedHash)
  );
}
