import { expect, test } from "@playwright/test";

type AdminSectionRow = {
    registeredCount: number;
    course: {
        code: string;
    };
};

const login = async (page: import("@playwright/test").Page, email: string, password: string) => {
    await page.goto("/login");
    await page.getByPlaceholder(/email/i).fill(email);
    await page.getByPlaceholder(/mật khẩu|mat khau/i).fill(password);
    await page.getByRole("button", { name: /Đăng nhập|Dang nhap/i }).click();
    await page.waitForURL("**/student/dashboard", { timeout: 10000 }).catch(() => { });
};

const loginAdmin = async (page: import("@playwright/test").Page) => {
    await page.goto("/login");
    await page.getByPlaceholder(/email/i).fill("admin@ueh.edu.vn");
    await page.getByPlaceholder(/mật khẩu|mat khau/i).fill("123456");
    await page.getByRole("button", { name: /Đăng nhập|Dang nhap/i }).click();
    await page.waitForURL("**/admin/dashboard", { timeout: 10000 }).catch(() => { });
};

test("admin sections capacity drops when student cancels waiting room confirmed enrollment", async ({ browser, page }) => {
    test.setTimeout(90000); // 90s timeout

    // NOTE: Seeding has been done externally by `npx tsx seed-test.ts`.
    // ACT: Let the admin load sections and see capacity
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await loginAdmin(adminPage);
    await adminPage.goto("/admin/sections");

    const sectionsResBefore = await adminPage.request.get("/api/admin/sections");
    const sectionsBefore = (await sectionsResBefore.json()).data;

    // LOG IN AS STUDENT AND CANCEL
    await login(page, "student2@ueh.edu.vn", "123456");

    await Promise.all([
        page.waitForResponse("**/api/enrollments/me"),
        page.goto("/student/waiting")
    ]);

    await page.waitForTimeout(1000); // give react a second to render

    const cancelLink = page.locator('button:has-text("Hủy học phần")').first();
    await cancelLink.waitFor({ state: "visible", timeout: 15000 });

    // Get course code from the row
    const row = cancelLink.locator("xpath=ancestor::tr").first();
    const courseCode = await row.locator("td").first().innerText();

    // Find the capacity text for the section. 
    const sectionBefore = (sectionsBefore as AdminSectionRow[]).find(
        (s) => courseCode.includes(s.course.code) || s.course.code.includes(courseCode.trim()),
    );
    expect(sectionBefore).toBeTruthy();
    const initialRegisteredCount = sectionBefore!.registeredCount;
    console.log(`Admin sees section (course: ${courseCode}) registeredCount Before:`, initialRegisteredCount);

    await cancelLink.click();

    const confirmCancelBtn = page.getByRole("button", { name: /Xác nhận hủy/i });
    await expect(confirmCancelBtn).toBeVisible();
    await confirmCancelBtn.click();
    await expect(page.getByText(/Đã hủy/i)).toBeVisible();
    console.log("Student successfully canceled enrollment via the UI.");

    // Check Admin Again
    const sectionsResAfter = await adminPage.request.get("/api/admin/sections");
    const sectionsAfter = (await sectionsResAfter.json()).data;
    const sectionAfter = (sectionsAfter as AdminSectionRow[]).find(
        (s) => courseCode.includes(s.course.code) || s.course.code.includes(courseCode.trim()),
    );
    expect(sectionAfter).toBeTruthy();
    const finalRegisteredCount = sectionAfter!.registeredCount;
    console.log(`Admin sees section (course: ${courseCode}) registeredCount After:`, finalRegisteredCount);

    // Assert it drops
    expect(finalRegisteredCount).toEqual(initialRegisteredCount - 1);
});
