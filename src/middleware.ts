export { auth as middleware } from "@/lib/auth";

export const config = {
  matcher: [
    "/",
    "/api/chat/:path*",
    "/api/sandbox/:path*",
    "/((?!api/auth|login|_next/static|_next/image|favicon.ico).*)",
  ],
};
