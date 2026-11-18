import type { ComponentProps } from "react";
import type { SignIn } from "@clerk/nextjs";

type Appearance = NonNullable<ComponentProps<typeof SignIn>["appearance"]>;

/**
 * Clerk component styling to match the app: brand teal (brand-600 #0a8077), ink greys, Geist.
 * Core 3 renamed `appearance.layout` to `appearance.options`. Social buttons (Google, Apple) go on top
 * as full-width block buttons so they are the primary way in; the providers themselves are enabled in
 * the Clerk dashboard (see README → Sign-in).
 */
export const clerkAppearance: Appearance = {
  options: {
    socialButtonsPlacement: "top",
    socialButtonsVariant: "blockButton",
    logoPlacement: "none",
  },
  variables: {
    colorPrimary: "#0a8077",
    colorForeground: "#161a20",
    colorMutedForeground: "#6b7686",
    colorBackground: "#ffffff",
    colorInput: "#ffffff",
    colorBorder: "#dfe3e8",
    borderRadius: "0.5rem",
    fontFamily: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif",
  },
  elements: {
    rootBox: { width: "100%" },
    cardBox: { width: "100%", boxShadow: "0 1px 2px rgb(0 0 0 / 0.05)", border: "1px solid #dfe3e8" },
    formButtonPrimary: { backgroundColor: "#0a8077", "&:hover": { backgroundColor: "#0d6661" } },
    footerActionLink: { color: "#0d6661" },
  },
};
