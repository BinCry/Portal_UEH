"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AuthShell } from "@/components/shared/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ChangePasswordPage() {
  const [email, setEmail] = useState("");
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);

    const response = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, oldPassword, newPassword }),
    });
    const payload = await response.json();
    setLoading(false);

    if (!response.ok || !payload.success) {
      toast.error(payload.error?.message ?? "Không thể đổi mật khẩu");
      return;
    }

    toast.success("Đổi mật khẩu thành công");
    setOldPassword("");
    setNewPassword("");
  };

  return (
    <AuthShell title="Đổi mật khẩu" description="Nhập tài khoản, mật khẩu cũ và mật khẩu mới để cập nhật">
      <form className="space-y-4" onSubmit={onSubmit}>
        <div className="rounded-xl border border-cyan-200/70 bg-cyan-50/60 p-3 text-xs text-slate-700">
          Luồng này không yêu cầu đăng nhập trước. Bạn cần nhập đúng email và mật khẩu hiện tại của tài khoản.
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email tài khoản</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@ueh.edu.vn"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="oldPassword">Mật khẩu cũ</Label>
          <Input
            id="oldPassword"
            type="password"
            value={oldPassword}
            onChange={(event) => setOldPassword(event.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="newPassword">Mật khẩu mới</Label>
          <Input
            id="newPassword"
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            required
          />
        </div>
        <Button className="primary-glow w-full" type="submit" disabled={loading}>
          {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
          Cập nhật mật khẩu
        </Button>
      </form>
    </AuthShell>
  );
}
