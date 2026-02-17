import { UserStatus } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { verifyOtpHash } from "@/lib/security/otp";
import { hashPassword } from "@/lib/security/password";
import { resetPasswordSchema } from "@/lib/zod-schemas/auth";
import { now } from "@/lib/time";

export async function POST(request: Request) {
  try {
    const body = await parseBody(request, resetPasswordSchema);
    const user = await prisma.user.findUnique({
      where: { email: body.email.toLowerCase() },
    });
    if (!user) {
      return fail({ code: "INVALID_REQUEST", message: "Thông tin không hợp lệ" }, 400);
    }

    const otp = await prisma.passwordResetOtp.findFirst({
      where: {
        userId: user.id,
        consumedAt: null,
      },
      orderBy: { createdAt: "desc" },
    });
    if (!otp || otp.expiresAt <= now() || !verifyOtpHash(body.code, otp.codeHash)) {
      return fail({ code: "INVALID_OTP", message: "OTP không hợp lệ hoac het han" }, 400);
    }

    const newHash = await hashPassword(body.newPassword);
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash: newHash,
          status: UserStatus.ACTIVE,
          failedLoginAttempts: 0,
          lastFailedLoginAt: null,
          lockUntil: null,
        },
      }),
      prisma.passwordResetOtp.update({
        where: { id: otp.id },
        data: {
          consumedAt: now(),
        },
      }),
    ]);

    return ok({ message: "Đặt lại mật khẩu thành công" });
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

