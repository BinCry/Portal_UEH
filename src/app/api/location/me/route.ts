import { Prisma } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/route-guards";
import { studentLocationSchema } from "@/lib/zod-schemas/student";

export async function POST(request: Request) {
  const auth = await requireApiRole("STUDENT");
  if (!auth.ok) return fail({ code: "UNAUTHORIZED", message: auth.message }, auth.status);

  try {
    const body = await parseBody(request, studentLocationSchema);
    const updated = await prisma.studentProfile.update({
      where: { userId: auth.user.id },
      data: {
        locationLatitude: body.latitude,
        locationLongitude: body.longitude,
        locationAccuracyMeters: body.accuracyMeters ?? null,
        locationUpdatedAt: new Date(),
      },
      select: {
        locationLatitude: true,
        locationLongitude: true,
        locationAccuracyMeters: true,
        locationUpdatedAt: true,
      },
    });

    return ok({
      latitude: updated.locationLatitude,
      longitude: updated.locationLongitude,
      accuracyMeters: updated.locationAccuracyMeters,
      updatedAt: updated.locationUpdatedAt?.toISOString() ?? null,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return fail({ code: "PROFILE_NOT_FOUND", message: "Khong tim thay ho so sinh vien" }, 404);
    }

    return fail(
      {
        code: "SAVE_LOCATION_FAILED",
        message: "Khong the luu vi tri student",
        details: error,
      },
      400,
    );
  }
}
