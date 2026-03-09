import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient, EnrollmentStatus, WaitingEntryState } from "@prisma/client";

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

const databaseUrl = process.env.DATABASE_URL!;
const pool = new Pool({ connectionString: normalizeConnectionString(databaseUrl) });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
    const student = await prisma.user.findFirst({
        where: { role: "STUDENT", email: "student2@ueh.edu.vn" },
    });
    if (!student) throw new Error("No student found");

    const section = await prisma.section.findFirst({
        where: { isWaitingOption: true, status: "OPEN" },
        include: { course: true },
    });
    if (!section) throw new Error("No waiting room section found");

    let waitingRoom = await prisma.waitingRoom.findUnique({
        where: { courseId: section.courseId },
    });
    if (!waitingRoom) {
        waitingRoom = await prisma.waitingRoom.create({
            data: { courseId: section.courseId, isActive: true },
        });
    }

    await prisma.enrollment.deleteMany({
        where: { studentId: student.id, section: { courseId: section.courseId } },
    });
    await prisma.waitingEntry.deleteMany({
        where: { studentId: student.id, waitingRoomId: waitingRoom.id },
    });

    await prisma.waitingEntry.create({
        data: {
            studentId: student.id,
            waitingRoomId: waitingRoom.id,
            state: WaitingEntryState.CONFIRMED,
            offerSectionId: section.id,
            prioritiesJson: [{ sectionId: section.id }],
        },
    });

    await prisma.enrollment.create({
        data: {
            studentId: student.id,
            courseId: section.courseId,
            sectionId: section.id,
            status: EnrollmentStatus.ENROLLED,
        },
    });

    await prisma.section.update({
        where: { id: section.id },
        data: { registeredCount: { increment: 1 } },
    });

    console.log("SEEDED successfully");
}

main().catch(console.error).finally(() => prisma.$disconnect());
