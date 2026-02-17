import { fail, ok } from "@/lib/api";
import { validateCronSecret } from "@/lib/cron-auth";
import { prisma } from "@/lib/prisma";
import { matchingService } from "@/domain/services/matching.service";

export async function POST(request: Request) {
  const unauthorized = validateCronSecret(request);
  if (unauthorized) return unauthorized;

  try {
    const rooms = await prisma.waitingRoom.findMany({
      where: {
        isActive: true,
      },
      select: { id: true },
    });

    const results = [];
    for (const room of rooms) {
      const matched = await matchingService.matchWaitingRoom(room.id);
      results.push({ roomId: room.id, ...matched });
    }

    return ok({
      scannedRooms: rooms.length,
      results,
    });
  } catch (error) {
    return fail(
      {
        code: "MATCH_FAILED",
        message: "Không thể chạy match offers",
        details: error,
      },
      500,
    );
  }
}

