"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { AuthShell } from "@/components/shared/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ChangePasswordPage() {
  const router = useRouter();
  const { status } = useSession();
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login?next=/change-password");
    }
  }, [router, status]);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (status !== "authenticated") {
      toast.error("Vui long dang nhap truoc khi doi mat khau");
      return;
    }

    setLoading(true);
    const response = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oldPassword, newPassword }),
    });
    const payload = await response.json();
    setLoading(false);

    if (!response.ok || !payload.success) {
      toast.error(payload.error?.message ?? "Khong the doi mat khau");
      return;
    }

    toast.success("Doi mat khau thanh cong");
  };

  if (status === "loading") {
    return (
      <AuthShell title="Doi mat khau" description="Dang kiem tra dang nhap...">
        <div className="flex justify-center py-8">
          <Loader2 className="size-5 animate-spin" />
        </div>
      </AuthShell>
    );
  }

  if (status === "unauthenticated") {
    return (
      <AuthShell title="Doi mat khau" description="Ban can dang nhap de tiep tuc">
        <Button className="primary-glow w-full" asChild>
          <Link href="/login?next=/change-password">Dang nhap</Link>
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Doi mat khau" description="Yeu cau dang nhap truoc khi doi mat khau">
      <form className="space-y-4" onSubmit={onSubmit}>
        <div className="space-y-2">
          <Label htmlFor="oldPassword">Mat khau cu</Label>
          <Input
            id="oldPassword"
            type="password"
            value={oldPassword}
            onChange={(event) => setOldPassword(event.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="newPassword">Mat khau moi</Label>
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
          Cap nhat mat khau
        </Button>
      </form>
    </AuthShell>
  );
}
