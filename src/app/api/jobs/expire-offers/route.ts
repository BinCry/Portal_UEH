import { fail, ok } from "@/lib/api";
import { validateCronSecret } from "@/lib/cron-auth";
import { enrollmentService } from "@/domain/services/enrollment.service";

export async function POST(request: Request) {
  const unauthorized = validateCronSecret(request);
  if (unauthorized) return unauthorized;

  try {
    const result = await enrollmentService.expireOfferedEntries();
    return ok(result);
  } catch (error) {
    return fail(
      {
        code: "EXPIRE_FAILED",
        message: "Không thể xử lý offer hết hạn",
        details: error,
      },
      500,
    );
  }
}

