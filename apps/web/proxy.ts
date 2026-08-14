import { NextResponse, type NextRequest } from "next/server";

import { getAppSessionContext, isFirstOwnerSetupComplete } from "@/lib/session";

const setupPath = "/setup";
const loginPath = "/login";
const signOutPath = "/signout";

function redirectTo(request: NextRequest, pathname: string): NextResponse {
  return NextResponse.redirect(new URL(pathname, request.url));
}

function isPath(pathname: string, expected: string): boolean {
  return pathname === expected || pathname.startsWith(`${expected}/`);
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const setupComplete = await isFirstOwnerSetupComplete();

  if (!setupComplete) {
    return isPath(pathname, setupPath)
      ? NextResponse.next()
      : redirectTo(request, setupPath);
  }

  const session = await getAppSessionContext(request.headers);

  if (isPath(pathname, setupPath)) {
    return session === null ? redirectTo(request, loginPath) : redirectTo(request, "/");
  }

  if (isPath(pathname, loginPath)) {
    return session === null ? NextResponse.next() : redirectTo(request, "/");
  }

  if (isPath(pathname, signOutPath)) {
    return NextResponse.next();
  }

  return session === null ? redirectTo(request, loginPath) : NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\..*).*)"
  ]
};
