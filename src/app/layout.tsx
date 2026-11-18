import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { clerkAppearance } from "@/components/auth/appearance";
import { authBypassEnabled } from "@/lib/auth-bypass";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Brains Cad Brain", template: "%s · Brains Cad Brain" },
  description: "Estimating, takeoffs, quotes and job management for builders and trades.",
};

// Every page reads the request (auth) or the DB; rendering at request time also lets the
// BCB_AUTH_BYPASS / Clerk key env vars be read at runtime rather than baked in at build.
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">
        {authBypassEnabled() ? (
          children
        ) : (
          <ClerkProvider
            appearance={clerkAppearance}
            signInUrl={process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL ?? "/sign-in"}
            signUpUrl={process.env.NEXT_PUBLIC_CLERK_SIGN_UP_URL ?? "/sign-up"}
            signInFallbackRedirectUrl={process.env.NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL ?? "/dashboard"}
            signUpFallbackRedirectUrl={process.env.NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL ?? "/dashboard"}
            afterSignOutUrl="/sign-in"
          >
            {children}
          </ClerkProvider>
        )}
      </body>
    </html>
  );
}
