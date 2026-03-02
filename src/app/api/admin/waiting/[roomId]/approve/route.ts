import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/route-guards";
import { approvalService } from "@/domain/services/approval-service";

type Context = {
  params: Promise<{ roomId: string }>;
};

const schema = z.object({
  reason: z.string().max(500).optional(),
  capacityUpdates: z
    .array(
      z.object({
        sectionId: z.string(),
        capacity: z.int().min(1).max(1000),
      }),
    )
    .optional(),
});

export async function POST(request: Request, context: Context) {
  const auth = await requireApiRole("ADMIN");
  if (!auth.ok) return fail({ code: "UNAUTHORIZED", message: auth.message }, auth.status);

  try {
    const body = await parseBody(request, schema);
    const { roomId } = await context.params;

    if (body.capacityUpdates?.length) {
      await prisma.$transaction(
        body.capacityUpdates.map((update) =>
          prisma.section.update({
            where: { id: update.sectionId },
            data: { capacity: update.capacity },
          }),
        ),
      );
    }

    const approval = await approvalService.manualApprove(roomId, auth.user.id, body.reason);
    return ok({ approval });
  } catch (error) {
    return fail(
      {
        code: "APPROVE_FAILED",
        message: "Không thể phê duyệt phòng chờ",
        details: error,
      },
      400,
    );
  }
}

