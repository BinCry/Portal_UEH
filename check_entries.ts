import { prisma } from "./src/lib/prisma";

async function check() {
    const entries = await prisma.waitingEntry.findMany({
        include: {
            student: { select: { email: true } },
            waitingRoom: { select: { course: true } }
        },
        orderBy: { joinedAt: "desc" },
        take: 5
    });
    console.dir(entries, { depth: null });
}

check()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
