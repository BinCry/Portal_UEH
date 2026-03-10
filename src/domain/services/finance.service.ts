import { EnrollmentStatus, FinanceStatus, Prisma } from "@prisma/client";
import { TUITION_PER_CREDIT } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

type FinanceMutationClient = Prisma.TransactionClient | typeof prisma;

type EnsureEnrollmentLedgerArgs = {
  client?: FinanceMutationClient;
  studentId: string;
  sectionId: string;
  courseId?: string;
  amount?: Prisma.Decimal | number;
};

export const ACTIVE_FINANCE_STATUSES: FinanceStatus[] = [FinanceStatus.PENDING, FinanceStatus.POSTED];

export const financeService = {
  async ensureEnrollmentLedger({
    client = prisma,
    studentId,
    sectionId,
    courseId,
    amount,
  }: EnsureEnrollmentLedgerArgs) {
    const existing = await client.financeLedger.findFirst({
      where: {
        studentId,
        sectionId,
        status: {
          in: ACTIVE_FINANCE_STATUSES,
        },
      },
      orderBy: { createdAt: "desc" },
    });
    if (existing) {
      return existing;
    }

    let resolvedCourseId = courseId;
    let resolvedAmount = amount ? new Prisma.Decimal(amount) : null;

    if (!resolvedCourseId || !resolvedAmount) {
      const section = await client.section.findUnique({
        where: { id: sectionId },
        include: { course: true },
      });
      if (!section) throw new Error("Section not found");

      resolvedCourseId ??= section.courseId;
      resolvedAmount ??= new Prisma.Decimal(section.course.credits * TUITION_PER_CREDIT);
    }

    return client.financeLedger.create({
      data: {
        studentId,
        sectionId,
        courseId: resolvedCourseId,
        amount: resolvedAmount,
        status: FinanceStatus.POSTED,
      },
    });
  },

  async voidEnrollmentLedgers({
    client = prisma,
    studentId,
    sectionId,
  }: {
    client?: FinanceMutationClient;
    studentId: string;
    sectionId: string;
  }) {
    return client.financeLedger.updateMany({
      where: {
        studentId,
        sectionId,
        status: {
          in: ACTIVE_FINANCE_STATUSES,
        },
      },
      data: {
        status: FinanceStatus.VOID,
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
    return rows.filter((row) => Boolean(row.sectionId && row.section && activeSectionIds.has(row.sectionId)));
  },

  async getValidPostedTotal(studentId: string) {
    const rows = await this.getValidPostedLedgers(studentId);
    return rows.reduce((total, row) => total.add(row.amount), new Prisma.Decimal(0));
  },
};
