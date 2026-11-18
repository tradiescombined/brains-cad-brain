import { redirect } from "next/navigation";
import { SignUp } from "@clerk/nextjs";
import { AuthShell } from "@/components/auth/AuthShell";
import { clerkAppearance } from "@/components/auth/appearance";
import { authBypassEnabled } from "@/lib/auth-bypass";

export const metadata = { title: "Create your login" };

export default function SignUpPage() {
  if (authBypassEnabled()) redirect("/dashboard");
  return (
    <AuthShell
      title="Create your login"
      subtitle="Continue with Google or Apple using the email address your business owner added in Settings → Users."
    >
      <div className="flex justify-center" data-testid="clerk-sign-up">
        <SignUp appearance={clerkAppearance} path="/sign-up" signInUrl="/sign-in" fallbackRedirectUrl="/dashboard" />
      </div>
    </AuthShell>
  );
}
