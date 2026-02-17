import { fail, ok } from "@/lib/api";
import { requireApiRole } from "@/lib/route-guards";
import { waitingEntryService } from "@/domain/services/waiting-entry.service";

export async function GET() {
  const auth = await requireApiRole("STUDENT");
  if (!auth.ok) {
    return fail({ code: "UNAUTHORIZED", message: auth.message }, auth.status);
  }

  const entries = await waitingEntryService.getForStudent(auth.user.id);
  return ok(entries);
}
