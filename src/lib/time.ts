import { addDays, addHours, addMinutes } from "date-fns";

export const now = () => new Date();

export const addMinutesFromNow = (minutes: number) => addMinutes(now(), minutes);
export const addHoursFromNow = (hours: number) => addHours(now(), hours);
export const addDaysFromNow = (days: number) => addDays(now(), days);

export const isExpired = (date?: Date | null) => Boolean(date && date.getTime() <= now().getTime());

export const getSecondsRemaining = (date?: Date | null) => {
  if (!date) return 0;
  const seconds = Math.floor((date.getTime() - now().getTime()) / 1000);
  return Math.max(0, seconds);
};
