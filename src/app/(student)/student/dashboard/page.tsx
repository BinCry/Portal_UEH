import { Prisma } from "@prisma/client";
import { PageTransition } from "@/components/shared/page-transition";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function StudentDashboardPage() {
  const session = await requireRole("STUDENT");

  const [profile, enrollments, waitingStats, financeTotal] = await Promise.all([
    prisma.studentProfile.findUnique({
      where: { userId: session.user.id },
    }),
    prisma.enrollment.count({
      where: { studentId: session.user.id, status: "ENROLLED" },
    }),
    prisma.waitingEntry.count({
      where: {
        studentId: session.user.id,
        state: {
          in: ["QUEUED", "PENDING_ADMIN", "OFFERED"],
        },
      },
    }),
    prisma.financeLedger.aggregate({
      where: {
        studentId: session.user.id,
        status: "POSTED",
      },
      _sum: {
        amount: true,
      },
    }),
  ]);

  const totalPosted = new Prisma.Decimal(financeTotal._sum.amount ?? 0).toNumber();

  return (
    <PageTransition>
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="glass-card border-cyan-200/70">
          <CardHeader>
            <CardTitle>Thông tin sinh viên</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p className="font-semibold">{profile?.fullName ?? "Sinh viên"}</p>
            <p className="text-muted-foreground">MSSV: {profile?.studentCode ?? "--"}</p>
            <p className="text-muted-foreground">{profile?.faculty ?? "Chưa cập nhật ngành"}</p>
          </CardContent>
        </Card>

        <Card className="glass-card border-emerald-200/80">
          <CardHeader>
            <CardTitle>Học phần đã đăng ký</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-sans tabular-nums text-4xl font-semibold">{enrollments}</p>
          </CardContent>
        </Card>

        <Card className="glass-card border-amber-200/90">
          <CardHeader>
            <CardTitle>Yêu cầu phòng chờ</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-sans tabular-nums text-4xl font-semibold">{waitingStats}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="glass-card border-violet-200/80">
        <CardHeader>
          <CardTitle>Tổng học phí đã ghi nhận</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="font-sans tabular-nums text-3xl font-semibold">{totalPosted.toLocaleString("vi-VN")} VND</p>
        </CardContent>
      </Card>
    </PageTransition>
  );
}
