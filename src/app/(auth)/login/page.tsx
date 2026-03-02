"use client";

import { Suspense, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const normalizeAccountToEmail = (value: string) => {
  const normalized = value.trim();
  if (!normalized) return "";
  if (normalized.includes("@")) return normalized.toLowerCase();
  return `${normalized}@st.ueh.edu.vn`;
};

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const callbackParam = searchParams.get("callbackUrl") ?? searchParams.get("next") ?? "/student/courses";
  const callbackUrl = callbackParam.startsWith("/") ? callbackParam : "/student/courses";
  const urlError = searchParams.get("error");

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    urlError === "CredentialsSignin" ? "Tên đăng nhập hoặc mật khẩu không chính xác." : null,
  );

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);

    if (!username || !password) {
      setError("Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu.");
      setIsLoading(false);
      return;
    }

    try {
      const email = normalizeAccountToEmail(username);
      const response = await signIn("credentials", {
        redirect: false,
        email,
        password,
        callbackUrl,
      });

      if (!response || response.error) {
        setError("Tên đăng nhập hoặc mật khẩu không chính xác.");
        return;
      }

      router.push(response.url ?? callbackUrl);
    } catch {
      setError("Đã xảy ra lỗi hệ thống, vui lòng thử lại sau.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md rounded-[24px] border border-gray-100 bg-white p-8 shadow-2xl transition-all">
      <div className="mb-8 flex flex-col items-center">
        <div className="relative mb-4 h-28 w-28">
          <Image src="/ueh.png" alt="UEH Logo" fill className="object-contain" priority />
        </div>
        <h1 className="text-center text-2xl font-bold text-[#0f3b46]">Đăng nhập hệ thống</h1>
        <p className="mt-2 text-center text-sm font-medium text-gray-500">Cổng Đăng Ký Tín Chỉ Thông Minh</p>
      </div>

      {error ? (
        <div className="animate-in slide-in-from-top-2 fade-in mb-6 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-600 duration-300">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <p className="font-medium leading-relaxed">{error}</p>
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="username" className="ml-1 font-semibold text-gray-700">
            Tên đăng nhập
          </Label>
          <Input
            id="username"
            type="text"
            placeholder="Nhập email sinh viên"
            className="h-12 rounded-xl border-gray-200 bg-gray-50 transition-all focus-visible:ring-[#0f3b46]"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            disabled={isLoading}
          />
        </div>

        <div className="space-y-2">
          <div className="ml-1 flex items-center justify-between">
            <Label htmlFor="password" className="font-semibold text-gray-700">
              Mật khẩu
            </Label>
            <Link
              href="/forgot-password"
              className="text-sm font-semibold text-blue-600 hover:text-blue-800 hover:underline"
            >
              Quên mật khẩu?
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            placeholder="Nhập mật khẩu"
            className="h-12 rounded-xl border-gray-200 bg-gray-50 transition-all focus-visible:ring-[#0f3b46]"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={isLoading}
          />
        </div>

        <Button
          type="submit"
          className="mt-4 h-12 w-full rounded-xl bg-[#0f3b46] text-base font-bold text-white transition-all hover:bg-[#0f3b46]/90 active:scale-[0.98]"
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Đang xác thực...
            </>
          ) : (
            "Đăng nhập"
          )}
        </Button>
      </form>

      <div className="mt-8 border-t border-gray-100 pt-6 text-center text-xs font-medium text-gray-400">
        <p>© 2026 UEH - Design Thinking.</p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f3f4f6] p-4">
      <Suspense
        fallback={
          <div className="flex flex-col items-center">
            <Loader2 className="h-8 w-8 animate-spin text-[#0f3b46]" />
            <p className="mt-4 text-sm font-medium text-gray-500">Đang tải biểu mẫu...</p>
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </div>
  );
}

