import { fail } from "@/lib/api";

export const validateCronSecret = (request: Request) => {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  const token = header?.replace("Bearer ", "");

  if (!secret || token !== secret) {
    return fail({ code: "UNAUTHORIZED", message: "Invalid cron secret" }, 401);
  }
  return null;
};
