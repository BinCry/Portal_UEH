import { expect, test } from "@playwright/test";
import { NotificationType } from "@prisma/client";
import { prisma } from "../../src/lib/prisma";
import { createTestDbContext, makePrefix } from "../support/db-fixtures";
import { login } from "./helpers/auth";

test("notification bell confirm refreshes the open waiting page", async ({ page }) => {
  const ctx = createTestDbContext(makePrefix("pw-notify-sync"));

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
    const waitingRoom = await ctx.createWaitingRoom({ courseId: course.id });
    const waitingEntry = await ctx.createWaitingEntry({
      waitingRoomId: waitingRoom.id,
      studentId: student.id,
      offerSectionId: section.id,
      matchedPriority: 1,
    });

    await prisma.notification.create({
      data: {
        userId: student.id,
        type: NotificationType.WAITING_OFFER,
        payloadJson: {
          title: "Offer sync",
          message: "Confirm this offer from the bell",
          waitingEntryId: waitingEntry.id,
          waitingRoomId: waitingRoom.id,
          courseName: course.name,
        },
      },
    });

    await login(page, student.email);
    await page.goto("/student/waiting");

    const actionRow = page
      .locator("tbody tr")
      .filter({ hasText: course.code })
      .filter({ has: page.getByRole("button", { name: /Xác nhận/i }) });
    await expect(actionRow).toHaveCount(1);

    await page.getByRole("button", { name: "Open notifications" }).click();
    await expect(page.getByText("Offer sync")).toBeVisible();
    await page.getByText("Offer sync").click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await Promise.all([
      page.waitForResponse((response) => response.url().includes("/api/waiting/confirm") && response.ok()),
      dialog.getByRole("button", { name: "Confirm waiting offer" }).click(),
    ]);

    const enrolledRow = page
      .locator("tbody tr")
      .filter({ hasText: course.code })
      .filter({ hasText: "Qua phòng chờ" })
      .first();
    await expect(enrolledRow).toBeVisible();
    await expect(enrolledRow.locator("td").nth(4)).toHaveText("1");
    await expect(
      page
        .locator("tbody tr")
        .filter({ hasText: course.code })
        .filter({ has: page.getByRole("button", { name: /Xác nhận/i }) }),
    ).toHaveCount(0);
  } finally {
    await ctx.cleanup();
  }
});
