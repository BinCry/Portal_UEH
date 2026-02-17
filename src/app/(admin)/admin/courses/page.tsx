import { PageTransition } from "@/components/shared/page-transition";
import { CoursesManager } from "@/components/admin/courses-manager";
import { requireRole } from "@/lib/auth";

export default async function AdminCoursesPage() {
  await requireRole("ADMIN");
  return (
    <PageTransition>
      <CoursesManager />
    </PageTransition>
  );
}
