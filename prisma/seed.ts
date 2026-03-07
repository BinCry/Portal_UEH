import fs from "node:fs";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { CoursePlanType, PrismaClient, Role, WaitingEntryState } from "@prisma/client";
import bcrypt from "bcryptjs";
import { addHours } from "date-fns";
import { Pool } from "pg";

type SeedPayload = {
  courses: Array<{
    classification: string;
    courseCode: string;
    courseName: string;
    credits: number;
    sections: Array<{
      sectionCode: string;
      credits: number;
      registeredCount: number;
      remainingSeats: number;
      capacity: number;
      dayOfWeek: "MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY" | "FRIDAY" | "SATURDAY" | "SUNDAY";
      startTime: string;
      endTime: string;
      timeSlotLabel: string;
      startDate: string | null;
      endDate: string | null;
      roomCode: string;
      campus: string;
      address: string;
      building: string;
    }>;
  }>;
};

const normalizeConnectionString = (url: string) => {
  try {
    const parsed = new URL(url);
    const sslMode = parsed.searchParams.get("sslmode");
    if (sslMode === "prefer" || sslMode === "require" || sslMode === "verify-ca") {
      parsed.searchParams.set("sslmode", "verify-full");
    }
    return parsed.toString();
  } catch {
    return url;
  }
};

const databaseUrl = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/ueh_smart_credit";
const pool = new Pool({ connectionString: normalizeConnectionString(databaseUrl) });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const resolveSeedData = () => {
  const jsonPath = path.join(process.cwd(), "prisma", "seed-data", "data-web.normalized.json");
  if (!fs.existsSync(jsonPath)) {
    throw new Error(`Không tìm thấy ${jsonPath}. Vui lòng chạy npm run seed:parse`);
  }
  const raw = fs.readFileSync(jsonPath, "utf8");
  return JSON.parse(raw) as SeedPayload;
};

const normalizeSearchText = (raw: string) =>
  raw
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

const resolveCoursePlanType = (classification: string): CoursePlanType => {
  const normalized = normalizeSearchText(classification);
  return normalized.includes("ngoai ke hoach") ? CoursePlanType.OUT_PLAN : CoursePlanType.IN_PLAN;
};

const defaultCourseFaculty = process.env.SEED_DEFAULT_FACULTY ?? "Kinh doanh";

