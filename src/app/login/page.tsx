import { auth, signIn } from "@/lib/auth";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { SignInButton } from "@/components/SignInButton";

interface LoginPageProps {
  searchParams?: Promise<{ error?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const session = await auth();
  if (session?.user) redirect("/");
  const params = searchParams ? await searchParams : undefined;
  const hasCredentialsError = params?.error === "credentials";
  const hasGithubProvider = !!(
    process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET
  );
  const hasGoogleProvider = !!(
    process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET
  );

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

        <form
          action={async (formData) => {
            "use server";
            const username = formData.get("username");
            const password = formData.get("password");

            try {
              await signIn("credentials", {
                username: typeof username === "string" ? username : "",
                password: typeof password === "string" ? password : "",
                redirectTo: "/",
              });
            } catch (error) {
              if (error instanceof AuthError) {
                redirect("/login?error=credentials");
              }
              throw error;
            }
          }}
          className="space-y-3"
        >
          <input
            type="text"
            name="username"
            placeholder="Benutzername"
            autoComplete="username"
            required
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <input
            type="password"
            name="password"
            placeholder="Passwort"
            autoComplete="current-password"
            required
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {hasCredentialsError ? (
            <p className="text-xs text-destructive">
              Anmeldung fehlgeschlagen. Bitte Benutzername und Passwort prüfen.
            </p>
          ) : null}
          <button
            type="submit"
            className="w-full px-4 py-3 rounded-xl bg-primary text-primary-foreground hover:opacity-90 transition-opacity text-sm font-medium"
          >
            Mit Benutzername & Passwort anmelden
          </button>
        </form>

        <div className="space-y-3">
          {hasGithubProvider ? (
            <SignInButton
              provider="github"
              label="Mit GitHub anmelden"
              action={async () => {
                "use server";
                await signIn("github", { redirectTo: "/" });
              }}
            />
          ) : null}
          {hasGoogleProvider ? (
            <SignInButton
              provider="google"
              label="Mit Google anmelden"
              action={async () => {
                "use server";
                await signIn("google", { redirectTo: "/" });
              }}
            />
          ) : null}
        </div>

        <p className="text-xs text-center text-muted-foreground">
          Nur für Mitglieder der Programmier-AG. Deine Daten werden nicht für
          KI-Training verwendet.
        </p>
      </div>
    </div>
  );
}
