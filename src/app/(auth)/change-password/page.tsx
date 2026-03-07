"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowLeft, CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type AuthSession = {
  user?: {
    email?: string | null;
  };
};

const normalizeAccountToEmail = (value: string) => {
  const normalized = value.trim();
  if (!normalized) return "";
  if (normalized.includes("@")) return normalized.toLowerCase();
  return `${normalized}@ueh.edu.vn`;
};

export default function ChangePasswordPage() {
  const router = useRouter();
  const [sessionEmail, setSessionEmail] = useState("");
  const [manualAccountInput, setManualAccountInput] = useState("");
  const [isResolvingAccount, setIsResolvingAccount] = useState(true);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const fetchSession = async () => {
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store" });
        if (!response.ok) return;

        const session = (await response.json()) as AuthSession;
        const email = session.user?.email?.toString() ?? "";

        if (isMounted && email.trim()) {
          setSessionEmail(email.toLowerCase());
        }
      } catch {
      } finally {
        if (isMounted) {
          setIsResolvingAccount(false);
        }
      }
    };

    void fetchSession();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);

    const email = sessionEmail || normalizeAccountToEmail(manualAccountInput);

    if (!email || !currentPassword || !newPassword || !confirmPassword) {
      setError("Vui lòng điền đầy đủ các thông tin.");
      setIsLoading(false);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Mật khẩu xác nhận không khớp với mật khẩu mới.");
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, oldPassword: currentPassword, newPassword }),
      });

      const payload = await response.json();

      if (!response.ok || !payload.success) {
        setError(payload.error?.message ?? "Mật khẩu hiện tại không chính xác.");
        return;
      }

      setSuccess("Đổi mật khẩu thành công. Lần đăng nhập tiếp theo vui lòng sử dụng mật khẩu mới.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      setError("Đã xảy ra lỗi hệ thống, vui lòng thử lại sau.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#f3f4f6] p-4">
      <div className="mb-4 w-full max-w-md">
        <Button
          variant="ghost"
          className="-ml-2 text-gray-500 hover:bg-transparent hover:text-[#0f3b46]"
          onClick={() => router.back()}
        >
          <ArrowLeft className="mr-2 h-5 w-5" /> Quay lại
        </Button>
      </div>

      <div className="w-full max-w-md rounded-[24px] border border-gray-100 bg-white p-8 shadow-2xl transition-all">
        <div className="mb-6 flex flex-col items-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#0f3b46]/10 text-[#0f3b46]">
            <ShieldCheck className="h-8 w-8" />
          </div>
          <h1 className="text-center text-2xl font-bold text-[#0f3b46]">Đổi mật khẩu</h1>
          <p className="mt-2 text-center text-sm font-medium text-gray-500">
            Đảm bảo tài khoản của bạn đang sử dụng một mật khẩu mạnh và an toàn.
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
            <p className="font-medium leading-relaxed">{success}</p>
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-4">
          {sessionEmail ? (
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-600">
              Tài khoản: <span className="font-semibold">{sessionEmail}</span>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="account" className="ml-1 font-semibold text-gray-700">
                Email / Mã sinh viên
              </Label>
              <Input
                id="account"
                type="text"
                placeholder="Ví dụ: 3120102... hoặc email@st.ueh.edu.vn"
                className="h-12 rounded-xl border-gray-200 bg-gray-50 focus-visible:ring-[#0f3b46]"
                value={manualAccountInput}
                onChange={(event) => setManualAccountInput(event.target.value)}
                disabled={isLoading || isResolvingAccount}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="currentPassword" className="ml-1 font-semibold text-gray-700">
              Mật khẩu hiện tại
            </Label>
            <Input
              id="currentPassword"
              type="password"
              placeholder="Nhập mật khẩu đang sử dụng..."
              className="h-12 rounded-xl border-gray-200 bg-gray-50 focus-visible:ring-[#0f3b46]"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              disabled={isLoading}
            />
          </div>

          <div className="space-y-2 border-t border-gray-100 pt-2">
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
              Xác nhận mật khẩu mới
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
            disabled={isLoading || isResolvingAccount}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Đang cập nhật...
              </>
            ) : (
              "Lưu thay đổi"
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
