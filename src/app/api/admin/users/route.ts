import { Role } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/route-guards";
import { hashPassword } from "@/lib/security/password";
import { createStudentUserSchema } from "@/lib/zod-schemas/admin";

export async function GET() {
  const auth = await requireApiRole("ADMIN");
  if (!auth.ok) return fail({ code: "UNAUTHORIZED", message: auth.message }, auth.status);

  const users = await prisma.user.findMany({
    include: {
      studentProfile: true,
      adminProfile: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
  return ok(users);
}

export async function POST(request: Request) {
  const auth = await requireApiRole("ADMIN");
  if (!auth.ok) return fail({ code: "UNAUTHORIZED", message: auth.message }, auth.status);

  try {
    const body = await parseBody(request, createStudentUserSchema);
    const passwordHash = await hashPassword(body.defaultPassword);

    const user = await prisma.user.create({
      data: {
        email: body.email.toLowerCase(),
        passwordHash,
        role: Role.STUDENT,
        studentProfile: {
          create: {
            fullName: body.fullName,
            studentCode: body.studentCode,
            faculty: body.faculty,
          },
        },
      },
      include: {
        studentProfile: true,
      },
    });

    return ok(user, { status: 201 });
  } catch (error) {
    return fail(
      {
        code: "CREATE_USER_FAILED",
        message: "Không thể tạo tài khoản sinh viên",
        details: error,
      },
      400,
    );
  }
}

