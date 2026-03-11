import { expect, test } from "@playwright/test";
import { createTestDbContext, makePrefix } from "../support/db-fixtures";
import { login } from "./helpers/auth";

test("waiting confirm creates finance row for the offered section", async ({ page }) => {
  const ctx = createTestDbContext(makePrefix("pw-waiting-confirm"));

  try {
    const student = await ctx.createStudentAccount();
    const course = await ctx.createCourse();
    const room = await ctx.createRoom();
    const timeSlot = await ctx.createTimeSlot();
    const section = await ctx.createSection({
      courseId: course.id,
      roomId: room.id,
      timeSlotId: timeSlot.id,
      capacity: 5,
      reservedCount: 1,
      isWaitingOption: true,
    });
    const waitingRoom = await ctx.createWaitingRoom({
      courseId: course.id,
    });

    await ctx.createWaitingEntry({
      waitingRoomId: waitingRoom.id,
      studentId: student.id,
      offerSectionId: section.id,
      matchedPriority: 1,
    });

    await login(page, student.email);
    await page.goto("/student/waiting");

    const actionRow = page
      .locator("tbody tr")
      .filter({ hasText: course.code })
      .filter({ has: page.getByRole("button", { name: /Xác nhận/i }) });
    await expect(actionRow).toHaveCount(1);

    await Promise.all([
      page.waitForResponse((response) => response.url().includes("/api/waiting/confirm") && response.ok()),
      actionRow.getByRole("button", { name: /Xác nhận/i }).click(),
    ]);

    await page.goto("/student/finance");
    const financeRow = page.locator("tbody tr").filter({ hasText: course.code });
    await expect(financeRow).toHaveCount(1);
    await expect(financeRow.getByText(section.code)).toBeVisible();

    await page.goto("/student/dashboard");
    await expect(page.getByText("1.350.000 VND").first()).toBeVisible();
  } finally {
    await ctx.cleanup();
  }
});
