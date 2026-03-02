"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const normalizeAccountToEmail = (value: string) => {
  const normalized = value.trim();
  if (!normalized) return "";
  if (normalized.includes("@")) return normalized.toLowerCase();
  return `${normalized}@ueh.edu.vn`;
};

export default function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefilledAccount = searchParams.get("email") ?? "";

  const [needsAccountInput, setNeedsAccountInput] = useState(!prefilledAccount);
  const [accountInput, setAccountInput] = useState(prefilledAccount);
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);

    const email = normalizeAccountToEmail(accountInput);

    if (!email || !otp || !newPassword || !confirmPassword) {
      setError("Vui lòng điền đầy đủ các thông tin.");
      setIsLoading(false);
      return;
    }

    if (!/^\d{6}$/.test(otp)) {
      setError("Mã xác thực phải gồm đúng 6 chữ số.");
      setIsLoading(false);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Mật khẩu xác nhận không khớp.");
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code: otp, newPassword }),
      });

      const payload = await response.json();

      if (!response.ok || !payload.success) {
        setError(payload.error?.message ?? "Mã xác thực không hợp lệ hoặc đã hết hạn.");
        return;
      }

      setSuccess("Mật khẩu của bạn đã được cập nhật thành công!");
      window.setTimeout(() => {
        router.push("/login");
      }, 3000);
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
          <div className="relative mb-4 h-20 w-20">
            <Image src="/ueh.png" alt="UEH Logo" fill className="object-contain" priority />
          </div>
          <h1 className="text-center text-2xl font-bold text-[#0f3b46]">Đặt lại mật khẩu</h1>
          <p className="mt-2 text-center text-sm font-medium text-gray-500">
            Nhập mã xác thực (OTP) và thiết lập mật khẩu mới.
          </p>
        </div>

        {error ? (
          <div className="animate-in slide-in-from-top-2 fade-in mb-6 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-600 duration-300">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <p className="font-medium leading-relaxed">{error}</p>
          </div>
        ) : null}

        {success ? (
          <div className="animate-in zoom-in-95 flex flex-col items-center justify-center space-y-4 p-4 text-center duration-300">
            <div className="mb-2 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <p className="text-lg font-bold text-emerald-700">{success}</p>
            <p className="text-sm text-gray-500">Đang tự động chuyển hướng về trang Đăng nhập...</p>
            <Link href="/login" className="mt-4">
              <Button className="rounded-xl bg-[#0f3b46] px-8 text-white">Đăng nhập ngay</Button>
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {needsAccountInput ? (
              <div className="space-y-2">
                <Label htmlFor="account" className="ml-1 font-semibold text-gray-700">
                  Email / Mã sinh viên
                </Label>
                <Input
                  id="account"
                  type="text"
                  placeholder="Ví dụ: 3120102... hoặc email@st.ueh.edu.vn"
                  className="h-12 rounded-xl border-gray-200 bg-gray-50 focus-visible:ring-[#0f3b46]"
                  value={accountInput}
                  onChange={(event) => setAccountInput(event.target.value)}
                  disabled={isLoading}
                />
              </div>
            ) : (
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-600">
                Tài khoản khôi phục: <span className="font-semibold">{accountInput}</span>
                <Button
                  type="button"
                  variant="link"
                  className="ml-1 h-auto p-0 text-xs font-semibold text-[#0f3b46]"
                  onClick={() => setNeedsAccountInput(true)}
                >
                  Đổi tài khoản
                </Button>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="otp" className="ml-1 font-semibold text-gray-700">
                Mã xác thực (OTP)
              </Label>
              <Input
                id="otp"
                type="text"
                placeholder="Nhập mã 6 số..."
                className="h-12 rounded-xl border-gray-200 bg-gray-50 text-center text-lg font-semibold tracking-widest focus-visible:ring-[#0f3b46]"
                value={otp}
                onChange={(event) => setOtp(event.target.value)}
                disabled={isLoading}
                maxLength={6}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="newPassword" className="ml-1 font-semibold text-gray-700">
                Mật khẩu mới
              </Label>
              <Input
                id="newPassword"
                type="password"
                placeholder="Nhập mật khẩu mới..."
                className="h-12 rounded-xl border-gray-200 bg-gray-50 focus-visible:ring-[#0f3b46]"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="ml-1 font-semibold text-gray-700">
                Xác nhận mật khẩu
              </Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Nhập lại mật khẩu mới..."
                className="h-12 rounded-xl border-gray-200 bg-gray-50 focus-visible:ring-[#0f3b46]"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                disabled={isLoading}
              />
            </div>

            <Button
              type="submit"
              className="mt-6 h-12 w-full rounded-xl bg-[#0f3b46] text-base font-bold text-white transition-all hover:bg-[#0f3b46]/90 active:scale-[0.98]"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Đang xử lý...
                </>
              ) : (
                "Cập nhật mật khẩu"
              )}
            </Button>
          </form>
        )}

        {!success ? (
          <div className="mt-6 text-center">
            <Link
              href="/login"
              className="inline-flex items-center text-sm font-semibold text-gray-500 transition-colors hover:text-[#0f3b46]"
            >
              <ArrowLeft className="mr-1.5 h-4 w-4" /> Trở về
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}
