"use client";

import { useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AuthShell } from "@/components/shared/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const params = useSearchParams();
  const [email, setEmail] = useState("student1@ueh.edu.vn");
  const [password, setPassword] = useState("123456");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);

    const nextParam = params.get("next");
    const callbackUrl = nextParam && nextParam.startsWith("/") ? nextParam : "/";

    const response = await signIn("credentials", {
      email,
      password,
      redirect: false,
      callbackUrl,
    });

    setLoading(false);

    if (!response || response.error) {
      toast.error("Đăng nhập thất bại. Vui lòng kiểm tra lại thông tin.");
      return;
    }

    window.location.href = callbackUrl;
  };

  return (
    <AuthShell title="Đăng nhập" description="Cổng đăng ký học phần thông minh">
      <form className="space-y-4" onSubmit={onSubmit}>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="you@ueh.edu.vn"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Mật khẩu</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </div>
        <Button className="primary-glow w-full" type="submit" disabled={loading}>
          {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
          Đăng nhập
        </Button>
      </form>
      <div className="mt-4 flex items-center justify-between text-sm">
        <Link href="/forgot-password" className="text-primary hover:underline">
          Quên mật khẩu?
        </Link>
        <Link href="/change-password" className="text-primary hover:underline">
          Đổi mật khẩu
        </Link>
      </div>
    </AuthShell>
  );
}
