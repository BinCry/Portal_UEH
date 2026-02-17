"use client";

import { LogOut } from "lucide-react";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";

export const SignOutButton = () => (
  <Button variant="outline" onClick={() => signOut({ callbackUrl: "/login" })}>
    <LogOut className="mr-2 size-4" />
    Đăng xuất
  </Button>
);
