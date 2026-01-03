import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

/**
 * Session cookie name for anonymous user sessions.
 * Used to track unauthenticated users across requests.
 */
export const SESSION_COOKIE_NAME = "ai-auth-agent-session-id";

/**
 * UUID pattern matcher for validating chat IDs.
 * Matches standard UUID format: 8-4-4-4-12 hexadecimal characters.
 */
const UUID_PATTERN =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

/**
 * Defines routes that are publicly accessible without authentication.
 * Includes:
 * - Home page
 * - Authentication pages (sign-in, sign-up)
 * - All API routes (handled separately)
 * - Proxy routes
 */
const isPublicRoute = createRouteMatcher([
  // Public pages
  "/",
  // Auth routes
  "/sign-in(.*)",
  "/sign-up(.*)",
  // API routes
  "/api(.*)",
  // Proxy routes
  "/proxy(.*)",
]);

/**
 * Checks if a pathname matches a UUID pattern.
 * Used to allow access to chat pages by UUID without requiring authentication.
 * 
 * @param pathname - The pathname to check
 * @returns True if pathname matches UUID pattern
 */
function isUUIDRoute(pathname: string): boolean {
  // Remove leading slash and check if it matches UUID pattern
  const pathWithoutSlash = pathname.replace(/^\//, "");
  return UUID_PATTERN.test(pathWithoutSlash);
}

/**
 * Clerk middleware with session cookie management.
 * 
 * This middleware:
 * 1. Handles authentication checks for protected routes
 * 2. Allows public routes and UUID-based chat routes without auth
 * 3. Creates and maintains session cookies for anonymous users
 * 4. Redirects unauthenticated users to sign-in for protected routes
 * 
 * Session Cookie:
 * - Created automatically for anonymous users
 * - Long-lived (5 years) to persist across sessions
 * - Accessible in client-side JavaScript (httpOnly: false)
 * - Secure in production, lax same-site policy
 */
export default clerkMiddleware(async (auth, req) => {
  const { userId } = await auth();
  const pathname = req.nextUrl.pathname;
  const isPublic = isPublicRoute(req) || isUUIDRoute(pathname);

  let res: NextResponse;

  // If route is protected and user is not authenticated -> redirect to sign-in
  if (!isPublic && !userId) {
    const url = new URL("/sign-in", req.url);
    url.searchParams.set("redirect_url", req.url);
    res = NextResponse.redirect(url);
  } else {
    // For public routes or authenticated protected routes, allow access
    res = NextResponse.next();
  }

  // Session cookie logic (runs for ALL responses: redirect + normal)
  // Creates a session cookie for anonymous users if one doesn't exist
  const existing = req.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (!existing) {
    const newId = crypto.randomUUID();

    res.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: newId,
      httpOnly: false, // Accessible in client JS for API calls
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      // Long-lived cookie (~5 years) to persist across browser sessions
      maxAge: 60 * 60 * 24 * 365 * 5,
    });
  }

  return res;
});

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)", "/(api|trpc)(.*)"],
};
