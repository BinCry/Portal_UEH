"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AuthShell } from "@/components/shared/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    const response = await fetch("/api/auth/reset-request-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    const payload = await response.json();
    setLoading(false);

    if (!response.ok || !payload.success) {
      toast.error(payload.error?.message ?? "Không thể gửi OTP");
      return;
    }

    toast.success("OTP đã được gửi nếu email tồn tại.");
  };

  return (
    <AuthShell
      title="Quên mật khẩu"
      description="Nhập email tài khoản để nhận OTP đặt lại mật khẩu"
      footer={
        <Link href="/reset-password" className="text-primary hover:underline">
          Đã có OTP? Đặt lại mật khẩu
        </Link>
      }
    >
      <form className="space-y-4" onSubmit={onSubmit}>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="student@ueh.edu.vn"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </div>
        <Button className="primary-glow w-full" type="submit" disabled={loading}>
          {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
          Gửi OTP
        </Button>
      </form>
    </AuthShell>
  );
}
