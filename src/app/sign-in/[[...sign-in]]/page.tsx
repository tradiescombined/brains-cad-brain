import { redirect } from "next/navigation";
import { SignIn } from "@clerk/nextjs";
import { AuthShell } from "@/components/auth/AuthShell";
import { clerkAppearance } from "@/components/auth/appearance";
import { authBypassEnabled } from "@/lib/auth-bypass";

export const metadata = { title: "Sign in" };

export default function SignInPage() {
  if (authBypassEnabled()) redirect("/dashboard");
  return (
    <AuthShell title="Sign in to your business" subtitle="Use the Google or Apple account your business owner invited.">
      <div className="flex justify-center" data-testid="clerk-sign-in">
        <SignIn appearance={clerkAppearance} path="/sign-in" signUpUrl="/sign-up" fallbackRedirectUrl="/dashboard" />
      </div>
    </AuthShell>
  );
}
