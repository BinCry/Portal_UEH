import { expect, test } from "@playwright/test";
import { createTestDbContext, makePrefix } from "../support/db-fixtures";
import { login } from "./helpers/auth";

test("direct register updates finance page and dashboard, then cancel removes both", async ({ page }) => {
  const ctx = createTestDbContext(makePrefix("pw-register-cancel"));

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
      isWaitingOption: false,
    });

    await login(page, student.email);
    await page.goto("/student/dashboard");
    await expect(page.getByText("0 VND").first()).toBeVisible();

    await page.goto(`/student/courses/${course.id}/sections`);
    const row = page.locator("tbody tr").filter({ hasText: section.code }).first();
    await expect(row).toBeVisible();
    await row.locator("input[type='radio']").check();

    await Promise.all([
      page.waitForResponse((response) => response.url().includes("/api/enroll")),
      page.locator("button.bg-blue-600").click(),
    ]);

    await page.goto("/student/waiting");
    await expect(page.getByRole("columnheader", { name: "Sĩ số" })).toBeVisible();
    const waitingHistoryRow = page
      .locator("tbody tr")
      .filter({ hasText: course.code })
      .filter({ hasText: "Đăng ký trực tiếp" })
      .first();
    await expect(waitingHistoryRow).toBeVisible();
    await expect(waitingHistoryRow.locator("td").nth(4)).toHaveText("1");

    await page.goto("/student/finance");
    const financeRow = page.locator("tbody tr").filter({ hasText: course.code }).first();
    await expect(financeRow).toBeVisible();
    await expect(financeRow).toContainText(section.code);

    await page.goto("/student/dashboard");
    await expect(page.getByText("1.350.000 VND").first()).toBeVisible();

    const enrollmentsResponse = await page.request.get("/api/enrollments/me");
    expect(enrollmentsResponse.ok()).toBeTruthy();
    const enrollmentsPayload = await enrollmentsResponse.json();
    const enrollment = enrollmentsPayload.data.find(
      (item: { id: string; section: { code: string; course: { code: string } } }) =>
        item.section.code === section.code && item.section.course.code === course.code,
    );
    expect(enrollment).toBeTruthy();

    const cancelResponse = await page.request.post("/api/enrollments/cancel", {
      data: { enrollmentId: enrollment.id },
    });
    expect(cancelResponse.ok()).toBeTruthy();

    await page.goto("/student/finance");
    await expect(page.locator("tbody tr").filter({ hasText: course.code })).toHaveCount(0);

    await page.goto("/student/dashboard");
    await expect(page.getByText("0 VND").first()).toBeVisible();
  } finally {
    await ctx.cleanup();
  }
});
