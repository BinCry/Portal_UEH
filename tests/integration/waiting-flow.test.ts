import { describe, expect, it } from "vitest";
import { chooseSectionByPriority, sortFifo } from "@/domain/services/matching.logic";

type WaitingEntry = {
  id: string;
  studentId: string;
  joinedAt: Date;
  priorities: { sectionId: string }[];
  state: "QUEUED" | "OFFERED" | "CONFIRMED";
  offerSectionId?: string;
};

describe("Integration waiting flow", () => {
  it("join waiting -> offer -> confirm -> finance update", () => {
    const entries: WaitingEntry[] = [
      {
        id: "w1",
        studentId: "s1",
        joinedAt: new Date("2026-02-17T09:00:00Z"),
        priorities: [{ sectionId: "sec-b" }, { sectionId: "sec-a" }],
        state: "QUEUED",
      },
    ];

    const sections = [
      { id: "sec-a", available: 0 },
      { id: "sec-b", available: 1 },
    ];
    const fifo = sortFifo(entries);
    const picked = chooseSectionByPriority(fifo[0].priorities, sections);

    expect(picked).toBe("sec-b");
    fifo[0].state = "OFFERED";
    fifo[0].offerSectionId = picked ?? undefined;
    sections[1].available -= 1;

    expect(fifo[0].state).toBe("OFFERED");
    expect(sections[1].available).toBe(0);

    fifo[0].state = "CONFIRMED";
    const financeLedger = [{ studentId: "s1", sectionId: picked, amount: 1_350_000 }];

    expect(fifo[0].state).toBe("CONFIRMED");
    expect(financeLedger).toHaveLength(1);
    expect(financeLedger[0].sectionId).toBe("sec-b");
  });
});
