import { describe, expect, it } from "vitest";
import { sortFifo } from "@/domain/services/matching.logic";

describe("FIFO ordering", () => {
  it("sorts by joinedAt asc then id asc", () => {
    const items = [
      { id: "b", joinedAt: new Date("2026-02-17T10:00:00Z") },
      { id: "a", joinedAt: new Date("2026-02-17T10:00:00Z") },
      { id: "c", joinedAt: new Date("2026-02-17T09:59:59Z") },
    ];
    const sorted = sortFifo(items);
    expect(sorted.map((x) => x.id)).toEqual(["c", "a", "b"]);
  });
});
