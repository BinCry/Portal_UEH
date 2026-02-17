import { FinanceStatus } from "@prisma/client";
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
};
