import { Prisma, WaitingEntryState } from "@prisma/client";
import { DomainError } from "@/domain/errors/domain-error";
import { prisma } from "@/lib/prisma";
import { now } from "@/lib/time";
import { assertNoActiveEnrollmentForCourse } from "@/domain/services/enrollment-guard.service";
import { notificationService } from "@/domain/services/notification.service";
import { waitingRoomService } from "@/domain/services/waiting-room.service";
import { matchingService } from "@/domain/services/matching.service";

type PriorityInput = {
  sectionId: string;
};

const activeWaitingStates: WaitingEntryState[] = [
  WaitingEntryState.QUEUED,
  WaitingEntryState.PENDING_ADMIN,
  WaitingEntryState.OFFERED,
];

const getPosition = async (waitingRoomId: string, entryId: string) => {
  const queue = await prisma.waitingEntry.findMany({
    where: {
      waitingRoomId,
      state: WaitingEntryState.QUEUED,
    },
    orderBy: [{ joinedAt: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  return queue.findIndex((entry) => entry.id === entryId) + 1;
};

const isFutureDate = (value?: Date | null) => Boolean(value && value.getTime() > now().getTime());

export const waitingEntryService = {
  async join({
    courseId,
    studentId,
    acceptedTerms,
    priorities,
  }: {
    courseId: string;
    studentId: string;
    acceptedTerms: boolean;
    priorities: PriorityInput[];
  }) {
    if (!acceptedTerms) {
      throw new Error("Ban can dong y dieu khoan tham gia phong cho");
    }

    const [studentProfile, studentUser, course] = await Promise.all([
      prisma.studentProfile.findUnique({
        where: { userId: studentId },
        select: {
          faculty: true,
          fullName: true,
          studentCode: true,
          waitingRoomBlockedUntil: true,
          priorityPenaltyUntil: true,
        },
      }),
      prisma.user.findUnique({
        where: { id: studentId },
        select: { email: true },
      }),
      prisma.course.findUnique({
        where: { id: courseId },
        select: { code: true, name: true, faculty: true },
      }),
    ]);

    if (!studentProfile?.faculty || !course || course.faculty !== studentProfile.faculty) {
      throw new Error("Bạn chỉ có thể tham gia phòng chờ của học phần thuộc ngành của mình");
    }

    // Penalty block requirement removed as per user request

    const room = await waitingRoomService.evaluateAndActivate(courseId);
    if (!room) {
      throw new Error("Không tìm thấy phòng chờ cho học phần");
    }
    if (!room.isActive) {
      throw new Error("Phòng chờ chưa đủ điều kiện kích hoạt");
    }

    await assertNoActiveEnrollmentForCourse({
      client: prisma,
      studentId,
      courseId,
    });

    const priorityIds = priorities.map((item) => item.sectionId);
    const waitingSections = await prisma.section.findMany({
      where: {
        id: { in: priorityIds },
        courseId,
        status: "OPEN",
        isWaitingOption: true,
      },
      select: { id: true },
    });
    if (!waitingSections.length) {
      throw new Error("Chưa có lớp bổ sung khả dụng cho phòng chờ");
    }
    if (waitingSections.length !== priorityIds.length) {
      throw new Error("Nguyện vọng phải là các lớp bổ sung dành cho phòng chờ");
    }

    const existing = await prisma.waitingEntry.findFirst({
      where: {
        waitingRoomId: room.id,
        studentId,
        state: {
          in: activeWaitingStates,
        },
      },
    });
    if (existing) {
      throw new DomainError("WAITING_ACTIVE_ENTRY_EXISTS", "Ban da co yeu cau dang cho xu ly");
    }

    const priorityPenaltyActive = isFutureDate(studentProfile.priorityPenaltyUntil);
    if (priorityPenaltyActive && priorities.length < 2) {
      throw new Error("Bạn đang mất quyền ưu tiên tạm thời, vui lòng chọn ít nhất 2 nguyện vọng");
    }
    let entry;
    try {
      entry = await prisma.waitingEntry.create({
        data: {
          waitingRoomId: room.id,
          studentId,
          termsAcceptedAt: now(),
          prioritiesJson: priorities as unknown as Prisma.JsonArray,
          state: WaitingEntryState.QUEUED,
          reason: priorityPenaltyActive
            ? `Đang mất quyền ưu tiên tạm thời đến ${studentProfile.priorityPenaltyUntil?.toLocaleString("vi-VN")}`
            : null,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new DomainError("WAITING_ACTIVE_ENTRY_EXISTS", "Ban da co yeu cau dang cho xu ly");
      }
      throw error;
    }

    const position = await getPosition(room.id, entry.id);

    await Promise.all([
      notificationService.create(studentId, "SYSTEM", {
        title: "Đã ghi nhận yêu cầu phòng chờ",
        message: priorityPenaltyActive
          ? `Bạn đã tham gia phòng chờ học phần ${course.code}. Vì đang mất quyền ưu tiên tạm thời, hệ thống sẽ bỏ qua ưu tiên 1 khi matching. Vị trí FIFO hiện tại: #${position}.`
          : `Bạn đã tham gia phòng chờ học phần ${course.code}. Vị trí FIFO hiện tại: #${position}.`,
        waitingEntryId: entry.id,
        waitingRoomId: room.id,
        courseCode: course.code,
        courseName: course.name,
        fifoPosition: position,
        priorityPenaltyUntil: studentProfile.priorityPenaltyUntil?.toISOString() ?? null,
      }),
      notificationService.createForAdmins("SYSTEM", {
        title: "Có yêu cầu phòng chờ mới",
        message: `${studentProfile.fullName} (${studentProfile.studentCode}) vừa tham gia phòng chờ học phần ${course.code}.`,
        waitingEntryId: entry.id,
        waitingRoomId: room.id,
        studentId,
        studentEmail: studentUser?.email ?? null,
        studentCode: studentProfile.studentCode,
        studentName: studentProfile.fullName,
        courseCode: course.code,
        courseName: course.name,
        fifoPosition: position,
        priorityPenaltyUntil: studentProfile.priorityPenaltyUntil?.toISOString() ?? null,
      }),
    ]);

    // Wait for matching to finish so serverless runtimes do not drop the queue processing task.
    await matchingService.matchWaitingRoom(room.id);

    return { room, entry, position };
  },

  async getForStudent(studentId: string) {
    const entries = await prisma.waitingEntry.findMany({
      where: {
        studentId,
      },
      select: {
        id: true,
        waitingRoomId: true,
        state: true,
        joinedAt: true,
        expiresAt: true,
        matchedPriority: true,
        reason: true,
        waitingRoom: {
          select: {
            course: {
              select: {
                code: true,
                name: true,
              },
            },
          },
        },
        offerSection: {
          select: {
            code: true,
            dayOfWeek: true,
            timeSlot: {
              select: {
                label: true,
                startTime: true,
                endTime: true,
              },
            },
            room: {
              select: {
                campus: true,
                code: true,
                address: true,
              },
            },
            startDate: true,
            endDate: true,
          },
        },
      },
      orderBy: {
        joinedAt: "desc",
      },
    });

    const roomIds = [...new Set(entries.map((entry) => entry.waitingRoomId))];
    const queueMap = new Map<string, string[]>();

    if (roomIds.length) {
      const allQueuedEntries = await prisma.waitingEntry.findMany({
        where: {
          waitingRoomId: {
            in: roomIds,
          },
          state: WaitingEntryState.QUEUED,
        },
        orderBy: [{ waitingRoomId: "asc" }, { joinedAt: "asc" }, { id: "asc" }],
        select: { id: true, waitingRoomId: true },
      });

      for (const item of allQueuedEntries) {
        const roomQueue = queueMap.get(item.waitingRoomId) ?? [];
        roomQueue.push(item.id);
        queueMap.set(item.waitingRoomId, roomQueue);
      }
    }

    return entries.map((entry) => ({
      ...entry,
      fifoPosition:
        entry.state === WaitingEntryState.QUEUED
          ? (queueMap.get(entry.waitingRoomId)?.indexOf(entry.id) ?? -1) + 1
          : null,
    }));
  },
};
