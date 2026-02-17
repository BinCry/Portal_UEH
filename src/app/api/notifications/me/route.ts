import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/route-guards";

export async function GET() {
  const auth = await requireApiRole();
  if (!auth.ok) {
    return fail({ code: "UNAUTHORIZED", message: auth.message }, auth.status);
  }

  const notifications = await prisma.notification.findMany({
    where: { userId: auth.user.id },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  return ok(notifications);
}
