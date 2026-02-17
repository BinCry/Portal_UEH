import { fail, ok } from "@/lib/api";
import { notificationService } from "@/domain/services/notification.service";
import { requireApiRole } from "@/lib/route-guards";

export async function POST() {
  const auth = await requireApiRole();
  if (!auth.ok) {
    return fail({ code: "UNAUTHORIZED", message: auth.message }, auth.status);
  }

  await notificationService.markAllRead(auth.user.id);
  return ok({ message: "Da danh dau da doc" });
}

export async function DELETE() {
  const auth = await requireApiRole();
  if (!auth.ok) {
    return fail({ code: "UNAUTHORIZED", message: auth.message }, auth.status);
  }

  const result = await notificationService.deleteAllRead(auth.user.id);
  return ok({ deletedCount: result.count });
}
