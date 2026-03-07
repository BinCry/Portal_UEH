import { CoursePlanType, DayOfWeek, SectionStatus } from "@prisma/client";
import { z } from "zod";

export const courseSchema = z.object({
  code: z.string().min(2).max(30),
  name: z.string().min(2).max(255),
  faculty: z.string().min(2).max(120),
  credits: z.int().min(1).max(10),
  planType: z.enum(CoursePlanType).default("IN_PLAN"),
  isActive: z.boolean().default(true),
});

export const sectionSchema = z.object({
  code: z.string().min(2).max(40),
  courseId: z.string().min(1),
  roomId: z.string().min(1).optional(),
  room: z
    .object({
      code: z.string().min(2).max(30),
      campus: z.string().max(180).optional(),
      address: z.string().max(255).optional(),
      building: z.string().min(2).max(120).optional(),
      capacity: z.int().min(1).max(1000).optional(),
    })
    .optional(),
  dayOfWeek: z.enum(DayOfWeek),
  timeSlotId: z.string().min(1),
  startDate: z.iso.date().optional(),
  endDate: z.iso.date().optional(),
  capacity: z.int().min(1).max(1000),
  isWaitingOption: z.boolean().default(false),
  capacityHidden: z.boolean().default(false),
  registeredCount: z.int().min(0).default(0),
  status: z.enum(SectionStatus).default("OPEN"),
});

export const updateCapacitySchema = z.object({
  capacity: z.int().min(1).max(1000),
  override: z.boolean().optional().default(false),
});

export const roomSchema = z.object({
  code: z.string().min(2).max(30),
  campus: z.string().max(180).optional(),
  address: z.string().max(255).optional(),
  building: z.string().min(2).max(120),
  capacity: z.int().min(1).max(1000),
});

export const timeslotSchema = z.object({
  label: z.string().min(2).max(60),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
});

export const createStudentUserSchema = z.object({
  email: z.email(),
  fullName: z.string().min(2).max(120),
  studentCode: z.string().min(2).max(50),
  faculty: z.string().max(120).optional(),
  defaultPassword: z.string().min(6).max(128),
});
