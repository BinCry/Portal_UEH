import { fail, ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { requireApiRole } from "@/lib/route-guards";
import { waitingDecisionSchema } from "@/lib/zod-schemas/waiting";
import { enrollmentService } from "@/domain/services/enrollment.service";

export async function POST(request: Request) {
  const auth = await requireApiRole("STUDENT");
  if (!auth.ok) {
    return fail({ code: "UNAUTHORIZED", message: auth.message }, auth.status);
  }

  try {
    const body = await parseBody(request, waitingDecisionSchema);
    await enrollmentService.declineWaitingOffer(auth.user.id, body.waitingEntryId);
    return ok({ message: "Đã từ chối offer" });
  } catch (error) {
    return fail(
      {
        code: "DECLINE_FAILED",
        message: error instanceof Error ? error.message : "Không thể từ chối offer",
      },
      400,
    );
  }
}

