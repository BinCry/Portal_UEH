import type { DayOfWeek, Section, TimeSlot } from "@prisma/client";

type SectionWithTime = Pick<Section, "dayOfWeek"> & {
  timeSlot: Pick<TimeSlot, "startTime" | "endTime">;
};

const toMinutes = (value: string) => {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
};

const overlap = (aStart: string, aEnd: string, bStart: string, bEnd: string) =>
  toMinutes(aStart) < toMinutes(bEnd) && toMinutes(bStart) < toMinutes(aEnd);

export const hasScheduleConflict = (candidate: SectionWithTime, existing: SectionWithTime[]) =>
  existing.some(
    (section) =>
      section.dayOfWeek === (candidate.dayOfWeek as DayOfWeek) &&
      overlap(
        section.timeSlot.startTime,
        section.timeSlot.endTime,
        candidate.timeSlot.startTime,
        candidate.timeSlot.endTime,
      ),
  );

export const computeStudentSectionStatus = (
  capacity: number,
  registeredCount: number,
  reservedCount: number,
  buffer: number,
) => {
  const available = capacity - registeredCount - reservedCount;
  if (available <= 0) return "FULL";
  if (available <= buffer) return "NEAR_FULL";
  return "AVAILABLE";
};
