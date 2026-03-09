import { prisma } from "./src/lib/prisma";

async function clearQueued() {
    const result = await prisma.waitingEntry.deleteMany({
        where: {
            student: { email: 'student1@ueh.edu.vn' },
            state: 'QUEUED'
        }
    });
    console.log("Deleted queued entries:", result);
}

clearQueued()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
