import { expect, test } from "@playwright/test";
import { NotificationType } from "@prisma/client";
import { prisma } from "../../src/lib/prisma";
import { createTestDbContext, makePrefix } from "../support/db-fixtures";
import { login } from "./helpers/auth";

test("waiting confirm from notification creates finance row and updates waiting page", async ({ page }) => {
  const ctx = createTestDbContext(makePrefix("pw-waiting-confirm"));

  try {
    const student = await ctx.createStudentAccount();
    const queuedStudent = await ctx.createStudentAccount({ email: `${ctx.prefix}-queued@ueh.edu.vn` });
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
    const waitingEntry = await ctx.createWaitingEntry({
      waitingRoomId: waitingRoom.id,
      studentId: student.id,
      offerSectionId: section.id,
      matchedPriority: 1,
    });
    await ctx.createWaitingEntry({
      waitingRoomId: waitingRoom.id,
      studentId: queuedStudent.id,
      state: "QUEUED",
      offerSectionId: null,
      prioritiesJson: [{ sectionId: section.id }],
      expiresAt: null,
    });

    await prisma.notification.create({
      data: {
        userId: student.id,
        type: NotificationType.WAITING_OFFER,
        payloadJson: {
          title: "Offer waiting confirm",
          message: "Confirm this waiting offer",
          waitingEntryId: waitingEntry.id,
          waitingRoomId: waitingRoom.id,
          courseName: course.name,
        },
      },
    });

    await login(page, student.email);
    await page.goto("/student/waiting");
    const main = page.getByRole("main");
    await expect(main.getByText("Chưa có học phần đã đăng ký.")).toBeVisible();
    await expect(main.getByText("Lịch sử yêu cầu phòng chờ")).toHaveCount(0);

    await page.getByRole("button", { name: "Open notifications" }).click();
    await expect(page.getByText("Offer waiting confirm")).toBeVisible();
    await page.getByText("Offer waiting confirm").click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await Promise.all([
      page.waitForResponse((response) => response.url().includes("/api/waiting/confirm") && response.ok()),
      dialog.getByRole("button", { name: "Confirm waiting offer" }).click(),
    ]);

    await expect(page.getByRole("columnheader", { name: "Sĩ số" })).toBeVisible();
    const enrolledRow = page
      .locator("tbody tr")
      .filter({ hasText: course.code })
      .filter({ hasText: "Qua phòng chờ" })
      .first();
    await expect(enrolledRow).toBeVisible();
    await expect(enrolledRow.locator("td").nth(4)).toHaveText("2");

    await page.goto("/student/finance");
    const financeRow = page.locator("tbody tr").filter({ hasText: course.code });
    await expect(financeRow).toHaveCount(1);
    await expect(financeRow.first()).toContainText(section.code);

    await page.goto("/student/dashboard");
    await expect(page.getByText("1.350.000 VND").first()).toBeVisible();
  } finally {
    await ctx.cleanup();
  }
});