const main = async () => {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_PRODUCTION_SEED !== "true") {
    throw new Error("Refusing to run prisma seed in production. Set ALLOW_PRODUCTION_SEED=true to override.");
  }

  const seed = resolveSeedData();
  const defaultPassword = process.env.SEED_DEFAULT_PASSWORD ?? "123456";
  const passwordHash = await bcrypt.hash(defaultPassword, 12);

  await prisma.$transaction([
    prisma.notification.deleteMany(),
    prisma.financeLedger.deleteMany(),
    prisma.enrollment.deleteMany(),
    prisma.approval.deleteMany(),
    prisma.waitingEntry.deleteMany(),
    prisma.waitingRoom.deleteMany(),
    prisma.section.deleteMany(),
    prisma.timeSlot.deleteMany(),
    prisma.room.deleteMany(),
    prisma.course.deleteMany(),
    prisma.passwordResetOtp.deleteMany(),
    prisma.studentProfile.deleteMany(),
    prisma.adminProfile.deleteMany(),
    prisma.user.deleteMany(),
  ]);

  const admin = await prisma.user.create({
    data: {
      email: "admin@ueh.edu.vn",
      passwordHash,
      role: Role.ADMIN,
      canOverrideCapacity: true,
      adminProfile: {
        create: {
          fullName: "Phòng Đào tạo UEH",
          department: "Phòng Đào tạo",
        },
      },
    },
  });

  const students = [];
  for (let i = 1; i <= 8; i += 1) {
    const user = await prisma.user.create({
      data: {
        email: `student${i}@ueh.edu.vn`,
        passwordHash,
        role: Role.STUDENT,
        studentProfile: {
          create: {
            fullName: `Sinh viên ${i}`,
            studentCode: `SV2026${String(i).padStart(3, "0")}`,
            faculty: "Kinh doanh",
          },
        },
      },
    });
    students.push(user);
  }

  const roomMap = new Map<string, string>();
  const slotMap = new Map<string, string>();

  for (const course of seed.courses) {
    for (const section of course.sections) {
      const roomKey = `${section.roomCode}|${section.campus}|${section.address}`;
      if (!roomMap.has(roomKey)) {
        const room = await prisma.room.create({
          data: {
            code: section.roomCode,
            campus: section.campus,
            address: section.address,
            building: section.building,
            capacity: Math.max(section.capacity, 50),
          },
        });
        roomMap.set(roomKey, room.id);
      }
      if (!slotMap.has(section.timeSlotLabel)) {
        const slot = await prisma.timeSlot.create({
          data: {
            label: section.timeSlotLabel,
            startTime: section.startTime,
            endTime: section.endTime,
          },
        });
        slotMap.set(section.timeSlotLabel, slot.id);
      }
    }
  }

  const courseIds: string[] = [];

  for (const [courseIndex, course] of seed.courses.entries()) {
    const createdCourse = await prisma.course.create({
      data: {
        code: course.courseCode,
        name: course.courseName,
        faculty: defaultCourseFaculty,
        credits: course.credits,
        planType: resolveCoursePlanType(course.classification),
        isActive: true,
      },
    });
    courseIds.push(createdCourse.id);

    const shouldHideCapacity = courseIndex % 2 === 0;
    for (const [sectionIndex, section] of course.sections.entries()) {
      const forceNearFull = courseIndex < 2;
      const registeredCount = forceNearFull
        ? Math.min(section.capacity, Math.max(section.capacity - (sectionIndex + 1), 0))
        : section.registeredCount;

      await prisma.section.create({
        data: {
          code: section.sectionCode,
          courseId: createdCourse.id,
          roomId: roomMap.get(`${section.roomCode}|${section.campus}|${section.address}`)!,
          dayOfWeek: section.dayOfWeek,
          timeSlotId: slotMap.get(section.timeSlotLabel)!,
          startDate: section.startDate ? new Date(section.startDate) : null,
          endDate: section.endDate ? new Date(section.endDate) : null,
          capacity: section.capacity,
          isWaitingOption: false,
          capacityHidden: shouldHideCapacity,
          registeredCount,
          status: "OPEN",
        },
      });
    }
  }

  const firstCourseId = courseIds[0];
  if (!firstCourseId) {
    throw new Error("Không tạo được course seed");
  }

  const sectionsOfFirstCourse = await prisma.section.findMany({
    where: {
      courseId: firstCourseId,
      isWaitingOption: false,
    },
    orderBy: {
      code: "asc",
    },
  });

  const waitingOptionSeeds = sectionsOfFirstCourse.slice(0, 3);
  const waitingOptionSections = [];
  for (const [index, baseSection] of waitingOptionSeeds.entries()) {
    const waitingSection = await prisma.section.create({
      data: {
        code: `${baseSection.code}-WR${index + 1}`,
        courseId: baseSection.courseId,
        roomId: baseSection.roomId,
        dayOfWeek: baseSection.dayOfWeek,
        timeSlotId: baseSection.timeSlotId,
        startDate: baseSection.startDate,
        endDate: baseSection.endDate,
        capacity: Math.max(15, Math.min(30, baseSection.capacity)),
        isWaitingOption: true,
        capacityHidden: false,
        registeredCount: 0,
        status: "OPEN",
      },
    });
    waitingOptionSections.push(waitingSection);
  }

  const waitingRoom = await prisma.waitingRoom.create({
    data: {
      courseId: firstCourseId,
      isActive: true,
      activatedAt: new Date(),
      buffer: 5,
      slaHours: 48,
    },
  });

  await prisma.approval.create({
    data: {
      waitingRoomId: waitingRoom.id,
      status: "PENDING",
      dueAt: addHours(new Date(), 48),
      approvedById: admin.id,
      reason: "Khởi tạo demo approval pending",
    },
  });

  const priorities = waitingOptionSections.slice(0, 3).map((section) => ({ sectionId: section.id }));

  for (const [index, student] of students.slice(0, 3).entries()) {
    await prisma.waitingEntry.create({
      data: {
        waitingRoomId: waitingRoom.id,
        studentId: student.id,
        termsAcceptedAt: new Date(),
        prioritiesJson: priorities,
        state: index === 0 ? WaitingEntryState.OFFERED : WaitingEntryState.QUEUED,
        offerSectionId: index === 0 ? waitingOptionSections[0]?.id : null,
        expiresAt: index === 0 ? addHours(new Date(), 24) : null,
      },
    });
  }

  if (waitingOptionSections[0]) {
    await prisma.section.update({
      where: { id: waitingOptionSections[0].id },
      data: { reservedCount: 1 },
    });
  }

  await prisma.notification.create({
    data: {
      userId: students[0].id,
      type: "WAITING_OFFER",
      payloadJson: {
        message: "Bạn đã được giữ chỗ học phần. Vui lòng xác nhận trong 24 giờ.",
      },
    },
  });

  console.log("Seed hoàn tất.");
  console.log("Admin:", "admin@ueh.edu.vn");
  console.log("Student:", "student1@ueh.edu.vn");
};

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
