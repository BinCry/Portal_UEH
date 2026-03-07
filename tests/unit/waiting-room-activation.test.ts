import { describe, expect, it } from "vitest";
import { shouldActivateWaitingRoom } from "@/domain/policies/waiting-room";

describe("waiting room activation threshold", () => {
  it("activates when all sections have <= 5 available slots", () => {
    const result = shouldActivateWaitingRoom([
      { capacity: 45, registeredCount: 40, reservedCount: 0 }, // 5 slots
      { capacity: 90, registeredCount: 85, reservedCount: 0 }, // 5 slots
      { capacity: 50, registeredCount: 46, reservedCount: 0 }, // 4 slots
    ]);
    expect(result).toBe(true);
  });

  it("does not activate when at least one section has > 5 available slots", () => {
    const result = shouldActivateWaitingRoom([
      { capacity: 45, registeredCount: 40, reservedCount: 0 }, // 5 slots
      { capacity: 90, registeredCount: 80, reservedCount: 0 }, // 10 slots
    ]);
    expect(result).toBe(false);
  });
});
