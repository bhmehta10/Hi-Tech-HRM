import { NextResponse, type NextRequest } from "next/server";

// Send signed-out visitors to /login. Device endpoints (/iclock) stay open; they check serials.
export function middleware(req: NextRequest) {
  if (!req.cookies.has("hrm_session")) return NextResponse.redirect(new URL("/login", req.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!login|iclock|_next|favicon.ico).*)"],
};
