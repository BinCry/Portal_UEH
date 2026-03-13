import { Role, UserStatus } from "@prisma/client";
import { addMinutes, isAfter, subMinutes } from "date-fns";
import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { redirect } from "next/navigation";
import { LOCK_DURATION_MINUTES, LOCK_MAX_ATTEMPTS, LOCK_WINDOW_MINUTES } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/security/password";
import { loginSchema } from "@/lib/zod-schemas/auth";

const MINHQUAN_EMAIL = "minhquan@ueh.edu.vn";

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(rawCredentials) {
        const parsed = loginSchema.safeParse(rawCredentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;
        const user = await prisma.user.findUnique({
          where: { email: email.toLowerCase() },
        });
        if (!user) return null;

        if (user.status === UserStatus.DISABLED) return null;

        const now = new Date();
        if (user.lockUntil && isAfter(user.lockUntil, now)) {
          return null;
        }

        const passwordOk = await verifyPassword(password, user.passwordHash);
        if (!passwordOk) {
          const withinWindow =
            user.lastFailedLoginAt && isAfter(user.lastFailedLoginAt, subMinutes(now, LOCK_WINDOW_MINUTES));
          const attempts = withinWindow ? user.failedLoginAttempts + 1 : 1;
          const shouldLock = attempts >= LOCK_MAX_ATTEMPTS;

          await prisma.user.update({
            where: { id: user.id },
            data: {
              failedLoginAttempts: attempts,
              lastFailedLoginAt: now,
              status: shouldLock ? UserStatus.LOCKED : user.status,
              lockUntil: shouldLock ? addMinutes(now, LOCK_DURATION_MINUTES) : null,
            },
          });
          return null;
        }

        await prisma.user.update({
          where: { id: user.id },
          data: {
            failedLoginAttempts: 0,
            lastFailedLoginAt: null,
            lockUntil: null,
            status: UserStatus.ACTIVE,
          },
        });

        return {
          id: user.id,
          email: user.email,
          role: user.role,
          canOverrideCapacity: user.canOverrideCapacity,
          isLocationViewer: user.email === MINHQUAN_EMAIL,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as unknown as { role: Role }).role;
        token.canOverrideCapacity = Boolean(
          (user as unknown as { canOverrideCapacity?: boolean }).canOverrideCapacity,
        );
        token.isLocationViewer = Boolean(
          (user as unknown as { isLocationViewer?: boolean }).isLocationViewer,
        );
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.canOverrideCapacity = token.canOverrideCapacity;
        session.user.isLocationViewer = token.isLocationViewer;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};

export const getAuthSession = () => getServerSession(authOptions);

export const requireAuth = async () => {
  const session = await getAuthSession();
  if (!session?.user) redirect("/login");
  return session;
};

export const requireRole = async (role: Role) => {
  const session = await requireAuth();
  if (session.user.role !== role) {
    if (session.user.role === "ADMIN") {
      redirect(session.user.isLocationViewer ? "/admin/student-locations" : "/admin/dashboard");
    }
    redirect("/student/dashboard");
  }
  return session;
};
