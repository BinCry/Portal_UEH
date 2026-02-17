import { z } from "zod";

export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(6),
});

export const otpRequestSchema = z.object({
  email: z.email(),
});

export const otpVerifySchema = z.object({
  email: z.email(),
  code: z.string().regex(/^\d{6}$/),
});

export const resetPasswordSchema = z.object({
  email: z.email(),
  code: z.string().regex(/^\d{6}$/),
  newPassword: z.string().min(6).max(128),
});

export const changePasswordSchema = z.object({
  oldPassword: z.string().min(6),
  newPassword: z.string().min(6).max(128),
});
