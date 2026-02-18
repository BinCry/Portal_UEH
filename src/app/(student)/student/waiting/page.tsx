import { WaitingRoomRegistration } from "@/components/student/waiting-room-registration";
import { requireRole } from "@/lib/auth";

export default async function StudentWaitingPage() {
  const session = await requireRole("STUDENT");

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[#f8f9fa]">
      <header className="w-full bg-[#005f69] px-5 py-4 text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <div>
            <p className="text-sm opacity-80">UEH Portal</p>
            <h1 className="text-xl font-bold tracking-wide">ĐĂNG KÝ PHÒNG CHỜ</h1>
          </div>
          <div className="text-right text-sm">
            <p className="font-semibold">Sinh viên</p>
            <p className="opacity-90">{session.user.email}</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        <WaitingRoomRegistration />
      </main>
    </div>
  );
}
