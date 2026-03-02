import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { requireApiRole } from "@/lib/route-guards";
import { approvalService } from "@/domain/services/approval-service";

type Context = {
  params: Promise<{ roomId: string }>;
};

const schema = z.object({
  reason: z.string().min(3).max(500),
});

export async function POST(request: Request, context: Context) {
  const auth = await requireApiRole("ADMIN");
  if (!auth.ok) return fail({ code: "UNAUTHORIZED", message: auth.message }, auth.status);

  try {
    const { roomId } = await context.params;
    const body = await parseBody(request, schema);
    const approval = await approvalService.manualReject(roomId, auth.user.id, body.reason);
    return ok({ approval });
  } catch (error) {
    return fail(
      {
        code: "REJECT_FAILED",
        message: "Không thể từ chối phòng chờ",
        details: error,
      },
      400,
    );
  }
}

