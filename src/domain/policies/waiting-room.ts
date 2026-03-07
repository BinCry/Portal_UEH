import { WAITING_ROOM_OPEN_SLOT_THRESHOLD } from "@/lib/constants";

export const getSectionAvailableSlots = (capacity: number, registered: number, reserved: number) =>
  capacity - registered - reserved;

export const shouldActivateWaitingRoom = (
  sections: Array<{ capacity: number; registeredCount: number; reservedCount: number }>,
) =>
  sections.length > 0 &&
  sections.every(
    (section) =>
      getSectionAvailableSlots(section.capacity, section.registeredCount, section.reservedCount) <=
      WAITING_ROOM_OPEN_SLOT_THRESHOLD,
  );
