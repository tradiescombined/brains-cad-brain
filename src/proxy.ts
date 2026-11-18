import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { authBypassEnabled } from "@/lib/auth-bypass";

/**
 * Sign-in gate (Next 16 proxy, Node.js runtime).
 *
 * Public: sign-in/up pages, the client quote page `/q/<token>` (and its accept server action, which
 * POSTs to the same path), and `/no-access`. Everything else needs a Clerk session AND an active
 * `users` row linked to that Clerk user — Clerk sign-up is open to any Google/Apple account, so the
 * team-member check here also covers server actions and route handlers, which layouts don't guard.
 * A signed-in person with no linked row is sent to `/no-access`, which links invited users on their
 * first sign-in and sends them back.
 *
 * `/api/documents/*` stays private: the public quote page doesn't use it (logos are inline data URLs).
 */
const isPublicRoute = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)", "/q/(.*)", "/no-access(.*)"]);

const clerk = clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return;
  const { userId } = await auth.protect();

  const [row] = await db
    .select({ active: schema.users.active })
    .from(schema.users)
    .where(eq(schema.users.clerkUserId, userId))
    .limit(1);
  if (row?.active) return;

  if (req.method === "GET" || req.method === "HEAD") {
    const url = new URL("/no-access", req.url);
    const next = req.nextUrl.pathname + req.nextUrl.search;
    if (next !== "/") url.searchParams.set("next", next);
    return NextResponse.redirect(url);
  }
  return new NextResponse("You don't have access to Brains Cad Brain yet.", { status: 403 });
}, {
  signInUrl: process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL ?? "/sign-in",
  signUpUrl: process.env.NEXT_PUBLIC_CLERK_SIGN_UP_URL ?? "/sign-up",
});

export function proxy(req: NextRequest, event: NextFetchEvent) {
  // Test-only bypass (BCB_AUTH_BYPASS=1, plus BCB_ALLOW_TEST_BYPASS=1 in a production build; never on
  // deployed Vercel sites). See src/lib/auth-bypass.ts.
  if (authBypassEnabled()) return NextResponse.next();
  return clerk(req, event);
}

export const config = {
  matcher: [
    // Everything except Next internals and static files (unless found in search params)
    "/((?!_next|[^?]*\\.(?:html?|css|m?js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|txt|pdf)).*)",
    // Always run for API routes and Clerk's Frontend API proxy path
    "/(api|trpc|__clerk)(.*)",
  ],
};
