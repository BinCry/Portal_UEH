import { fail, ok } from "@/lib/api";
import { withApiTiming } from "@/lib/api-timing";
import { requireApiRole } from "@/lib/route-guards";
import { studentEnrollmentHistoryService } from "@/domain/services/student-enrollment-history.service";

export async function GET() {
  return withApiTiming("GET /api/enrollments/me", async () => {
    const auth = await requireApiRole("STUDENT");
    if (!auth.ok) {
      return fail({ code: "UNAUTHORIZED", message: auth.message }, auth.status);
    }

    const enrollments = await studentEnrollmentHistoryService.getForStudent(auth.user.id);
    return ok(enrollments);
  });
}
