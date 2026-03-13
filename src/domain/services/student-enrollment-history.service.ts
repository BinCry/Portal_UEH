import { EnrollmentStatus, WaitingEntryState } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const activeWaitingFlowStates: WaitingEntryState[] = [
  WaitingEntryState.QUEUED,
  WaitingEntryState.PENDING_ADMIN,
  WaitingEntryState.OFFERED,
];

export const studentEnrollmentHistoryService = {
  async getForStudent(studentId: string) {
    const [enrollments, confirmedEntries] = await Promise.all([
      prisma.enrollment.findMany({
        where: {
          studentId,
          status: EnrollmentStatus.ENROLLED,
        },
        select: {
          id: true,
          sectionId: true,
          createdAt: true,
          section: {
            select: {
              code: true,
              dayOfWeek: true,
              startDate: true,
              endDate: true,
              registeredCount: true,
              course: {
                select: {
                  id: true,
                  code: true,
                  name: true,
                },
              },
              room: {
                select: {
                  campus: true,
                  code: true,
                  address: true,
                },
              },
              timeSlot: {
                select: {
                  label: true,
                  startTime: true,
                  endTime: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.waitingEntry.findMany({
        where: {
          studentId,
          state: WaitingEntryState.CONFIRMED,
          offerSectionId: { not: null },
        },
        select: {
          offerSectionId: true,
        },
      }),
    ]);

    const waitingSectionIds = new Set(confirmedEntries.map((entry) => entry.offerSectionId).filter(Boolean));
    const waitingCourseIds = [
      ...new Set(
        enrollments
          .filter((enrollment) => waitingSectionIds.has(enrollment.sectionId))
          .map((enrollment) => enrollment.section.course.id),
      ),
    ];

    const [waitingRooms, activeWaitingCounts, activeWaitingEnrollments] = waitingCourseIds.length
      ? await Promise.all([
          prisma.waitingRoom.findMany({
            where: {
              courseId: {
                in: waitingCourseIds,
              },
            },
            select: {
              id: true,
              courseId: true,
            },
          }),
          prisma.waitingEntry.groupBy({
            by: ["waitingRoomId"],
            where: {
              state: {
                in: activeWaitingFlowStates,
              },
              waitingRoom: {
                is: {
                  courseId: {
                    in: waitingCourseIds,
                  },
                },
              },
            },
            _count: {
              _all: true,
            },
          }),
          prisma.enrollment.findMany({
            where: {
              courseId: {
                in: waitingCourseIds,
              },
              status: EnrollmentStatus.ENROLLED,
              section: {
                is: {
                  isWaitingOption: true,
                },
              },
            },
            select: {
              courseId: true,
            },
          }),
        ])
      : [[], [], []];

    const waitingRoomIdByCourseId = new Map(waitingRooms.map((room) => [room.courseId, room.id]));
    const activeWaitingCountByRoomId = new Map(
      activeWaitingCounts.map((row) => [row.waitingRoomId, row._count._all]),
    );
    const activeWaitingEnrollmentCountByCourseId = new Map<string, number>();

    for (const enrollment of activeWaitingEnrollments) {
      activeWaitingEnrollmentCountByCourseId.set(
        enrollment.courseId,
        (activeWaitingEnrollmentCountByCourseId.get(enrollment.courseId) ?? 0) + 1,
      );
    }

    return enrollments.map((enrollment) => {
      const source = waitingSectionIds.has(enrollment.sectionId) ? ("WAITING_ROOM" as const) : ("DIRECT" as const);
      const participantScope = source === "WAITING_ROOM" ? ("WAITING_FLOW" as const) : ("SECTION" as const);
      const { id: courseId, ...course } = enrollment.section.course;
      const { registeredCount, ...section } = enrollment.section;

      if (source === "DIRECT") {
        return {
          ...enrollment,
          section: {
            ...section,
            course,
          },
          source,
          participantScope,
          participantCount: registeredCount,
        };
      }

      const waitingRoomId = waitingRoomIdByCourseId.get(courseId);
      const activeWaitingCount = waitingRoomId ? (activeWaitingCountByRoomId.get(waitingRoomId) ?? 0) : 0;
      const activeWaitingEnrollmentCount = activeWaitingEnrollmentCountByCourseId.get(courseId) ?? 0;

      return {
        ...enrollment,
        section: {
          ...section,
          course,
        },
        source,
        participantScope,
        participantCount: activeWaitingCount + activeWaitingEnrollmentCount,
      };
    });
  },
};
