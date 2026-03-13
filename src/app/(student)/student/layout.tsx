import { PortalShell } from "@/components/layout/portal-shell";
import { StudentLocationTracker } from "@/components/student/student-location-tracker";
import { requireRole } from "@/lib/auth";

const studentNav = [
  { label: "Tổng quan", href: "/student/dashboard" },
  { label: "Học phần", href: "/student/courses" },
  { label: "Đăng ký & phòng chờ", href: "/student/waiting" },
  { label: "Học phí", href: "/student/finance" },
];

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  await requireRole("STUDENT");

  return (
    <PortalShell title="Sinh viên" subtitle="Cổng đăng ký học phần thông minh" nav={studentNav}>
      <StudentLocationTracker />
      {children}
    </PortalShell>
  );
}
