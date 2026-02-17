import { fail, ok } from "@/lib/api";
import { withApiTiming } from "@/lib/api-timing";
import { notificationService } from "@/domain/services/notification.service";
import { requireApiRole } from "@/lib/route-guards";

type RouteContext = {
  params: Promise<{
    notificationId: string;
  }>;
};

export async function DELETE(_: Request, context: RouteContext) {
  return withApiTiming("DELETE /api/notifications/:notificationId", async () => {
    const auth = await requireApiRole();
    if (!auth.ok) {
      return fail({ code: "UNAUTHORIZED", message: auth.message }, auth.status);
    }

    const { notificationId } = await context.params;
    if (!notificationId) {
      return fail({ code: "INVALID_NOTIFICATION_ID", message: "Missing notification id" }, 400);
    }

    const result = await notificationService.deleteReadById(auth.user.id, notificationId);
    if (!result.count) {
      return fail({ code: "NOT_FOUND_OR_UNREAD", message: "Notification not found or unread" }, 404);
    }

    return ok({ deleted: true });
  });
}
