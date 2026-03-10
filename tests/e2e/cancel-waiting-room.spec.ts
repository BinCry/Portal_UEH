import { expect, test } from "@playwright/test";
import { EnrollmentStatus, FinanceStatus, WaitingEntryState } from "@prisma/client";
import { createTestDbContext, makePrefix } from "../support/db-fixtures";
import { login, loginAdmin } from "./helpers/auth";

type AdminSectionRow = {
  code: string;
  registeredCount: number;
};

test("cancel waiting-confirmed enrollment removes finance row and drops admin registered count", async ({ browser, page }) => {
  const ctx = createTestDbContext(makePrefix("pw-waiting-cancel"));

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
      registeredCount: 1,
      isWaitingOption: true,
    });
    const waitingRoom = await ctx.createWaitingRoom({
      courseId: course.id,
    });

    await ctx.createWaitingEntry({
      waitingRoomId: waitingRoom.id,
      studentId: student.id,
      state: WaitingEntryState.CONFIRMED,
      offerSectionId: section.id,
      matchedPriority: 1,
      expiresAt: null,
    });
    await ctx.createEnrollment({
      studentId: student.id,
      courseId: course.id,
      sectionId: section.id,
      status: EnrollmentStatus.ENROLLED,
    });
    await ctx.createFinanceLedger({
      studentId: student.id,
      courseId: course.id,
      sectionId: section.id,
      amount: 1_350_000,
      status: FinanceStatus.POSTED,
    });

    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await loginAdmin(adminPage);

    const sectionsBefore = (await (await adminPage.request.get("/api/admin/sections")).json()).data as AdminSectionRow[];
    const adminSectionBefore = sectionsBefore.find((item) => item.code === section.code);
    expect(adminSectionBefore?.registeredCount).toBe(1);

    await login(page, student.email);
    await page.goto("/student/finance");
    const financeRowBefore = page.locator("tbody tr").filter({ hasText: course.code }).first();
    await expect(financeRowBefore).toBeVisible();
    await expect(financeRowBefore).toContainText(section.code);

    await page.goto("/student/waiting");
    const cancelRow = page
      .locator("tbody tr")
      .filter({ hasText: course.code })
      .filter({ has: page.getByRole("button", { name: /Hủy học phần|Huy hoc phan/i }) });
    await expect(cancelRow).toHaveCount(1);

    await cancelRow.getByRole("button", { name: /Hủy học phần|Huy hoc phan/i }).click();
    await Promise.all([
      page.waitForResponse((response) => response.url().includes("/api/enrollments/cancel") && response.ok()),
      page.getByRole("button", { name: /Xác nhận hủy|Xac nhan huy/i }).click(),
    ]);

    await page.goto("/student/finance");
    await expect(page.locator("tbody tr").filter({ hasText: course.code })).toHaveCount(0);

    const sectionsAfter = (await (await adminPage.request.get("/api/admin/sections")).json()).data as AdminSectionRow[];
    const adminSectionAfter = sectionsAfter.find((item) => item.code === section.code);
    expect(adminSectionAfter?.registeredCount).toBe(0);
  } finally {
    await ctx.cleanup();
  }
});