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
      throw new Error("Báº¡n chá»‰ cÃ³ thá»ƒ tham gia phÃ²ng chá» cá»§a há»c pháº§n thuá»™c ngÃ nh cá»§a mÃ¬nh");
    }

    // Penalty block requirement removed as per user request

    const room = await waitingRoomService.evaluateAndActivate(courseId);
    if (!room) {
      throw new Error("KhÃ´ng tÃ¬m tháº¥y phÃ²ng chá» cho há»c pháº§n");
    }
    if (!room.isActive) {
      throw new Error("PhÃ²ng chá» chÆ°a Ä‘á»§ Ä‘iá»u kiá»‡n kÃ­ch hoáº¡t");
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
      throw new Error("ChÆ°a cÃ³ lá»›p bá»• sung kháº£ dá»¥ng cho phÃ²ng chá»");
    }
    if (waitingSections.length !== priorityIds.length) {
      throw new Error("Nguyá»‡n vá»ng pháº£i lÃ  cÃ¡c lá»›p bá»• sung dÃ nh cho phÃ²ng chá»");
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
      throw new Error("Báº¡n Ä‘ang máº¥t quyá»n Æ°u tiÃªn táº¡m thá»i, vui lÃ²ng chá»n Ã­t nháº¥t 2 nguyá»‡n vá»ng");
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
            ? `Äang máº¥t quyá»n Æ°u tiÃªn táº¡m thá»i Ä‘áº¿n ${studentProfile.priorityPenaltyUntil?.toLocaleString("vi-VN")}`
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
        title: "ÄÃ£ ghi nháº­n yÃªu cáº§u phÃ²ng chá»",
        message: priorityPenaltyActive
          ? `Báº¡n Ä‘Ã£ tham gia phÃ²ng chá» há»c pháº§n ${course.code}. VÃ¬ Ä‘ang máº¥t quyá»n Æ°u tiÃªn táº¡m thá»i, há»‡ thá»‘ng sáº½ bá» qua Æ°u tiÃªn 1 khi matching. Vá»‹ trÃ­ FIFO hiá»‡n táº¡i: #${position}.`
          : `Báº¡n Ä‘Ã£ tham gia phÃ²ng chá» há»c pháº§n ${course.code}. Vá»‹ trÃ­ FIFO hiá»‡n táº¡i: #${position}.`,
        waitingEntryId: entry.id,
        waitingRoomId: room.id,
        courseCode: course.code,
        courseName: course.name,
        fifoPosition: position,
        priorityPenaltyUntil: studentProfile.priorityPenaltyUntil?.toISOString() ?? null,
      }),
      notificationService.createForAdmins("SYSTEM", {
        title: "CÃ³ yÃªu cáº§u phÃ²ng chá» má»›i",
        message: `${studentProfile.fullName} (${studentProfile.studentCode}) vá»«a tham gia phÃ²ng chá» há»c pháº§n ${course.code}.`,
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

    // Asynchronously trigger matching so students joining an already approved room don't get stuck in QUEUED
    void matchingService.matchWaitingRoom(room.id).catch(console.error);

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

