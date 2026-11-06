import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";

import { ACCESS_TOKEN_COOKIE } from "@/lib/session";

const AUTH_PAGES = [
  "/login",
  "/sign-up",
  "/forgot-password",
  "/reset-password",
];

// Only checks that the sign-in cookie exists. Whether the token is still valid is
// decided by the backend: an expired token makes the next API call answer 401,
// which clears the cookie and sends the user back to /login.
export function proxy(request: NextRequest) {
  const signedIn = request.cookies.has(ACCESS_TOKEN_COOKIE);
  const { pathname, search } = request.nextUrl;
  const isAuthPage = AUTH_PAGES.some(
    (page) => pathname === page || pathname.startsWith(`${page}/`),
  );

  if (!signedIn && !isAuthPage) {
    const login = new URL("/login", request.url);
    if (pathname !== "/") login.searchParams.set("next", pathname + search);
    return NextResponse.redirect(login);
  }
  if (
    signedIn &&
    (pathname === "/" || pathname === "/login" || pathname === "/sign-up")
  ) {
    return NextResponse.redirect(new URL("/projects", request.url));
  }
  return NextResponse.next();
}

// Pages only: skips the API routes, Next.js assets and files with an extension (icons).
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|.*\\..*).*)"],
};
