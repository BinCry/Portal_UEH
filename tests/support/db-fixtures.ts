import "dotenv/config";
import bcrypt from "bcryptjs";
import {
  CoursePlanType,
  DayOfWeek,
  EnrollmentStatus,
  FinanceStatus,
  Role,
  SectionStatus,
  WaitingEntryState,
} from "@prisma/client";
import { prisma } from "../../src/lib/prisma";

const DEFAULT_PASSWORD_HASH = bcrypt.hashSync("123456", 10);

const toToken = (value: string, length = 24) =>
  value
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase()
    .slice(-length) || "TEST";

export const makePrefix = (label = "test") => `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const createTestDbContext = (prefix = makePrefix()) => {
  const token = toToken(prefix);
  const tracked = {
    userIds: [] as string[],
    sectionIds: [] as string[],
    courseIds: [] as string[],
    roomIds: [] as string[],
    timeSlotIds: [] as string[],
    waitingRoomIds: [] as string[],
    waitingEntryIds: [] as string[],
    enrollmentIds: [] as string[],
    financeLedgerIds: [] as string[],
  };

  const track = <T extends { id: string }>(bucket: Array<string>, record: T) => {
    bucket.push(record.id);
    return record;
  };

  return {
    prefix,
    token,

    async createStudentAccount({
      email,
      fullName,
      faculty = "Kinh doanh",
      studentCode,
    }: {
      email?: string;
      fullName?: string;
      faculty?: string;
      studentCode?: string;
    } = {}) {
      return track(
        tracked.userIds,
        await prisma.user.create({
          data: {
            email: email ?? `${prefix}@ueh.edu.vn`,
            passwordHash: DEFAULT_PASSWORD_HASH,
            role: Role.STUDENT,
            studentProfile: {
              create: {
                fullName: fullName ?? `Student ${prefix}`,
                studentCode:
                  studentCode ??
                  `SV${toToken(
                    `${prefix}-${tracked.userIds.length + 1}-${Math.random().toString(36).slice(2, 8)}`,
                    18,
                  )}`,
                faculty,
              },
            },
          },
        }),
      );
    },

    async createCourse({
      code,
      name,
      credits = 3,
      faculty = "Kinh doanh",
      planType = CoursePlanType.IN_PLAN,
    }: {
      code?: string;
      name?: string;
      credits?: number;
      faculty?: string;
      planType?: CoursePlanType;
    } = {}) {
      return track(
        tracked.courseIds,
        await prisma.course.create({
          data: {
            code: code ?? `CRS-${token}`,
            name: name ?? `Course ${prefix}`,
            credits,
            faculty,
            planType,
            isActive: true,
          },
        }),
      );
    },

    async createRoom({
      code,
      capacity = 40,
      campus = "Co so N",
      address = "1 Test Street",
      building = "UEH",
    }: {
      code?: string;
      capacity?: number;
      campus?: string;
      address?: string;
      building?: string;
    } = {}) {
      return track(
        tracked.roomIds,
        await prisma.room.create({
          data: {
            code: code ?? `RM-${token}`,
            building,
            capacity,
            campus,
            address,
          },
        }),
      );
    },

    async createTimeSlot({
      label,
      startTime = "07:00",
      endTime = "10:00",
    }: {
      label?: string;
      startTime?: string;
      endTime?: string;
    } = {}) {
      return track(
        tracked.timeSlotIds,
        await prisma.timeSlot.create({
          data: {
            label: label ?? `TS-${token}`,
            startTime,
            endTime,
          },
        }),
      );
    },

    async createSection({
      courseId,
      roomId,
      timeSlotId,
      code,
      dayOfWeek = DayOfWeek.MONDAY,
      capacity = 10,
      registeredCount = 0,
      reservedCount = 0,
      isWaitingOption = false,
      status = SectionStatus.OPEN,
    }: {
      courseId: string;
      roomId: string;
      timeSlotId: string;
      code?: string;
      dayOfWeek?: DayOfWeek;
      capacity?: number;
      registeredCount?: number;
      reservedCount?: number;
      isWaitingOption?: boolean;
      status?: SectionStatus;
    }) {
      return track(
        tracked.sectionIds,
        await prisma.section.create({
          data: {
            code: code ?? `SEC-${token}-${tracked.sectionIds.length + 1}`,
            courseId,
            roomId,
            timeSlotId,
            dayOfWeek,
            capacity,
            registeredCount,
            reservedCount,
            isWaitingOption,
            status,
            startDate: new Date("2026-01-01T00:00:00.000Z"),
            endDate: new Date("2026-03-31T00:00:00.000Z"),
          },
        }),
      );
    },

    async createWaitingRoom({
      courseId,
      isActive = true,
      buffer = 5,
      slaHours = 48,
    }: {
      courseId: string;
      isActive?: boolean;
      buffer?: number;
      slaHours?: number;
    }) {
      return track(
        tracked.waitingRoomIds,
        await prisma.waitingRoom.create({
          data: {
            courseId,
            isActive,
            activatedAt: isActive ? new Date() : null,
            buffer,
            slaHours,
          },
        }),
      );
    },

    async createWaitingEntry({
      waitingRoomId,
      studentId,
      state = WaitingEntryState.OFFERED,
      offerSectionId,
      prioritiesJson,
      matchedPriority,
      expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000),
      reason = null,
    }: {
      waitingRoomId: string;
      studentId: string;
      state?: WaitingEntryState;
      offerSectionId?: string | null;
      prioritiesJson?: Array<{ sectionId: string }>;
      matchedPriority?: number | null;
      expiresAt?: Date | null;
      reason?: string | null;
    }) {
      return track(
        tracked.waitingEntryIds,
        await prisma.waitingEntry.create({
          data: {
            waitingRoomId,
            studentId,
            state,
            offerSectionId: offerSectionId ?? null,
            prioritiesJson: prioritiesJson ?? (offerSectionId ? [{ sectionId: offerSectionId }] : []),
            matchedPriority: matchedPriority ?? null,
            expiresAt,
            reason,
            termsAcceptedAt: new Date(),
          },
        }),
      );
    },

    async createEnrollment({
      studentId,
      courseId,
      sectionId,
      status = EnrollmentStatus.ENROLLED,
    }: {
      studentId: string;
      courseId: string;
      sectionId: string;
      status?: EnrollmentStatus;
    }) {
      return track(
        tracked.enrollmentIds,
        await prisma.enrollment.create({
          data: {
            studentId,
            courseId,
            sectionId,
            status,
          },
        }),
      );
    },

    async createFinanceLedger({
      studentId,
      courseId,
      sectionId = null,
      amount,
      status = FinanceStatus.POSTED,
    }: {
      studentId: string;
      courseId?: string | null;
      sectionId?: string | null;
      amount: number;
      status?: FinanceStatus;
    }) {
      return track(
        tracked.financeLedgerIds,
        await prisma.financeLedger.create({
          data: {
            studentId,
            courseId,
            sectionId,
            amount,
            status,
          },
        }),
      );
    },

    async cleanup() {
      if (tracked.userIds.length) {
        await prisma.notification.deleteMany({
          where: {
            userId: {
              in: tracked.userIds,
            },
          },
        });
      }

      if (tracked.financeLedgerIds.length || tracked.userIds.length || tracked.sectionIds.length || tracked.courseIds.length) {
        await prisma.financeLedger.deleteMany({
          where: {
            OR: [
              {
                id: {
                  in: tracked.financeLedgerIds,
                },
              },
              {
                studentId: {
                  in: tracked.userIds,
                },
              },
              {
                sectionId: {
                  in: tracked.sectionIds,
                },
              },
              {
                courseId: {
                  in: tracked.courseIds,
                },
              },
            ],
          },
        });
      }

      if (tracked.enrollmentIds.length || tracked.userIds.length || tracked.sectionIds.length) {
        await prisma.enrollment.deleteMany({
          where: {
            OR: [
              {
                id: {
                  in: tracked.enrollmentIds,
                },
              },
              {
                studentId: {
                  in: tracked.userIds,
                },
              },
              {
                sectionId: {
                  in: tracked.sectionIds,
                },
              },
            ],
          },
        });
      }

      if (tracked.waitingEntryIds.length || tracked.userIds.length || tracked.waitingRoomIds.length || tracked.sectionIds.length) {
        await prisma.waitingEntry.deleteMany({
          where: {
            OR: [
              {
                id: {
                  in: tracked.waitingEntryIds,
                },
              },
              {
                studentId: {
                  in: tracked.userIds,
                },
              },
              {
                waitingRoomId: {
                  in: tracked.waitingRoomIds,
                },
              },
              {
                offerSectionId: {
                  in: tracked.sectionIds,
                },
              },
            ],
          },
        });
      }

      if (tracked.waitingRoomIds.length) {
        await prisma.approval.deleteMany({
          where: {
            waitingRoomId: {
              in: tracked.waitingRoomIds,
            },
          },
        });
        await prisma.waitingRoom.deleteMany({
          where: {
            id: {
              in: tracked.waitingRoomIds,
            },
          },
        });
      }

      if (tracked.sectionIds.length) {
        await prisma.section.deleteMany({
          where: {
            id: {
              in: tracked.sectionIds,
            },
          },
        });
      }

      if (tracked.courseIds.length) {
        await prisma.course.deleteMany({
          where: {
            id: {
              in: tracked.courseIds,
            },
          },
        });
      }

      if (tracked.roomIds.length) {
        await prisma.room.deleteMany({
          where: {
            id: {
              in: tracked.roomIds,
            },
          },
        });
      }

      if (tracked.timeSlotIds.length) {
        await prisma.timeSlot.deleteMany({
          where: {
            id: {
              in: tracked.timeSlotIds,
            },
          },
        });
      }

      if (tracked.userIds.length) {
        await prisma.studentProfile.deleteMany({
          where: {
            userId: {
              in: tracked.userIds,
            },
          },
        });
        await prisma.user.deleteMany({
          where: {
            id: {
              in: tracked.userIds,
            },
          },
        });
      }
    },
  };
};
