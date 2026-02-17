import { describe, expect, it } from "vitest";
import { chooseSectionByPriority } from "@/domain/services/matching.logic";

describe("Matching by priority", () => {
  it("picks first available non-conflict section", () => {
    const selected = chooseSectionByPriority(
      [{ sectionId: "s1" }, { sectionId: "s2" }, { sectionId: "s3" }],
      [
        { id: "s1", available: 0 },
        { id: "s2", available: 3, hasConflict: true },
        { id: "s3", available: 1 },
      ],
    );
    expect(selected).toBe("s3");
  });

  it("returns null when all priorities invalid", () => {
    const selected = chooseSectionByPriority(
      [{ sectionId: "s1" }],
      [{ id: "s1", available: 0 }],
    );
    expect(selected).toBeNull();
  });
});
