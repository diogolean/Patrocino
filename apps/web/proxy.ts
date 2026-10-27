import { NextResponse, type NextRequest } from "next/server";

const COOKIE = "gallery_session";
const SESSION = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function proxy(request: NextRequest) {
  const current = request.cookies.get(COOKIE)?.value ?? "";
  const session = SESSION.test(current) ? current : crypto.randomUUID();
  const headers = new Headers(request.headers);
  headers.set("x-gallery-session", session);
  const response = NextResponse.next({ request: { headers } });
  if (session !== current) {
    response.cookies.set(COOKIE, session, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      secure: process.env.NODE_ENV === "production",
    });
  }
  return response;
}

export const config = {
  matcher: ["/creator/:path*"],
};
