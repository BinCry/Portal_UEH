import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { requireApiRole } from "@/lib/route-guards";
import { approvalService } from "@/domain/services/approval-service";

type Context = {
  params: Promise<{ entryId: string }>;
};

const schema = z.object({
  reason: z.string().max(500).optional(),
});

export async function POST(request: Request, context: Context) {
  const auth = await requireApiRole("ADMIN");
  if (!auth.ok) return fail({ code: "UNAUTHORIZED", message: auth.message }, auth.status);

  try {
    const body = await parseBody(request, schema);
    const { entryId } = await context.params;

    const entry = await approvalService.approveEntry(entryId, auth.user.id, body.reason);
    return ok({ entry });
  } catch (error) {
    return fail(
      {
        code: "APPROVE_ENTRY_FAILED",
        message: error instanceof Error ? error.message : "Không thể phê duyệt entry",
        details: error,
      },
      400,
    );
  }
}

