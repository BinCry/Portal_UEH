import { expect, test } from "@playwright/test";
import { prisma } from "../../src/lib/prisma";
import { createTestDbContext, makePrefix } from "../support/db-fixtures";
import { login } from "./helpers/auth";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const STUDENT_LOCATION = {
  latitude: 10.762622,
  longitude: 106.660172,
};

test("student geolocation is saved and visible to minhquan admin", async ({ page }) => {
  await page.context().grantPermissions(["geolocation"], { origin: BASE_URL });
  await page.context().setGeolocation(STUDENT_LOCATION);

  const saveLocationResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/location/me") && response.request().method() === "POST" && response.ok(),
  );

  await login(page, "student1@ueh.edu.vn");
  await saveLocationResponse;

  await expect
    .poll(async () => {
      const student = await prisma.user.findUnique({
        where: { email: "student1@ueh.edu.vn" },
        select: {
          studentProfile: {
            select: {
              locationLatitude: true,
              locationLongitude: true,
              locationAccuracyMeters: true,
              locationUpdatedAt: true,
            },
          },
        },
      });

      return student?.studentProfile?.locationUpdatedAt ? "saved" : "pending";
    })
    .toBe("saved");

  const updatedStudent = await prisma.user.findUnique({
    where: { email: "student1@ueh.edu.vn" },
    select: {
      studentProfile: {
        select: {
          locationLatitude: true,
          locationLongitude: true,
          locationAccuracyMeters: true,
          locationUpdatedAt: true,
        },
      },
    },
  });

  expect(updatedStudent?.studentProfile?.locationLatitude).toBeCloseTo(STUDENT_LOCATION.latitude, 6);
  expect(updatedStudent?.studentProfile?.locationLongitude).toBeCloseTo(STUDENT_LOCATION.longitude, 6);
  expect(updatedStudent?.studentProfile?.locationAccuracyMeters).not.toBeNull();
  expect(updatedStudent?.studentProfile?.locationUpdatedAt).not.toBeNull();

  await page.context().clearCookies();
  await page.goto("/login");

  await login(page, "minhquan@ueh.edu.vn", "25102006Qu@n", "/admin/student-locations");

  const row = page.locator("tbody tr").filter({ hasText: "student1@ueh.edu.vn" }).first();
  await expect(row).toBeVisible();
  await expect(row).toContainText("10.762622");
  await expect(row).toContainText("106.660172");
  await expect(row.getByRole("link", { name: "Mở bản đồ" })).toHaveAttribute(
    "href",
    /google\.com\/maps\?q=10\.762622,106\.660172/,
  );
});

test("student can still access pages when geolocation is denied", async ({ page }) => {
  const ctx = createTestDbContext(makePrefix("pw-location-denied"));

  try {
    const student = await ctx.createStudentAccount();
    await page.context().clearPermissions();

    await login(page, student.email);
    await expect(page).toHaveURL(/\/student\/courses$/);
    await expect(page.getByText("Cổng Đăng Ký Tín Chỉ Thông Minh")).toBeVisible();

    await expect
      .poll(async () => {
        const currentStudent = await prisma.user.findUnique({
          where: { id: student.id },
          select: {
            studentProfile: {
              select: {
                locationUpdatedAt: true,
              },
            },
          },
        });

        return currentStudent?.studentProfile?.locationUpdatedAt ?? null;
      })
      .toBeNull();
  } finally {
    await ctx.cleanup();
  }
});
