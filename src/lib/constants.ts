export const OTP_LENGTH = Number(process.env.OTP_LENGTH ?? 6);
export const OTP_EXPIRE_MINUTES = Number(process.env.OTP_EXPIRE_MINUTES ?? 5);
export const OTP_RATE_LIMIT_WINDOW_MINUTES = Number(
  process.env.OTP_RATE_LIMIT_WINDOW_MINUTES ?? 15,
);
export const OTP_RATE_LIMIT_MAX_REQUESTS = Number(process.env.OTP_RATE_LIMIT_MAX_REQUESTS ?? 5);
export const LOCK_MAX_ATTEMPTS = Number(process.env.LOCK_MAX_ATTEMPTS ?? 5);
export const LOCK_WINDOW_MINUTES = Number(process.env.LOCK_WINDOW_MINUTES ?? 15);
export const LOCK_DURATION_MINUTES = Number(process.env.LOCK_DURATION_MINUTES ?? 15);
export const WAITING_BUFFER_DEFAULT = Number(process.env.WAITING_BUFFER_DEFAULT ?? 5);
export const WAITING_SLA_HOURS = Number(process.env.WAITING_SLA_HOURS ?? 48);
export const WAITING_OFFER_EXPIRE_HOURS = Number(process.env.WAITING_OFFER_EXPIRE_HOURS ?? 24);
export const WAITING_BLOCK_NEXT_SEMESTER_DAYS = Number(process.env.WAITING_BLOCK_NEXT_SEMESTER_DAYS ?? 180);
export const WAITING_PRIORITY_PENALTY_DAYS = Number(process.env.WAITING_PRIORITY_PENALTY_DAYS ?? 30);
export const HISTORY_RETENTION_DAYS = Number(process.env.HISTORY_RETENTION_DAYS ?? 2);
export const TUITION_PER_CREDIT = Number(process.env.TUITION_PER_CREDIT ?? 450_000);
export const TIMEZONE = process.env.TIMEZONE ?? "Asia/Ho_Chi_Minh";
export const WAITING_ROOM_OPEN_SLOT_THRESHOLD = 5;
