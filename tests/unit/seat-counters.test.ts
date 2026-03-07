import { describe, expect, it } from "vitest";
import { validateSeatCounters } from "@/domain/policies/capacity";

describe("seat counter guard", () => {
  it("rejects when registered count is smaller than enrolled count", () => {
    const error = validateSeatCounters({
      capacity: 45,
      registeredCount: 10,
      reservedCount: 0,
      enrolledCount: 11,
    });
    expect(error).toMatch(/ENROLLED/i);
  });

  it("rejects when registered + reserved exceeds capacity", () => {
    const error = validateSeatCounters({
      capacity: 45,
      registeredCount: 42,
      reservedCount: 4,
      enrolledCount: 40,
    });
    expect(error).toBeTruthy();
  });

  it("accepts safe counter values", () => {
    const error = validateSeatCounters({
      capacity: 45,
      registeredCount: 40,
      reservedCount: 2,
      enrolledCount: 39,
    });
    expect(error).toBeNull();
  });
});
