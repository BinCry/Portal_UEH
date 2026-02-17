import { fail, ok } from "@/lib/api";
import { withApiTiming } from "@/lib/api-timing";
import { requireApiRole } from "@/lib/route-guards";
import { waitingEntryService } from "@/domain/services/waiting-entry.service";

export async function GET() {
  return withApiTiming("GET /api/waiting/me", async () => {
    const auth = await requireApiRole("STUDENT");
    if (!auth.ok) {
      return fail({ code: "UNAUTHORIZED", message: auth.message }, auth.status);
    }

    const entries = await waitingEntryService.getForStudent(auth.user.id);
    return ok(entries);
  });
}
