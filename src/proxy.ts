import { NextResponse, type NextRequest } from "next/server";
import { classifyRoute } from "@/lib/auth/access";
import { SESSION_COOKIE, authDisabled, cookieOptions, decodeSessionCookie, encodeSessionCookie, sessionSecret, shouldSlide, slideExpiry } from "@/lib/auth/session";

// An optimistic gate in front of every page and route: no valid signed cookie, no entry.
// The real check (revocation, expiry in the database) runs again in each server action
// and route handler through `requireAuth`, as Server Functions can be POSTed to directly.
export function proxy(request: NextRequest) {
  if (authDisabled()) return NextResponse.next();
  const path = request.nextUrl.pathname;
  const kind = classifyRoute(path);
  if (kind !== "private") return NextResponse.next();

  const secret = sessionSecret();
  const session = decodeSessionCookie(request.cookies.get(SESSION_COOKIE)?.value, secret, Date.now());
  if (!session) {
    if (path.startsWith("/api/")) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    const login = new URL("/connexion", request.url);
    if (path !== "/") login.searchParams.set("next", path + request.nextUrl.search);
    return NextResponse.redirect(login);
  }

  const response = NextResponse.next();
  if (shouldSlide(session.exp, Date.now())) {
    const exp = slideExpiry(Date.now());
    response.cookies.set(SESSION_COOKIE, encodeSessionCookie({ token: session.token, exp }, secret), cookieOptions(Math.floor((exp - Date.now()) / 1000)));
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
