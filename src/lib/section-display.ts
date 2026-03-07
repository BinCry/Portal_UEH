import { TIMEZONE } from "@/lib/constants";

const dayOfWeekMap: Record<string, string> = {
  MONDAY: "Thứ Hai",
  TUESDAY: "Thứ Ba",
  WEDNESDAY: "Thứ Tư",
  THURSDAY: "Thứ Năm",
  FRIDAY: "Thứ Sáu",
  SATURDAY: "Thứ Bảy",
  SUNDAY: "Chủ Nhật",
};

const toDate = (value?: string | Date | null) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

export const dayOfWeekLabel = (day: string) => dayOfWeekMap[day] ?? day;

export const formatGTime = (value?: string | null) => {
  if (!value) return null;
  const matched = /^(\d{2}):(\d{2})$/.exec(value.trim());
  if (!matched) return value;

  const hour = Number(matched[1]);
  const minute = matched[2];
  return `${hour}g${minute}`;
};

export const formatDateVi = (value?: string | Date | null) => {
  const date = toDate(value);
  if (!date) return null;

  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: TIMEZONE,
  }).format(date);
};

export const formatDateRangeVi = (startDate?: string | Date | null, endDate?: string | Date | null) => {
  const start = formatDateVi(startDate);
  const end = formatDateVi(endDate);

  if (start && end) return `${start} - ${end}`;
  if (start) return start;
  if (end) return end;
  return "Đang cập nhật";
};

export const formatSectionLocation = ({
  address,
  campus,
  roomCode,
}: {
  address?: string | null;
  campus?: string | null;
  roomCode?: string | null;
}) => {
  const normalizedAddress = address?.trim();
  if (normalizedAddress) return normalizedAddress;

  const normalizedCampus = campus?.trim();
  const normalizedRoomCode = roomCode?.trim();
  if (normalizedCampus && normalizedRoomCode) return `${normalizedCampus} - ${normalizedRoomCode}`;
  if (normalizedCampus) return normalizedCampus;
  if (normalizedRoomCode) return normalizedRoomCode;
  return "Đang cập nhật";
};

export const formatSectionScheduleSummary = ({
  dayOfWeek,
  startTime,
  endTime,
  startDate,
  endDate,
  address,
  campus,
  roomCode,
}: {
  dayOfWeek: string;
  startTime?: string | null;
  endTime?: string | null;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
  address?: string | null;
  campus?: string | null;
  roomCode?: string | null;
}) => {
  const day = dayOfWeekLabel(dayOfWeek);
  const formattedStart = formatGTime(startTime);
  const formattedEnd = formatGTime(endTime);
  const timeRange = formattedStart && formattedEnd ? `${formattedStart} - ${formattedEnd}` : "Đang cập nhật";
  const dateRange = formatDateRangeVi(startDate, endDate);
  const location = formatSectionLocation({ address, campus, roomCode });

  return `${day}, ${timeRange}, ${dateRange}, ${location}`;
};
