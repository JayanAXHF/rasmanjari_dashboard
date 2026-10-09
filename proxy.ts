import { NextResponse, type NextRequest } from "next/server"

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const schoolProtected = pathname.startsWith("/dashboard")
  const adminProtected = pathname.startsWith("/admin") && !pathname.startsWith("/admin/login")

  // This is only an optimistic redirect. Each page and route independently
  // unseals and validates the relevant session before exposing any data.
  if (schoolProtected && !request.cookies.has("portal_school")) {
    return NextResponse.redirect(new URL("/login", request.url))
  }
  if (adminProtected && !request.cookies.has("portal_admin")) {
    return NextResponse.redirect(new URL("/admin/login", request.url))
  }
  return NextResponse.next()
}

export const config = { matcher: ["/dashboard/:path*", "/admin/:path*"] }
