import { describe, expect, it } from "vitest";
import { canUpdateCapacity } from "@/domain/policies/capacity";

describe("Capacity hidden permission guard", () => {
  it("blocks when capacity is hidden and waiting room is inactive", () => {
    const allowed = canUpdateCapacity({
      capacityHidden: true,
      waitingRoomActive: false,
      userCanOverride: false,
      overrideRequested: false,
    });
    expect(allowed).toBe(false);
  });

  it("allows when waiting room is active", () => {
    const allowed = canUpdateCapacity({
      capacityHidden: true,
      waitingRoomActive: true,
      userCanOverride: false,
      overrideRequested: false,
    });
    expect(allowed).toBe(true);
  });

  it("allows admin override only when explicitly requested", () => {
    const allowed = canUpdateCapacity({
      capacityHidden: true,
      waitingRoomActive: false,
      userCanOverride: true,
      overrideRequested: true,
    });
    expect(allowed).toBe(true);
  });
});
