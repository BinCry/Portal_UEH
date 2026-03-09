import { fail, ok } from "@/lib/api";
import { withApiTiming } from "@/lib/api-timing";
import { parseBody } from "@/lib/http";
import { requireApiRole } from "@/lib/route-guards";
import { joinWaitingSchema } from "@/lib/zod-schemas/waiting";
import { isDomainError } from "@/domain/errors/domain-error";
import { waitingEntryService } from "@/domain/services/waiting-entry.service";

export async function POST(request: Request) {
  return withApiTiming("POST /api/waiting/join", async () => {
    const auth = await requireApiRole("STUDENT");
    if (!auth.ok) {
      return fail({ code: "UNAUTHORIZED", message: auth.message }, auth.status);
    }

    try {
      const body = await parseBody(request, joinWaitingSchema);
      const result = await waitingEntryService.join({
        courseId: body.courseId,
        studentId: auth.user.id,
        acceptedTerms: body.acceptedTerms,
        priorities: body.priorities,
      });
      return ok({
        waitingEntry: result.entry,
        waitingRoom: result.room,
        position: result.position,
      });
    } catch (error) {
      if (isDomainError(error)) {
        return fail(
          {
            code: error.code,
            message: error.message,
          },
          409,
        );
      }

      return fail(
        {
          code: "JOIN_WAITING_FAILED",
          message: error instanceof Error ? error.message : "Không thể tham gia phòng chờ",
        },
        400,
      );
    }
  });
}

