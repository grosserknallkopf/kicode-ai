import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import { getUserByUsername } from "@/lib/db";
import { verifyPassword } from "@/lib/password";

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
    async authorize(credentials) {
      const username =
        typeof credentials?.username === "string"
          ? credentials.username.trim().toLowerCase()
          : "";
      const password =
        typeof credentials?.password === "string" ? credentials.password : "";

      if (!username || !password) return null;

      const envUsername = process.env.AUTH_USERNAME?.trim().toLowerCase();
      const envPassword = process.env.AUTH_PASSWORD;

      if (envUsername && envPassword && username === envUsername) {
        if (password === envPassword) {
          return {
            id: `local:${process.env.AUTH_USERNAME}`,
            name: process.env.AUTH_USERNAME,
            role: "admin",
          };
        }
        return null;
      }

      const user = await getUserByUsername(username);
      if (!user || user.disabled || !user.password_hash) return null;

      const valid = await verifyPassword(password, user.password_hash);
      if (!valid) return null;

      return {
        id: user.id,
        name: user.name || user.username || username,
        email: user.email,
        image: user.image,
        role: user.role,
      };
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
    jwt({ token, user }) {
      if (user) {
        token.role = (user as { role?: string }).role ?? "user";
        token.name = user.name;
        token.email = user.email;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        if (token.sub) session.user.id = token.sub;
        (session.user as { role?: string }).role =
          (token.role as string | undefined) ?? "user";
      }
      return session;
    },
  },
  trustHost: true,
});
