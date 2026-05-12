import { NextAuthOptions } from "next-auth";
import { JWT } from "next-auth/jwt";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import FacebookProvider from "next-auth/providers/facebook";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "./prisma";
import { verifyPassword } from "./password";

function getProviderImage(profile: Record<string, unknown> | undefined, fallback?: string | null) {
  if (fallback) return fallback;

  const profileImage = profile?.picture;
  if (typeof profileImage === "string") return profileImage;

  if (
    profileImage &&
    typeof profileImage === "object" &&
    "data" in profileImage &&
    profileImage.data &&
    typeof profileImage.data === "object" &&
    "url" in profileImage.data &&
    typeof profileImage.data.url === "string"
  ) {
    return profileImage.data.url;
  }

  return null;
}

async function enrichTokenWithUser(token: JWT) {
  if (!token.email) return token;

  const user = await prisma.user.findUnique({
    where: { email: token.email },
    select: { id: true, role: true, name: true, email: true, image: true },
  });

  if (!user) return token;

  token.id = user.id;
  token.role = user.role;
  token.name = user.name ?? token.name;
  token.email = user.email ?? token.email;
  token.picture = user.image ?? token.picture;

  return token;
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    }),
    FacebookProvider({
      clientId: process.env.FACEBOOK_CLIENT_ID || "",
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET || "",
    }),
    CredentialsProvider({
      name: "Email",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials.password) return null;
        const user = await prisma.user.findUnique({ where: { email: credentials.email } });
        if (!user?.passwordHash) return null;
        if (!verifyPassword(credentials.password, user.passwordHash)) return null;
        return { id: user.id, email: user.email, name: user.name, role: user.role, image: user.image };
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async signIn({ user, account, profile }) {
      if (!user.id || !account || (account.provider !== "google" && account.provider !== "facebook")) {
        return true;
      }

      const image = getProviderImage(profile as Record<string, unknown> | undefined, user.image);
      if (!image) return true;

      await prisma.user.updateMany({
        where: { id: user.id },
        data: { image },
      });

      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = "role" in user ? String(user.role) : token.role;
        token.picture = user.image ?? token.picture;
      }

      return enrichTokenWithUser(token);
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.id ?? "");
        session.user.role = token.role;
        session.user.image = typeof token.picture === "string" ? token.picture : null;
      }
      return session;
    },
    async redirect({ url, baseUrl }) {
      // Strip Railway's internal port from any absolute URL before redirecting.
      function stripPort(u: string) {
        try {
          const parsed = new URL(u);
          if (parsed.port && parsed.hostname !== "localhost") {
            parsed.port = "";
            return parsed.toString();
          }
        } catch {}
        return u;
      }
      url = stripPort(url);
      baseUrl = stripPort(baseUrl);
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      if (url.startsWith(baseUrl)) return url;
      return baseUrl;
    },
  },
  pages: {
    signIn: "/auth/signin",
  },
};
