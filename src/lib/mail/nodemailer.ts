import nodemailer from "nodemailer";

export const createMailerTransport = () =>
  nodemailer.createTransport({
    host: process.env.MAIL_HOST,
    port: Number(process.env.MAIL_PORT ?? 1025),
    secure: process.env.MAIL_SECURE === "true",
    auth:
      process.env.MAIL_USER && process.env.MAIL_PASS
        ? {
            user: process.env.MAIL_USER,
            pass: process.env.MAIL_PASS,
          }
        : undefined,
  });
