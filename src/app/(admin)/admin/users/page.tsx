import { PageTransition } from "@/components/shared/page-transition";
import { UsersManager } from "@/components/admin/users-manager";
import { requireRole } from "@/lib/auth";

export default async function AdminUsersPage() {
  await requireRole("ADMIN");
  return (
    <PageTransition>
      <UsersManager />
    </PageTransition>
  );
}
