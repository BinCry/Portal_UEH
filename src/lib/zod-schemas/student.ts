import { z } from "zod";

export const enrollSchema = z.object({
  sectionId: z.string().min(1),
});

export const cancelEnrollmentSchema = z.object({
  enrollmentId: z.string().min(1),
});
