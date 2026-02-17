import { PageTransition } from "@/components/shared/page-transition";
import { WaitingRoomsManager } from "@/components/admin/waiting-rooms-manager";
import { requireRole } from "@/lib/auth";

export default async function AdminWaitingRoomsPage() {
  await requireRole("ADMIN");
  return (
    <PageTransition>
      <WaitingRoomsManager />
    </PageTransition>
  );
}
