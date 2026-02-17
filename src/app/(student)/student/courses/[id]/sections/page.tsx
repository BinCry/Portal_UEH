import { notFound } from "next/navigation";
import { PageTransition } from "@/components/shared/page-transition";
import { SectionsTable } from "@/components/student/sections-table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { waitingRoomService } from "@/domain/services/waiting-room.service";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function StudentSectionsPage({ params }: Props) {
  const session = await requireRole("STUDENT");
  const { id: courseId } = await params;

  const profile = await prisma.studentProfile.findUnique({
    where: { userId: session.user.id },
    select: { faculty: true },
  });
  const studentFaculty = profile?.faculty?.trim();
  if (!studentFaculty) return notFound();

  const courseBase = await prisma.course.findFirst({
    where: { id: courseId, faculty: studentFaculty },
    select: {
      id: true,
      code: true,
      name: true,
      credits: true,
      faculty: true,
      planType: true,
    },
  });
  if (!courseBase) return notFound();

  const evaluatedRoom = await waitingRoomService.evaluateAndActivate(courseId);
  const persistedRoom = await prisma.waitingRoom.findUnique({ where: { courseId } });
  const waitingRoom = evaluatedRoom ?? persistedRoom;
  const waitingActive = Boolean(waitingRoom?.isActive);
  const buffer = waitingRoom?.buffer ?? 5;

  const sectionInclude = {
    instructor: true,
    room: true,
    timeSlot: true,
  } as const;

  const [normalSectionsRaw, waitingSectionsRaw] = await Promise.all([
    prisma.section.findMany({
      where: { courseId, status: "OPEN", isWaitingOption: false },
      include: sectionInclude,
      orderBy: { code: "asc" },
    }),
    waitingActive
      ? prisma.section.findMany({
          where: { courseId, status: "OPEN", isWaitingOption: true },
          include: sectionInclude,
          orderBy: { code: "asc" },
        })
      : Promise.resolve([]),
  ]);

  const mapSection = (section: (typeof normalSectionsRaw)[number]) => {
    const availableSlots = section.capacity - section.registeredCount - section.reservedCount;
    const studentStatus =
      availableSlots <= 0 ? ("FULL" as const) : availableSlots <= buffer ? ("NEAR_FULL" as const) : ("AVAILABLE" as const);

    if (section.capacityHidden) {
      return {
        ...section,
        capacity: null,
        registeredCount: null,
        reservedCount: null,
        studentStatus,
        availableSlots,
      };
    }

    return {
      ...section,
      studentStatus,
      availableSlots,
    };
  };

  const normalSections = normalSectionsRaw.map(mapSection);
  const waitingSections = waitingSectionsRaw.map(mapSection);

  const campuses = [...new Set(normalSectionsRaw.map((item) => item.room.campus).filter(Boolean))] as string[];

  return (
    <PageTransition>
      <Card className="glass-card">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <CardTitle>
              {courseBase.code} - {courseBase.name}
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{courseBase.faculty}</Badge>
              <Badge variant={courseBase.planType === "IN_PLAN" ? "default" : "secondary"}>
                {courseBase.planType === "IN_PLAN" ? "Trong kế hoạch" : "Ngoài kế hoạch"}
              </Badge>
            </div>
          </div>
          {campuses.length ? (
            <p className="text-muted-foreground text-sm">
              Cơ sở mở lớp: <span className="text-foreground font-medium">{campuses.join(" • ")}</span>
            </p>
          ) : null}
          <p className="text-muted-foreground text-sm">
            Lớp bổ sung dành cho phòng chờ chỉ hiển thị khi phòng chờ của học phần đã kích hoạt.
          </p>
        </CardHeader>
        <CardContent>
          <SectionsTable
            courseId={courseBase.id}
            waitingActive={waitingActive}
            sections={normalSections}
            waitingSections={waitingSections}
          />
        </CardContent>
      </Card>
    </PageTransition>
  );
}
