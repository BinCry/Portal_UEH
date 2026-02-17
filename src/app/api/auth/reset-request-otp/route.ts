import { OTP_EXPIRE_MINUTES, OTP_RATE_LIMIT_MAX_REQUESTS, OTP_RATE_LIMIT_WINDOW_MINUTES } from "@/lib/constants";
import { parseBody } from "@/lib/http";
import { sendOtpEmail } from "@/lib/mail/provider";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { generateOtpCode, hashOtp } from "@/lib/security/otp";
import { otpRequestSchema } from "@/lib/zod-schemas/auth";
import { fail, ok } from "@/lib/api";
import { addMinutesFromNow } from "@/lib/time";

export async function POST(request: Request) {
  try {
    const body = await parseBody(request, otpRequestSchema);
    const email = body.email.toLowerCase();

    const clientIp = request.headers.get("x-forwarded-for") ?? "unknown";
    const limiterKey = `${email}:${clientIp}`;
    const limitResult = consumeRateLimit(
      limiterKey,
      OTP_RATE_LIMIT_MAX_REQUESTS,
      OTP_RATE_LIMIT_WINDOW_MINUTES,
    );
    if (!limitResult.allowed) {
      return fail(
        {
          code: "RATE_LIMIT",
          message: "Ban da gui OTP qua nhieu lan, vui long thu lai sau.",
        },
        429,
      );
    }

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (user) {
      const code = generateOtpCode();
      await prisma.passwordResetOtp.create({
        data: {
          userId: user.id,
          codeHash: hashOtp(code),
          expiresAt: addMinutesFromNow(OTP_EXPIRE_MINUTES),
          lastSentAt: new Date(),
        },
      });
      await sendOtpEmail({
        to: user.email,
        code,
        expiresInMinutes: OTP_EXPIRE_MINUTES,
      });
    }

    return ok({
      message: "Nếu email tồn tại, mã OTP đã được gửi.",
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
