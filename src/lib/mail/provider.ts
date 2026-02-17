import { createMailerTransport } from "@/lib/mail/nodemailer";

type SendOtpInput = {
  to: string;
  code: string;
  expiresInMinutes: number;
};

export const sendOtpEmail = async ({ to, code, expiresInMinutes }: SendOtpInput) => {
  const transport = createMailerTransport();
  const from = process.env.MAIL_FROM ?? "noreply@ueh.local";

  await transport.sendMail({
    from,
    to,
    subject: "[UEH] Mã OTP đặt lại mật khẩu",
    text: `Mã OTP của bạn là ${code}. Hết hạn sau ${expiresInMinutes} phút.`,
    html: `<p>Mã OTP của bạn là <strong>${code}</strong>.</p><p>Hết hạn sau ${expiresInMinutes} phút.</p>`,
  });
};
