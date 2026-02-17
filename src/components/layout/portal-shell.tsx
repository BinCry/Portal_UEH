"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NotificationBell } from "@/components/shared/notification-bell";
import { SignOutButton } from "@/components/shared/sign-out-button";

type NavItem = {
  label: string;
  href: string;
};

export const PortalShell = ({
  title,
  subtitle,
  nav,
  children,
}: {
  title: string;
  subtitle?: string;
  nav: NavItem[];
  children: React.ReactNode;
}) => {
  const currentPath = usePathname();
  const isActive = (href: string) => currentPath === href || currentPath.startsWith(`${href}/`);

  return (
    <div className="relative mx-auto flex min-h-screen w-full max-w-[1600px] gap-4 overflow-hidden p-4 lg:p-6">
      <div className="pointer-events-none absolute -right-20 -top-28 h-96 w-96 rounded-full bg-cyan-300/35 blur-3xl" />
      <div className="pointer-events-none absolute -left-12 bottom-0 h-96 w-96 rounded-full bg-amber-200/25 blur-3xl" />
      <div className="pointer-events-none absolute left-[45%] top-[15%] h-72 w-72 rounded-full bg-emerald-200/20 blur-3xl" />

      <aside className="glass-card panel-fade sticky top-4 hidden h-[calc(100vh-2rem)] w-72 flex-col p-5 lg:flex">
        <div className="rounded-2xl border border-cyan-200/70 bg-gradient-to-br from-white/95 to-cyan-50/55 p-4">
          <p className="text-primary text-[11px] font-semibold tracking-[0.18em] uppercase">UEH Registration Portal</p>
          <h2 className="font-display mt-2 text-xl font-semibold leading-tight">{title}</h2>
          {subtitle ? <p className="text-muted-foreground mt-1 text-sm leading-relaxed">{subtitle}</p> : null}
        </div>
        <nav className="mt-8 space-y-2">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "block rounded-xl px-3 py-2 text-sm font-medium transition duration-200",
                isActive(item.href)
                  ? "rainbow-chip shadow-[0_8px_18px_rgba(44,115,223,0.35)]"
                  : "text-foreground bg-white/45 hover:bg-cyan-50",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="flex-1">
        <header className="glass-card panel-fade mb-4 flex items-center justify-between bg-gradient-to-r from-white/90 via-cyan-50/70 to-amber-50/70 p-4">
          <div>
            <p className="text-primary text-[11px] font-semibold tracking-[0.18em] uppercase">UEH Registration Portal</p>
            <h1 className="font-display text-2xl font-semibold text-slate-800">{title}</h1>
            {subtitle ? <p className="text-muted-foreground text-sm">{subtitle}</p> : null}
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell />
            <SignOutButton />
          </div>
        </header>
        <nav className="glass-card panel-fade mb-4 flex gap-2 overflow-x-auto p-2 lg:hidden">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition",
                isActive(item.href) ? "rainbow-chip" : "bg-background/70 hover:bg-cyan-50",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="space-y-4">{children}</div>
      </main>
    </div>
  );
};
