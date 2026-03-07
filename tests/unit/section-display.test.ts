import { describe, expect, it } from "vitest";
import {
  dayOfWeekLabel,
  formatDateRangeVi,
  formatDateVi,
  formatGTime,
  formatSectionLocation,
  formatSectionScheduleSummary,
} from "@/lib/section-display";

describe("section display formatter", () => {
  it("formats day of week to Vietnamese label", () => {
    expect(dayOfWeekLabel("WEDNESDAY")).toBe("Thứ Tư");
  });

  it("formats time to g style", () => {
    expect(formatGTime("07:10")).toBe("7g10");
    expect(formatGTime("11:30")).toBe("11g30");
  });

  it("formats date and date range", () => {
    expect(formatDateVi("2025-01-07T00:00:00.000Z")).toBe("07/01/2025");
    expect(formatDateRangeVi("2025-01-07T00:00:00.000Z", "2025-03-18T00:00:00.000Z")).toBe(
      "07/01/2025 - 18/03/2025",
    );
  });

  it("prioritizes room address then campus + code fallback", () => {
    expect(
      formatSectionLocation({
        address: "Đường Nguyễn Văn Linh - Khu chức năng số 15",
        campus: "Nam Sài Gòn",
        roomCode: "B1-0904",
      }),
    ).toBe("Đường Nguyễn Văn Linh - Khu chức năng số 15");

    expect(
      formatSectionLocation({
        address: null,
        campus: "Nam Sài Gòn",
        roomCode: "B1-0904",
      }),
    ).toBe("Nam Sài Gòn - B1-0904");
  });

  it("formats full section schedule summary", () => {
    expect(
      formatSectionScheduleSummary({
        dayOfWeek: "WEDNESDAY",
        startTime: "07:10",
        endTime: "11:30",
        startDate: "2025-01-07T00:00:00.000Z",
        endDate: "2025-03-18T00:00:00.000Z",
        address: "Đường Nguyễn Văn Linh - Khu chức năng số 15, TP. Hồ Chí Minh",
        campus: "Nam Sài Gòn",
        roomCode: "B1-0904",
      }),
    ).toBe(
      "Thứ Tư, 7g10 - 11g30, 07/01/2025 - 18/03/2025, Đường Nguyễn Văn Linh - Khu chức năng số 15, TP. Hồ Chí Minh",
    );
  });
});
