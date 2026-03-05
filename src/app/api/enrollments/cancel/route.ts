import { fail, ok } from "@/lib/api";
import { withApiTiming } from "@/lib/api-timing";
import { parseBody } from "@/lib/http";
import { requireApiRole } from "@/lib/route-guards";
import { cancelEnrollmentSchema } from "@/lib/zod-schemas/student";
import { enrollmentService } from "@/domain/services/enrollment.service";

export async function POST(request: Request) {
  return withApiTiming("POST /api/enrollments/cancel", async () => {
    const auth = await requireApiRole("STUDENT");
    if (!auth.ok) {
      return fail({ code: "UNAUTHORIZED", message: auth.message }, auth.status);
    }

    try {
      const body = await parseBody(request, cancelEnrollmentSchema);
      const result = await enrollmentService.cancelEnrollment(auth.user.id, body.enrollmentId);
      return ok(result);
    } catch (error) {
      return fail(
        {
          code: "CANCEL_ENROLLMENT_FAILED",
          message: error instanceof Error ? error.message : "Không thể hủy học phần",
        },
        409,
      );
    }
  });
}
