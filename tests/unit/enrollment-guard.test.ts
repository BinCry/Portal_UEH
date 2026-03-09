import { describe, expect, it, vi } from "vitest";
import { assertNoActiveEnrollmentForCourse } from "@/domain/services/enrollment-guard.service";

type GuardClient = Parameters<typeof assertNoActiveEnrollmentForCourse>[0]["client"];

const makeClient = (result: { id: string; sectionId: string } | null): GuardClient => ({
  enrollment: {
    findFirst: vi.fn().mockResolvedValue(result),
  },
});

describe("Enrollment course guard", () => {
  it("passes when student has no active enrollment in the same course", async () => {
    const client = makeClient(null);

    await expect(
      assertNoActiveEnrollmentForCourse({
        client,
        studentId: "student-1",
        courseId: "course-1",
      }),
    ).resolves.toBeUndefined();
  });

  it("throws domain error when student already has active enrollment in the same course", async () => {
    const client = makeClient({ id: "enr-1", sectionId: "sec-1" });

    await expect(
      assertNoActiveEnrollmentForCourse({
        client,
        studentId: "student-1",
        courseId: "course-1",
      }),
    ).rejects.toMatchObject({
      code: "ALREADY_ENROLLED_IN_COURSE",
    });
  });

  it("ignores the current section when excludeSectionId is provided", async () => {
    const client = makeClient(null);

    await expect(
      assertNoActiveEnrollmentForCourse({
        client,
        studentId: "student-1",
        courseId: "course-1",
        excludeSectionId: "sec-1",
      }),
    ).resolves.toBeUndefined();

    expect(client.enrollment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          sectionId: {
            not: "sec-1",
          },
        }),
      }),
    );
  });
});
