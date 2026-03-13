import { Role } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireApiLocationViewer } from "@/lib/route-guards";

type StudentLocationRow = {
  id: string;
  fullName: string | null;
  studentCode: string | null;
  email: string;
  faculty: string | null;
  latitude: number | null;
  longitude: number | null;
  accuracyMeters: number | null;
  updatedAt: string | null;
};

const compareRows = (left: StudentLocationRow, right: StudentLocationRow) => {
  if (left.updatedAt && right.updatedAt) {
    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  }

  if (left.updatedAt) return -1;
  if (right.updatedAt) return 1;

  return (left.fullName ?? left.email).localeCompare(right.fullName ?? right.email, "vi");
};

export async function GET() {
  const auth = await requireApiLocationViewer();
  if (!auth.ok) return fail({ code: "UNAUTHORIZED", message: auth.message }, auth.status);

  const students = await prisma.user.findMany({
    where: {
      role: Role.STUDENT,
    },
    select: {
      id: true,
      email: true,
      studentProfile: {
        select: {
          fullName: true,
          studentCode: true,
          faculty: true,
          locationLatitude: true,
          locationLongitude: true,
          locationAccuracyMeters: true,
          locationUpdatedAt: true,
        },
      },
    },
  });

  const rows = students
    .map<StudentLocationRow>((student) => ({
      id: student.id,
      fullName: student.studentProfile?.fullName ?? null,
      studentCode: student.studentProfile?.studentCode ?? null,
      email: student.email,
      faculty: student.studentProfile?.faculty ?? null,
      latitude: student.studentProfile?.locationLatitude ?? null,
      longitude: student.studentProfile?.locationLongitude ?? null,
      accuracyMeters: student.studentProfile?.locationAccuracyMeters ?? null,
      updatedAt: student.studentProfile?.locationUpdatedAt?.toISOString() ?? null,
    }))
    .sort(compareRows);

  return ok(rows);
}
