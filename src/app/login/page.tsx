import { auth, signIn } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SignInButton } from "@/components/SignInButton";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/");

  return (
    <div className="flex items-center justify-center h-full">
      <div className="w-full max-w-sm space-y-8 p-8">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-4">
            <svg
              className="w-8 h-8 text-primary"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">KiCode AI</h1>
          <p className="text-muted-foreground text-sm">
            Programmier-AG • Mit KI programmieren lernen
          </p>
        </div>

        <div className="space-y-3">
          <SignInButton
            provider="github"
            label="Mit GitHub anmelden"
            action={async () => {
              "use server";
              await signIn("github", { redirectTo: "/" });
            }}
          />
          <SignInButton
            provider="google"
            label="Mit Google anmelden"
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: "/" });
            }}
          />
        </div>

        <p className="text-xs text-center text-muted-foreground">
          Nur für Mitglieder der Programmier-AG. Deine Daten werden nicht für
          KI-Training verwendet.
        </p>
      </div>
    </div>
  );
}
