import { fail, ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/route-guards";
import { hashPassword, verifyPassword } from "@/lib/security/password";
import { changePasswordSchema } from "@/lib/zod-schemas/auth";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return fail({ code: "UNAUTHORIZED", message: "Chưa đăng nhập" }, 401);
  }

  try {
    const body = await parseBody(request, changePasswordSchema);
    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    if (!dbUser) {
      return fail({ code: "NOT_FOUND", message: "Không tìm thấy tài khoản" }, 404);
    }

    const oldPasswordValid = await verifyPassword(body.oldPassword, dbUser.passwordHash);
    if (!oldPasswordValid) {
      return fail({ code: "INVALID_PASSWORD", message: "Mật khẩu cũ không đúng" }, 400);
    }

    const hash = await hashPassword(body.newPassword);
    await prisma.user.update({
      where: { id: dbUser.id },
      data: { passwordHash: hash },
    });

    return ok({ message: "Đổi mật khẩu thành công" });
  } catch (error) {
    return fail(
      {
        code: "INVALID_REQUEST",
        message: "Dữ liệu không hợp lệ",
        details: error,
      },
      400,
    );
  }
}

