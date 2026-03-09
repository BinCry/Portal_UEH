import { EnrollmentStatus, type Prisma } from "@prisma/client";
import { DomainError } from "@/domain/errors/domain-error";

type EnrollmentClient = {
  enrollment: {
    findFirst: (
      args: Prisma.EnrollmentFindFirstArgs,
    ) => Promise<{
      id: string;
      sectionId: string;
    } | null>;
  };
};

export const assertNoActiveEnrollmentForCourse = async ({
  client,
  studentId,
  courseId,
  excludeSectionId,
}: {
  client: EnrollmentClient;
  studentId: string;
  courseId: string;
  excludeSectionId?: string;
}) => {
  const existing = await client.enrollment.findFirst({
    where: {
      studentId,
      courseId,
      status: EnrollmentStatus.ENROLLED,
      ...(excludeSectionId
        ? {
            sectionId: {
              not: excludeSectionId,
            },
          }
        : {}),
    },
    select: {
      id: true,
      sectionId: true,
    },
  });

  if (existing) {
    throw new DomainError("ALREADY_ENROLLED_IN_COURSE", "Bạn đã đăng ký học phần này ở lớp khác");
  }
};
