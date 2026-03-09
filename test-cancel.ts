import { PrismaClient, WaitingEntryState, EnrollmentStatus } from "@prisma/client";
import { enrollmentService } from "./src/domain/services/enrollment.service";

const prisma = new PrismaClient();

async function main() {
    // Find a student
    const student = await prisma.user.findFirst({
        where: { role: "STUDENT" },
    });
    if (!student) {
        console.log("No student found");
        return;
    }

    // Find an enrolled section
    const enrollment = await prisma.enrollment.findFirst({
        where: {
            studentId: student.id,
            status: EnrollmentStatus.ENROLLED,
        },
        include: {
            section: true,
        },
    });

    if (!enrollment) {
        console.log("No enrollment found");
        return;
    }

    console.log(`Before Cancel: Section ${enrollment.section.code} - Registered: ${enrollment.section.registeredCount}, Reserved: ${enrollment.section.reservedCount}`);

    try {
        const result = await enrollmentService.cancelEnrollment(student.id, enrollment.id);
        console.log("Cancel Result:", result);

        const sectionAfter = await prisma.section.findUnique({
            where: { id: enrollment.sectionId },
        });
        console.log(`After Cancel: Section ${sectionAfter?.code} - Registered: ${sectionAfter?.registeredCount}, Reserved: ${sectionAfter?.reservedCount}`);

        // Wait! Let's also restore it so we don't break the dev environment DB too much
        await prisma.enrollment.update({
            where: { id: enrollment.id },
            data: { status: EnrollmentStatus.ENROLLED },
        });
        await prisma.section.update({
            where: { id: enrollment.sectionId },
            data: { registeredCount: { increment: 1 } },
        });
        console.log("Restored successfully");
    } catch (error) {
        console.error("Error canceling:", error);
    }
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
