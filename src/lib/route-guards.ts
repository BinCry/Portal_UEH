import type { Role } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const getSessionUser = async () => {
  const session = await getServerSession(authOptions);
  return session?.user ?? null;
};

export const requireApiRole = async (role?: Role) => {
  const user = await getSessionUser();
  if (!user) {
    return { ok: false as const, status: 401, message: "Chưa đăng nhập" };
  }
  if (role && user.role !== role) {
    return { ok: false as const, status: 403, message: "Không đủ quyền" };
  }
  return { ok: true as const, user };
};

export const requireApiLocationViewer = async () => {
  const auth = await requireApiRole("ADMIN");
  if (!auth.ok) return auth;
  if (!auth.user.isLocationViewer) {
    return { ok: false as const, status: 403, message: "Không đủ quyền" };
  }
  return auth;
};
