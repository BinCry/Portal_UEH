import { fail, ok } from "@/lib/api";
import { validateCronSecret } from "@/lib/cron-auth";
import { approvalService } from "@/domain/services/approval-service";

export async function POST(request: Request) {
  const unauthorized = validateCronSecret(request);
  if (unauthorized) return unauthorized;

  try {
    const result = await approvalService.scanSlaAndAutoResolve();
    return ok(result);
  } catch (error) {
    return fail(
      {
        code: "SLA_SCAN_FAILED",
        message: "Không thể quét SLA",
        details: error,
      },
      500,
    );
  }
}
