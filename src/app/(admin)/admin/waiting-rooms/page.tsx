import { WaitingRoomTable } from "@/components/admin/waiting-room-table";
import { requireRole } from "@/lib/auth";

export default async function AdminWaitingRoomsPage() {
  await requireRole("ADMIN");
  return <WaitingRoomTable />;
}
