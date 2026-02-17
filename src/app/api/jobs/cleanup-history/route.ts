import { fail, ok } from "@/lib/api";
import { validateCronSecret } from "@/lib/cron-auth";
import { historyCleanupService } from "@/domain/services/history-cleanup.service";

export async function POST(request: Request) {
  const unauthorized = validateCronSecret(request);
  if (unauthorized) return unauthorized;

  try {
    const result = await historyCleanupService.cleanupOldHistory();
    return ok(result);
  } catch (error) {
    return fail(
      {
        code: "HISTORY_CLEANUP_FAILED",
        message: "Khong the don lich su he thong",
        details: error,
      },
      500,
    );
  }
}
