import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const studentPaths = ["/student"];
const adminPaths = ["/admin"];

const isProtectedPath = (pathname: string) =>
  studentPaths.some((prefix) => pathname.startsWith(prefix)) ||
  adminPaths.some((prefix) => pathname.startsWith(prefix));

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!isProtectedPath(pathname)) {
    return NextResponse.next();
  }

  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (!token) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  const adminLandingPath = token.isLocationViewer ? "/admin/student-locations" : "/admin/dashboard";

  if (pathname.startsWith("/admin/student-locations") && !token.isLocationViewer) {
    return NextResponse.redirect(new URL(adminLandingPath, request.url));
  }

  if (pathname.startsWith("/admin") && token.role !== "ADMIN") {
    return NextResponse.redirect(new URL("/student/dashboard", request.url));
  }

  if (pathname.startsWith("/student") && token.role !== "STUDENT") {
    return NextResponse.redirect(new URL(adminLandingPath, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/student/:path*", "/admin/:path*"],
};
