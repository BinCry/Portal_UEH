import { z } from "zod";

export const enrollSchema = z.object({
  sectionId: z.string().min(1),
});

export const cancelEnrollmentSchema = z.object({
  enrollmentId: z.string().min(1),
});

export const studentLocationSchema = z.object({
  latitude: z.number().finite().gte(-90).lte(90),
  longitude: z.number().finite().gte(-180).lte(180),
  accuracyMeters: z.number().finite().nonnegative().max(100_000).optional(),
});
