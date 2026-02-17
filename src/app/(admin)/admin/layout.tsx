import { PortalShell } from "@/components/layout/portal-shell";
import { requireRole } from "@/lib/auth";

const adminNav = [
  { label: "Tổng quan", href: "/admin/dashboard" },
  { label: "Học phần", href: "/admin/courses" },
  { label: "Lớp học phần", href: "/admin/sections" },
  { label: "Phòng chờ", href: "/admin/waiting-rooms" },
  { label: "Người dùng", href: "/admin/users" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireRole("ADMIN");
  return (
    <PortalShell title="Phòng đào tạo" subtitle="Quản trị đăng ký học phần" nav={adminNav}>
      {children}
    </PortalShell>
  );
}
