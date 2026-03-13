import { PortalShell } from "@/components/layout/portal-shell";
import { requireRole } from "@/lib/auth";

const baseAdminNav = [
  { label: "Tổng quan", href: "/admin/dashboard" },
  { label: "Học phần", href: "/admin/courses" },
  { label: "Lớp học phần", href: "/admin/sections" },
  { label: "Phòng chờ", href: "/admin/waiting-rooms" },
  { label: "Người dùng", href: "/admin/users" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole("ADMIN");
  const adminNav = session.user.isLocationViewer
    ? [...baseAdminNav.slice(0, 4), { label: "Vị trí SV", href: "/admin/student-locations" }, baseAdminNav[4]]
    : baseAdminNav;

  return (
    <PortalShell title="Phòng đào tạo" subtitle="Quản trị đăng ký học phần" nav={adminNav}>
      {children}
    </PortalShell>
  );
}
