import { EnrollmentStatus, FinanceStatus, Prisma } from "@prisma/client";
import { TUITION_PER_CREDIT } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

export const financeService = {
  async createEnrollmentLedger(studentId: string, sectionId: string) {
    const existing = await prisma.financeLedger.findFirst({
      where: {
        studentId,
        sectionId,
        status: {
          in: [FinanceStatus.PENDING, FinanceStatus.POSTED],
        },
      },
      orderBy: { createdAt: "desc" },
    });
    if (existing) {
      return existing;
    }

    const section = await prisma.section.findUnique({
      where: { id: sectionId },
      include: { course: true },
    });
    if (!section) throw new Error("Section not found");

    const amount = section.course.credits * TUITION_PER_CREDIT;
    return prisma.financeLedger.create({
      data: {
        studentId,
        sectionId,
        courseId: section.courseId,
        amount,
        status: FinanceStatus.POSTED,
      },
    });
  },

  async getValidPostedLedgers(studentId: string) {
    const [rows, activeEnrollments] = await Promise.all([
      prisma.financeLedger.findMany({
        where: {
          studentId,
          status: FinanceStatus.POSTED,
        },
        include: {
          course: true,
          section: {
            include: {
              course: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      }),
      prisma.enrollment.findMany({
        where: {
          studentId,
          status: EnrollmentStatus.ENROLLED,
        },
        select: {
          sectionId: true,
        },
      }),
    ]);

    const activeSectionIds = new Set(activeEnrollments.map((item) => item.sectionId));
    return rows.filter((row) => !row.sectionId || activeSectionIds.has(row.sectionId));
  },

  async getValidPostedTotal(studentId: string) {
    const rows = await this.getValidPostedLedgers(studentId);
    return rows.reduce((total, row) => total.add(row.amount), new Prisma.Decimal(0));
  },
};
