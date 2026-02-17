import crypto from "node:crypto";
import { OTP_LENGTH } from "@/lib/constants";

export const generateOtpCode = () => {
  let code = "";
  for (let i = 0; i < OTP_LENGTH; i += 1) {
    code += crypto.randomInt(0, 10).toString();
  }
  return code;
};

export const hashOtp = (code: string) => crypto.createHash("sha256").update(code).digest("hex");

export const verifyOtpHash = (code: string, hash: string) => hashOtp(code) === hash;
