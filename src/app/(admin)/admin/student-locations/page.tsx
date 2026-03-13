import { StudentLocationsManager } from "@/components/admin/student-locations-manager";
import { PageTransition } from "@/components/shared/page-transition";
import { requireRole } from "@/lib/auth";

export default async function AdminStudentLocationsPage() {
  await requireRole("ADMIN");

  return (
    <PageTransition>
      <StudentLocationsManager />
    </PageTransition>
  );
}
