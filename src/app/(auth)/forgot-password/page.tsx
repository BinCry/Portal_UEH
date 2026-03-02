"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { AlertCircle, ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const normalizeAccountToEmail = (value: string) => {
  const normalized = value.trim();
  if (!normalized) return "";
  if (normalized.includes("@")) return normalized.toLowerCase();
  return `${normalized}@st.ueh.edu.vn`;
};

export default function ForgotPasswordPage() {
  const [accountInput, setAccountInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [resetHref, setResetHref] = useState("/reset-password");

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    setSuccess(null);

    const email = normalizeAccountToEmail(accountInput);

    if (!email) {
      setError("Vui lòng nhập email sinh viên của bạn.");
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch("/api/auth/reset-request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const payload = await response.json();

      if (!response.ok || !payload.success) {
        setError(payload.error?.message ?? "Không tìm thấy tài khoản trong hệ thống.");
        return;
      }

      setSuccess("Mã xác thực (OTP) đã được gửi đến email của bạn. Vui lòng kiểm tra hộp thư.");
      setResetHref(`/reset-password?email=${encodeURIComponent(email)}`);
    } catch {
      setError("Đã xảy ra lỗi hệ thống, vui lòng thử lại sau.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f3f4f6] p-4">
      <div className="w-full max-w-md rounded-[24px] border border-gray-100 bg-white p-8 shadow-2xl transition-all">
        <div className="mb-6 flex flex-col items-center">
          <div className="relative mb-4 h-24 w-24">
            <Image src="/ueh.png" alt="UEH Logo" fill className="object-contain" priority />
          </div>
          <h1 className="text-center text-2xl font-bold text-[#0f3b46]">Quên mật khẩu</h1>
          <p className="mt-2 text-center text-sm font-medium leading-relaxed text-gray-500">
            Nhập email sinh viên của bạn để nhận mã khôi phục tài khoản.
          </p>
        </div>

        {error ? (
          <div className="animate-in slide-in-from-top-2 fade-in mb-6 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-600 duration-300">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <p className="font-medium leading-relaxed">{error}</p>
          </div>
        ) : null}

        {success ? (
          <div className="animate-in slide-in-from-top-2 fade-in mb-6 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700 duration-300">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
            <div className="space-y-2">
              <p className="font-medium leading-relaxed">{success}</p>
              <Link href={resetHref}>
                <Button
                  variant="outline"
                  className="mt-1 h-9 rounded-lg border-emerald-300 text-emerald-700 hover:bg-emerald-100"
                >
                  Tiếp tục đặt lại mật khẩu
                </Button>
              </Link>
            </div>
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="account" className="ml-1 font-semibold text-gray-700">
              Email sinh viên
            </Label>
            <Input
              id="account"
              type="text"
              placeholder="email@ueh.edu.vn"
              className="h-12 rounded-xl border-gray-200 bg-gray-50 transition-all focus-visible:ring-[#0f3b46]"
              value={accountInput}
              onChange={(event) => setAccountInput(event.target.value)}
              disabled={isLoading || Boolean(success)}
            />
          </div>

          {!success ? (
            <Button
              type="submit"
              className="mt-4 h-12 w-full rounded-xl bg-[#0f3b46] text-base font-bold text-white transition-all hover:bg-[#0f3b46]/90 active:scale-[0.98]"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Đang gửi yêu cầu...
                </>
              ) : (
                "Gửi mã khôi phục"
              )}
            </Button>
          ) : null}
        </form>

        <div className="mt-6 text-center">
          <Link
            href="/login"
            className="inline-flex items-center text-sm font-semibold text-gray-500 transition-colors hover:text-[#0f3b46]"
          >
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Quay lại trang Đăng nhập
          </Link>
        </div>
      </div>
    </div>
  );
}
