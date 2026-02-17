import { PageTransition } from "@/components/shared/page-transition";
import { SectionsManager } from "@/components/admin/sections-manager";
import { requireRole } from "@/lib/auth";

export default async function AdminSectionsPage() {
  await requireRole("ADMIN");
  return (
    <PageTransition>
      <SectionsManager />
    </PageTransition>
  );
}
