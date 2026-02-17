import { z } from "zod";

const prioritySchema = z.object({
  sectionId: z.string().min(1),
});

export const joinWaitingSchema = z.object({
  courseId: z.string().min(1),
  acceptedTerms: z.boolean().refine((value) => value, {
    message: "Bạn cần đồng ý điều khoản tham gia phòng chờ",
  }),
  priorities: z
    .array(prioritySchema)
    .min(1)
    .max(3)
    .refine((items) => new Set(items.map((x) => x.sectionId)).size === items.length, {
      message: "Danh sách ưu tiên không được trùng",
    }),
});

export const waitingDecisionSchema = z.object({
  waitingEntryId: z.string().min(1),
});
