import { fail, ok } from "@/lib/api";
import { withApiTiming } from "@/lib/api-timing";
import { parseBody } from "@/lib/http";
import { requireApiRole } from "@/lib/route-guards";
import { waitingDecisionSchema } from "@/lib/zod-schemas/waiting";
import { enrollmentService } from "@/domain/services/enrollment.service";

export async function POST(request: Request) {
  return withApiTiming("POST /api/waiting/confirm", async () => {
    const auth = await requireApiRole("STUDENT");
    if (!auth.ok) {
      return fail({ code: "UNAUTHORIZED", message: auth.message }, auth.status);
    }

    try {
      const body = await parseBody(request, waitingDecisionSchema);
      const result = await enrollmentService.confirmWaitingOffer(auth.user.id, body.waitingEntryId);
      return ok(result);
    } catch (error) {
      return fail(
        {
          code: "CONFIRM_FAILED",
          message: error instanceof Error ? error.message : "Không th? xac nhan offer",
        },
        400,
      );
    }
  });
}

