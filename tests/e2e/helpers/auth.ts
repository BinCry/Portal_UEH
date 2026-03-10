import type { Page } from "@playwright/test";

export const login = async (page: Page, email: string, password = "123456", expectedPath = "/student/courses") => {
  await page.goto("/login");
  await page.locator("#username").fill(email);
  await page.locator("#password").fill(password);
  await page.locator("button[type='submit']").click();
  await page.waitForURL(`**${expectedPath}`, { timeout: 15000 });
};

export const loginAdmin = async (page: Page) => {
  await login(page, "admin@ueh.edu.vn", "123456", "/admin/dashboard");
};