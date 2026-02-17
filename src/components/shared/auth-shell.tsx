import Link from "next/link";

export const AuthShell = ({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) => (
  <div className="subtle-grid relative flex min-h-screen items-center justify-center px-4 py-10">
    <div className="pointer-events-none absolute left-[16%] top-10 h-64 w-64 rounded-full bg-cyan-300/40 blur-3xl" />
    <div className="pointer-events-none absolute bottom-8 right-[12%] h-60 w-60 rounded-full bg-amber-200/35 blur-3xl" />
    <div className="pointer-events-none absolute right-[32%] top-[18%] h-48 w-48 rounded-full bg-indigo-300/25 blur-3xl" />

    <div className="glass-card panel-fade relative w-full max-w-md overflow-hidden p-7">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-emerald-300/35 via-cyan-300/20 to-transparent" />
      <div className="relative mb-6">
        <p className="text-primary mb-2 text-xs tracking-[0.2em] uppercase">UEH Registration Portal</p>
        <h1 className="font-display text-3xl leading-tight font-semibold tracking-tight text-slate-800">{title}</h1>
        <p className="text-muted-foreground mt-2 text-sm">{description}</p>
      </div>

      <div className="relative">{children}</div>

      {footer ? <div className="mt-6 text-sm">{footer}</div> : null}
      <p className="text-muted-foreground mt-5 text-center text-xs">
        Cổng đăng ký học phần thông minh.{" "}
        <Link href="/login" className="text-primary font-medium hover:underline">
          Đăng nhập
        </Link>
      </p>
    </div>
  </div>
);
