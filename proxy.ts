import { NextResponse, type NextRequest } from "next/server"

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const schoolProtected = pathname.startsWith("/dashboard")
  const adminProtected =
    pathname.startsWith("/admin") && !pathname.startsWith("/admin/login")

  const judgeProtected =
    pathname.startsWith("/judge") && pathname !== "/judge/login"

  // This is only an optimistic redirect. Each page and route independently
  // unseals and validates the relevant session before exposing any data.
  if (schoolProtected && !request.cookies.has("portal_school")) {
    return NextResponse.redirect(new URL("/login", request.url))
  }
  if (adminProtected && !request.cookies.has("portal_admin")) {
    return NextResponse.redirect(new URL("/admin/login", request.url))
  }
  if (judgeProtected && !request.cookies.has("portal_judge")) {
    return NextResponse.redirect(new URL("/judge/login", request.url))
  }
  return NextResponse.next()
}

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*", "/judge/:path*"],
}
