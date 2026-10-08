import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";

const providers = [];

if (process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET) {
  providers.push(
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID,
      clientSecret: process.env.AUTH_GITHUB_SECRET,
    }),
  );
}

if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
  );
}

providers.push(
  Credentials({
    name: "Benutzername und Passwort",
    credentials: {
      username: { label: "Benutzername", type: "text" },
      password: { label: "Passwort", type: "password" },
    },
    authorize(credentials) {
      const expectedUsername = process.env.AUTH_USERNAME;
      const expectedPassword = process.env.AUTH_PASSWORD;

      if (!expectedUsername || !expectedPassword) {
        return null;
      }

      const username =
        typeof credentials?.username === "string" ? credentials.username : "";
      const password =
        typeof credentials?.password === "string" ? credentials.password : "";

      if (username === expectedUsername && password === expectedPassword) {
        return {
          id: `local:${expectedUsername}`,
          name: expectedUsername,
        };
      }

      return null;
    },
  }),
);

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers,
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized({ auth }) {
      return !!auth?.user;
    },
    session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
  trustHost: true,
});
