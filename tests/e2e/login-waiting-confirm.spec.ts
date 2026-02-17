import { expect, test } from "@playwright/test";

const login = async (page: import("@playwright/test").Page, email: string, password: string) => {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: /Đăng nhập|Dang nhap/i }).click();
  await page.waitForURL("**/student/dashboard");
};

test("login -> join waiting -> see position -> confirm offered", async ({ page }) => {
  await login(page, "student8@ueh.edu.vn", "123456");

  const coursesRes = await page.request.get("/api/courses");
  expect(coursesRes.ok()).toBeTruthy();
  const coursesPayload = await coursesRes.json();
  const waitingCourse =
    coursesPayload.data.find((course: { waitingRoom: { isActive: boolean } | null }) => course.waitingRoom?.isActive) ??
    coursesPayload.data[0];
  expect(waitingCourse).toBeTruthy();

  const sectionsRes = await page.request.get(`/api/courses/${waitingCourse.id}/sections`);
  expect(sectionsRes.ok()).toBeTruthy();
  const sectionsPayload = await sectionsRes.json();
  const priorities = sectionsPayload.data.waitingSections
    .slice(0, 3)
    .map((section: { id: string }) => ({ sectionId: section.id }));
  expect(priorities.length).toBeGreaterThan(0);

  const joinRes = await page.request.post("/api/waiting/join", {
    data: {
      courseId: waitingCourse.id,
      acceptedTerms: true,
      priorities,
    },
  });
  const joinPayload = await joinRes.json();
  let joinedSuccessfully = false;
  if (joinRes.ok() && joinPayload.success) {
    joinedSuccessfully = true;
    const position = joinPayload.data.position as number;
    expect(position).toBeGreaterThan(0);
  } else {
    expect(joinPayload.error?.message ?? "").toMatch(/đang chờ xử lý|phòng chờ|yêu cầu/i);
  }

  await page.goto("/student/waiting");
  if (joinedSuccessfully) {
    await expect(page.getByText(/#\d+/).first()).toBeVisible();
  }

  await login(page, "student1@ueh.edu.vn", "123456");
  await page.goto("/student/waiting");
  const confirmButton = page.getByRole("button", { name: /Xác nhận|Xac nhan/i }).first();
  await expect(confirmButton).toBeVisible();
  await confirmButton.click();
});
