import { expect, test } from "@playwright/test";
import { WaitingEntryState } from "@prisma/client";
import { createTestDbContext, makePrefix } from "../support/db-fixtures";
import { login, loginAdmin } from "./helpers/auth";

test("admin recovers orphan waiting room, approves entry, and student confirms the offer", async ({
  browser,
}) => {
  const ctx = createTestDbContext(makePrefix("pw-admin-recovery"));

  try {
    const studentName = `Student ${ctx.token}`;
    const student = await ctx.createStudentAccount({ fullName: studentName });
    const course = await ctx.createCourse({ code: `CRS-${ctx.token}-ORPHAN` });
    const room = await ctx.createRoom();
    const timeSlot = await ctx.createTimeSlot();
    const waitingSection = await ctx.createSection({
      courseId: course.id,
      roomId: room.id,
      timeSlotId: timeSlot.id,
      code: `SEC-${ctx.token}-ORPHAN`,
      capacity: 5,
      isWaitingOption: true,
    });
    const waitingRoom = await ctx.createWaitingRoom({ courseId: course.id });
    const waitingEntry = await ctx.createWaitingEntry({
      waitingRoomId: waitingRoom.id,
      studentId: student.id,
      state: WaitingEntryState.QUEUED,
      offerSectionId: null,
      prioritiesJson: [{ sectionId: waitingSection.id }],
      matchedPriority: null,
      expiresAt: null,
    });

    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await loginAdmin(adminPage);
    await adminPage.goto("/admin/waiting-rooms");

    const roomRow = adminPage.locator("tbody tr").filter({ hasText: course.code }).first();
    await expect(roomRow).toBeVisible();
    await expect(roomRow).toContainText("FIFO 1");
    await expect(roomRow).toContainText(/Cần khôi phục duyệt/i);
    const queuedRow = adminPage
      .locator("tbody tr")
      .filter({ hasText: course.code })
      .filter({ hasText: studentName })
      .filter({ hasText: "#1" })
      .first();
    await expect(queuedRow).toBeVisible();

    await Promise.all([
      adminPage.waitForResponse(
        (response) =>
          response.url().includes(`/api/admin/waiting/${waitingRoom.id}/approve`) && response.ok(),
      ),
      roomRow.getByRole("button", { name: /Phê duyệt room/i }).click(),
    ]);

    const entryRow = adminPage
      .locator("tbody tr")
      .filter({ hasText: course.code })
      .filter({ hasText: studentName })
      .first();
    await expect(entryRow).toBeVisible();
    await expect(entryRow).toContainText(waitingSection.code);

    await Promise.all([
      adminPage.waitForResponse(
        (response) =>
          response.url().includes(`/api/admin/waiting/entries/${waitingEntry.id}/approve`) &&
          response.ok(),
      ),
      entryRow.getByRole("button", { name: /Duyệt entry/i }).click(),
    ]);

    const studentContext = await browser.newContext();
    const studentPage = await studentContext.newPage();
    await login(studentPage, student.email);
    await studentPage.goto("/student/waiting");

    const confirmRow = studentPage
      .locator("tbody tr")
      .filter({ hasText: course.code })
      .filter({ has: studentPage.getByRole("button", { name: /Xác nhận/i }) });
    await expect(confirmRow).toHaveCount(1);

    await Promise.all([
      studentPage.waitForResponse(
        (response) => response.url().includes("/api/waiting/confirm") && response.ok(),
      ),
      confirmRow.getByRole("button", { name: /Xác nhận/i }).click(),
    ]);

    await studentPage.goto("/student/finance");
    const financeRow = studentPage.locator("tbody tr").filter({ hasText: course.code });
    await expect(financeRow).toHaveCount(1);
    await expect(financeRow).toContainText(waitingSection.code);

    await adminContext.close();
    await studentContext.close();
  } finally {
    await ctx.cleanup();
  }
});
