import { z } from "zod";

export const enrollSchema = z.object({
  sectionId: z.string().min(1),
});
