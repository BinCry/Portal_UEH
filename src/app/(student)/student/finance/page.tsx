import { Prisma, WaitingEntryState } from "@prisma/client";
import { PageTransition } from "@/components/shared/page-transition";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireRole } from "@/lib/auth";
import { TUITION_PER_CREDIT } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

export default async function StudentFinancePage() {
  const session = await requireRole("STUDENT");

  const [enrollments, ledger, waitingConfirmedEntries] = await Promise.all([
    prisma.enrollment.findMany({
      where: {
        studentId: session.user.id,
        status: "ENROLLED",
      },
      include: {
        section: {
          include: {
            course: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.financeLedger.findMany({
      where: { studentId: session.user.id },
      include: {
        section: {
          include: {
            course: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.waitingEntry.findMany({
      where: {
        studentId: session.user.id,
        state: WaitingEntryState.CONFIRMED,
        offerSectionId: { not: null },
      },
      select: { offerSectionId: true },
    }),
  ]);

  const waitingSectionIds = new Set(waitingConfirmedEntries.map((item) => item.offerSectionId).filter(Boolean));
  const ledgerBySection = new Map(
    ledger.filter((row) => row.sectionId).map((row) => [row.sectionId as string, new Prisma.Decimal(row.amount).toNumber()]),
  );

  const rows = enrollments.map((item) => {
    const projected = item.section.course.credits * TUITION_PER_CREDIT;
    const posted = ledgerBySection.get(item.sectionId) ?? 0;
    return {
      id: item.id,
      courseCode: item.section.course.code,
      courseName: item.section.course.name,
      sectionCode: item.section.code,
      credits: item.section.course.credits,
      source: waitingSectionIds.has(item.sectionId) ? "WAITING_ROOM" : "DIRECT",
      projected,
      posted,
      createdAt: item.createdAt,
    };
  });

  const totalProjected = rows.reduce((sum, row) => sum + row.projected, 0);
  const totalPosted = ledger.reduce((sum, row) => sum + new Prisma.Decimal(row.amount).toNumber(), 0);

  return (
    <PageTransition>
      <Card className="glass-card border-violet-200/80">
        <CardHeader>
          <CardTitle>Học phí dự kiến theo học phần đã đăng ký</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-cyan-200 bg-cyan-50/70 p-3">
              <p className="text-muted-foreground text-xs">Tổng học phí dự kiến (trực tiếp + phòng chờ)</p>
              <p className="font-sans tabular-nums text-xl font-semibold">{totalProjected.toLocaleString("vi-VN")} VND</p>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-3">
              <p className="text-muted-foreground text-xs">Tổng đã ghi nhận vào finance ledger</p>
              <p className="font-sans tabular-nums text-xl font-semibold">{totalPosted.toLocaleString("vi-VN")} VND</p>
            </div>
          </div>

          {rows.length === 0 ? (
            <p className="text-muted-foreground text-sm">Chưa có học phần đã đăng ký.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ngày đăng ký</TableHead>
                  <TableHead>Học phần</TableHead>
                  <TableHead>LHP</TableHead>
                  <TableHead>Tín chỉ</TableHead>
                  <TableHead>Nguồn đăng ký</TableHead>
                  <TableHead className="text-right">Dự kiến</TableHead>
                  <TableHead className="text-right">Đã ghi nhận</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{new Date(item.createdAt).toLocaleString("vi-VN")}</TableCell>
                    <TableCell>
                      <p className="font-medium">{item.courseCode}</p>
                      <p className="text-muted-foreground text-xs">{item.courseName}</p>
                    </TableCell>
                    <TableCell>{item.sectionCode}</TableCell>
                    <TableCell>{item.credits}</TableCell>
                    <TableCell>
                      <Badge variant={item.source === "WAITING_ROOM" ? "default" : "secondary"}>
                        {item.source === "WAITING_ROOM" ? "Qua phòng chờ" : "Đăng ký trực tiếp"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{item.projected.toLocaleString("vi-VN")} VND</TableCell>
                    <TableCell className="text-right">{item.posted.toLocaleString("vi-VN")} VND</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </PageTransition>
  );
}
