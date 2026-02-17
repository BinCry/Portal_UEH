import { Prisma, WaitingEntryState } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { now } from "@/lib/time";
import { notificationService } from "@/domain/services/notification.service";
import { waitingRoomService } from "@/domain/services/waiting-room.service";

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
      throw new Error("Ban chi co the tham gia phong cho cua hoc phan thuoc nganh cua minh");
    }

    if (isFutureDate(studentProfile.waitingRoomBlockedUntil)) {
      throw new Error(
        `Ban dang bi tam khoa quyen tham gia phong cho den ${studentProfile.waitingRoomBlockedUntil?.toLocaleString(
          "vi-VN",
        )}`,
      );
    }

    const room = await waitingRoomService.evaluateAndActivate(courseId);
    if (!room) {
      throw new Error("Khong tim thay phong cho cho hoc phan");
    }
    if (!room.isActive) {
      throw new Error("Phong cho chua du dieu kien kich hoat");
    }

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
      throw new Error("Chua co lop bo sung kha dung cho phong cho");
    }
    if (waitingSections.length !== priorityIds.length) {
      throw new Error("Nguyen vong phai la cac lop bo sung danh cho phong cho");
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
      throw new Error("Ban da co yeu cau dang cho xu ly");
    }

    const priorityPenaltyActive = isFutureDate(studentProfile.priorityPenaltyUntil);
    if (priorityPenaltyActive && priorities.length < 2) {
      throw new Error("Ban dang mat quyen uu tien tam thoi, vui long chon it nhat 2 nguyen vong");
    }
    const entry = await prisma.waitingEntry.create({
      data: {
        waitingRoomId: room.id,
        studentId,
        termsAcceptedAt: now(),
        prioritiesJson: priorities as unknown as Prisma.JsonArray,
        state: WaitingEntryState.QUEUED,
        reason: priorityPenaltyActive
          ? `Dang mat quyen uu tien tam thoi den ${studentProfile.priorityPenaltyUntil?.toLocaleString("vi-VN")}`
          : null,
      },
    });

    const position = await getPosition(room.id, entry.id);

    await Promise.all([
      notificationService.create(studentId, "SYSTEM", {
        title: "Da ghi nhan yeu cau phong cho",
        message: priorityPenaltyActive
          ? `Ban da tham gia phong cho hoc phan ${course.code}. Vi dang mat quyen uu tien tam thoi, he thong se bo qua uu tien 1 khi matching. Vi tri FIFO hien tai: #${position}.`
          : `Ban da tham gia phong cho hoc phan ${course.code}. Vi tri FIFO hien tai: #${position}.`,
        waitingEntryId: entry.id,
        waitingRoomId: room.id,
        courseCode: course.code,
        courseName: course.name,
        fifoPosition: position,
        priorityPenaltyUntil: studentProfile.priorityPenaltyUntil?.toISOString() ?? null,
      }),
      notificationService.createForAdmins("SYSTEM", {
        title: "Co yeu cau phong cho moi",
        message: `${studentProfile.fullName} (${studentProfile.studentCode}) vua tham gia phong cho hoc phan ${course.code}.`,
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

    return { room, entry, position };
  },

  async getForStudent(studentId: string) {
    const entries = await prisma.waitingEntry.findMany({
      where: {
        studentId,
      },
      include: {
        waitingRoom: {
          include: {
            course: true,
          },
        },
        offerSection: {
          include: {
            timeSlot: true,
            room: true,
            instructor: true,
            course: true,
          },
        },
      },
      orderBy: {
        joinedAt: "desc",
      },
    });

    const roomIds = [...new Set(entries.map((entry) => entry.waitingRoomId))];
    const queueMap = new Map<string, string[]>();

    await Promise.all(
      roomIds.map(async (roomId) => {
        const queue = await prisma.waitingEntry.findMany({
          where: {
            waitingRoomId: roomId,
            state: WaitingEntryState.QUEUED,
          },
          orderBy: [{ joinedAt: "asc" }, { id: "asc" }],
          select: { id: true },
        });
        queueMap.set(
          roomId,
          queue.map((item) => item.id),
        );
      }),
    );

    return entries.map((entry) => ({
      ...entry,
      fifoPosition:
        entry.state === WaitingEntryState.QUEUED
          ? (queueMap.get(entry.waitingRoomId)?.indexOf(entry.id) ?? -1) + 1
          : null,
    }));
  },
};
