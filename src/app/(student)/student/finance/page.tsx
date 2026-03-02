import { PageTransition } from "@/components/shared/page-transition";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireRole } from "@/lib/auth";
import { TUITION_PER_CREDIT } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

export default async function StudentFinancePage() {
  const session = await requireRole("STUDENT");

  const enrollments = await prisma.enrollment.findMany({
    where: { studentId: session.user.id, status: "ENROLLED" },
    include: { section: { include: { course: true } } },
    orderBy: { createdAt: "desc" },
  });

  const rows = enrollments.map((item) => {
    const projected = item.section.course.credits * TUITION_PER_CREDIT;
    return {
      id: item.id,
      courseCode: item.section.course.code,
      courseName: item.section.course.name,
      credits: item.section.course.credits,
      projected,
      createdAt: item.createdAt,
    };
  });

  return (
    <PageTransition>
      <div className="min-h-[500px] space-y-4 bg-white">
        <h2 className="mb-6 border-b pb-2 text-lg font-bold text-[#0f3b46] uppercase">Ghi danh lớp thành công</h2>

        <div className="mb-6 space-y-1 text-sm text-gray-700">
          <p className="flex items-center gap-2">
            <span className="font-bold text-[#0f3b46]">01. XÁC NHẬN THAM GIA</span>
            Môn học sẽ được cập nhật vào Tài chính sinh viên
          </p>
          <p className="flex items-center gap-2">
            <span className="font-bold text-[#0f3b46]">02. XÁC NHẬN KHÔNG THAM GIA</span>
            Môn học sẽ tự động loại khỏi kỳ học, không cập nhật trên Tài chính sinh viên
          </p>
        </div>

        <div className="overflow-hidden rounded-sm border border-gray-300">
          <Table>
            <TableHeader className="bg-[#ffe4e1]">
              <TableRow className="hover:bg-[#ffe4e1]">
                <TableHead colSpan={7} className="h-12 text-sm font-bold text-black">
                  Năm học : 2026, Học kỳ: HKD
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-6 text-center text-gray-500">
                    Chưa có học phần đã ghi danh.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((item) => (
                  <TableRow key={item.id} className="border-b border-gray-300 hover:bg-slate-50">
                    <TableCell className="w-[300px] border-r border-gray-300 py-4 align-top">
                      <p className="text-sm font-bold text-[#0f3b46]">{item.courseCode}</p>
                      <p className="mt-1 text-sm text-gray-700">
                        {item.courseName} [{item.credits} tc]
                      </p>
                    </TableCell>
                    <TableCell className="border-r border-gray-300 py-4 text-center text-sm text-gray-700 align-top">
                      Kế hoạch
                    </TableCell>
                    <TableCell className="border-r border-gray-300 py-4 text-center font-mono text-sm font-semibold align-top">
                      {item.projected.toLocaleString("vi-VN")}
                    </TableCell>
                    <TableCell className="border-r border-gray-300 py-4 text-center font-mono text-sm font-semibold align-top">
                      {item.projected.toLocaleString("vi-VN")}
                    </TableCell>
                    <TableCell className="border-r border-gray-300 py-4 text-center font-mono text-sm text-gray-500 align-top">
                      <span className="px-2">0</span> <span className="px-2">0</span> <span className="px-2">0</span>
                    </TableCell>
                    <TableCell className="border-r border-gray-300 py-4 text-center text-sm text-gray-700 align-top">
                      {new Date(item.createdAt).toLocaleDateString("vi-VN")}
                    </TableCell>
                    <TableCell className="py-4 text-center text-sm text-gray-700 align-top">Ngân hàng</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </PageTransition>
  );
}
