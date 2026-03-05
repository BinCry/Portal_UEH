"use client";

import { ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { NotificationBell } from "@/components/shared/notification-bell";
import { SignOutButton } from "@/components/shared/sign-out-button";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PortalShellNavItem = {
  label: string;
  href: string;
};

interface PortalShellProps {
  children: ReactNode;
  userRole?: "STUDENT" | "ADMIN";
  title?: string;
  subtitle?: string;
  nav?: PortalShellNavItem[];
}

export const PortalShell = ({ children, userRole, nav = [] }: PortalShellProps) => {
  const pathname = usePathname();
  const resolvedRole = userRole ?? (pathname.startsWith("/admin") ? "ADMIN" : "STUDENT");
  const navItems = nav;

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="flex min-h-screen flex-col bg-[#f8f9fa] font-sans text-gray-800">
      <header className="sticky top-0 z-50 w-full border-b border-gray-200 bg-white shadow-sm">
        <div className="container mx-auto flex h-16 items-center justify-between px-4 md:px-6">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center overflow-hidden rounded-full border border-gray-200 bg-white">
              <Image src="/ueh.png" alt="UEH logo" width={32} height={32} className="size-8 object-contain" priority />
            </div>
            <div className="flex flex-col">
              <Link
                href={resolvedRole === "STUDENT" ? "/student/courses" : "/admin/dashboard"}
                className="text-[#0f3b46] leading-tight font-bold uppercase md:text-lg"
              >
                Cổng Đăng Ký Tín Chỉ Thông Minh
              </Link>
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-4">
            {resolvedRole === "STUDENT" ? (
              <div className="pt-1">
                <NotificationBell />
              </div>
            ) : null}

            <div className="hidden h-6 w-px bg-gray-300 sm:block" />
            <SignOutButton />

            <Button variant="ghost" size="icon" className="md:hidden">
              <Menu className="size-5 text-gray-700" />
            </Button>
          </div>
        </div>
      </header>
      {navItems.length ? (
        <div className="border-b border-gray-200 bg-white">
          <div className="container mx-auto flex items-center gap-2 overflow-x-auto px-4 py-2 md:px-6">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                prefetch={false}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap",
                  isActive(item.href)
                    ? "bg-[#0f3b46] text-white"
                    : "text-gray-700 hover:bg-gray-100",
                )}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      <main className="container mx-auto flex-1 px-4 py-8 md:px-6">
        <div className="mx-auto min-h-[70vh] max-w-[1200px] rounded-md border border-gray-200 bg-white p-4 shadow-sm md:p-6">
          {children}
        </div>
      </main>

      <footer className="mt-auto border-t border-gray-200 bg-white py-4">
        <div className="container mx-auto px-4 text-center text-xs text-gray-500">
          <p>© 2026 UEH - Design Thinking.</p>
        </div>
      </footer>
    </div>
  );
};

