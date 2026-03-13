import { StudentLocationsManager } from "@/components/admin/student-locations-manager";
import { PageTransition } from "@/components/shared/page-transition";
import { requireLocationViewer } from "@/lib/auth";

export default async function AdminStudentLocationsPage() {
  await requireLocationViewer();

  return (
    <PageTransition>
      <StudentLocationsManager />
    </PageTransition>
  );
}
