import { fail, ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { verifyOtpHash } from "@/lib/security/otp";
import { otpVerifySchema } from "@/lib/zod-schemas/auth";
import { now } from "@/lib/time";

export async function POST(request: Request) {
  try {
    const body = await parseBody(request, otpVerifySchema);
    const user = await prisma.user.findUnique({
      where: { email: body.email.toLowerCase() },
    });

    if (!user) {
      return fail({ code: "INVALID_OTP", message: "OTP không hợp lệ" }, 400);
    }

    const otp = await prisma.passwordResetOtp.findFirst({
      where: {
        userId: user.id,
        consumedAt: null,
      },
      orderBy: { createdAt: "desc" },
    });

    if (!otp || otp.expiresAt <= now()) {
      return fail({ code: "OTP_EXPIRED", message: "OTP đã hết hạn" }, 400);
    }

    const isValid = verifyOtpHash(body.code, otp.codeHash);
    await prisma.passwordResetOtp.update({
      where: { id: otp.id },
      data: {
        attemptCount: { increment: 1 },
      },
    });

    if (!isValid) {
      return fail({ code: "INVALID_OTP", message: "OTP không đúng" }, 400);
    }

    return ok({
      verified: true,
      message: "OTP hợp lệ",
    });
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
