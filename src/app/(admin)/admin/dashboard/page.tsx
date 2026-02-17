import { PageTransition } from "@/components/shared/page-transition";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function AdminDashboardPage() {
  await requireRole("ADMIN");

  const [courses, sections, waitingRooms, pendingApprovals, students] = await Promise.all([
    prisma.course.count(),
    prisma.section.count(),
    prisma.waitingRoom.count({ where: { isActive: true } }),
    prisma.approval.count({ where: { status: "PENDING" } }),
    prisma.user.count({ where: { role: "STUDENT" } }),
  ]);

  const stats = [
    { label: "Học phần", value: courses, className: "border-emerald-200/80" },
    { label: "Lớp học phần", value: sections, className: "border-cyan-200/80" },
    { label: "Phòng chờ đang mở", value: waitingRooms, className: "border-amber-200/90" },
    { label: "Phê duyệt chờ xử lý", value: pendingApprovals, className: "border-violet-200/80" },
    { label: "Tài khoản sinh viên", value: students, className: "border-pink-200/80" },
  ];

  return (
    <PageTransition>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {stats.map((stat) => (
          <Card key={stat.label} className={`glass-card ${stat.className}`}>
            <CardHeader>
              <CardTitle className="text-sm">{stat.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-sans tabular-nums text-4xl font-semibold">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </PageTransition>
  );
}
