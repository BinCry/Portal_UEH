"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type WaitingDemandEntry = {
  id: string;
  studentName: string;
  studentCode: string | null;
  joinedAt: string;
  fifoPosition: number;
  state: "QUEUED" | "PENDING_ADMIN" | "OFFERED";
  matchedPriority: number | null;
  offerSection: { code: string } | null;
};

type WaitingRoom = {
  id: string;
  isActive: boolean;
  waitingCount: number;
  course: { code: string; name: string };
  pendingApproval: { id: string; dueAt: string; status: "PENDING" } | null;
  pendingEntries: WaitingDemandEntry[];
  demandEntries: WaitingDemandEntry[];
};

const demandStateLabel: Record<WaitingDemandEntry["state"], string> = {
  QUEUED: "Đang chờ FIFO",
  PENDING_ADMIN: "Chờ admin duyệt",
  OFFERED: "Đã gửi đề xuất",
};

export const WaitingRoomTable = () => {
  const [rooms, setRooms] = useState<WaitingRoom[]>([]);
  const [reason, setReason] = useState("");
  const [activeRoom, setActiveRoom] = useState<WaitingRoom | null>(null);

  const load = async () => {
    const response = await fetch("/api/admin/waiting/rooms");
    const payload = await response.json();
    if (payload.success) {
      setRooms(payload.data);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const approveRoom = async (roomId: string) => {
    const response = await fetch(`/api/admin/waiting/${roomId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: reason || "Phê duyệt mở lớp mới từ danh sách chờ" }),
    });
    const payload = await response.json();
    if (!response.ok || !payload.success) {
      toast.error(payload.error?.message ?? "Không thể duyệt waiting room");
      return;
    }
    toast.success("Đã duyệt mở lớp từ danh sách chờ");
    await load();
  };

  const sortedEntries = useMemo(
    () => (activeRoom ? [...activeRoom.demandEntries].sort((a, b) => a.fifoPosition - b.fifoPosition) : []),
    [activeRoom],
  );

  const totalDemand = rooms.reduce((sum, room) => sum + room.waitingCount, 0);

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[#f8f9fa]">
      <header className="w-full bg-[#005f69] px-5 py-4 text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <div>
            <p className="text-sm opacity-80">UEH Portal</p>
            <h1 className="text-xl font-bold tracking-wide">ADMIN · WAITING ROOM DASHBOARD</h1>
          </div>
          <Badge className="bg-white text-[#005f69]">Tổng nhu cầu: {totalDemand}</Badge>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-5 px-4 py-6">
        <div className="grid gap-3 md:grid-cols-3">
          {rooms.slice(0, 3).map((room) => (
            <div key={room.id} className="rounded-lg border border-[#005f69]/30 bg-white p-4">
              <p className="text-sm font-semibold text-[#005f69]">{room.course.code}</p>
              <p className="text-sm text-[#1f2937]">{room.course.name}</p>
              <p className="mt-2 text-lg font-bold text-[#f97316]">{room.waitingCount} sinh viên đang chờ</p>
            </div>
          ))}
        </div>

        <div className="rounded-lg border border-[#005f69]/25 bg-white p-4">
          <Input placeholder="Lý do duyệt mở lớp" value={reason} onChange={(event) => setReason(event.target.value)} />
          <div className="mt-4 overflow-hidden rounded-lg border border-[#005f69]/40">
            <Table>
              <TableHeader>
                <TableRow className="border-b-2 border-[#005f69] bg-[#f8f9fa] hover:bg-[#f8f9fa]">
                  <TableHead className="text-xs font-bold tracking-wide text-[#005f69] uppercase">Môn học</TableHead>
                  <TableHead className="text-center text-xs font-bold tracking-wide text-[#005f69] uppercase">Nhu cầu</TableHead>
                  <TableHead className="text-center text-xs font-bold tracking-wide text-[#005f69] uppercase">Chờ admin duyệt</TableHead>
                  <TableHead className="text-center text-xs font-bold tracking-wide text-[#005f69] uppercase">Trạng thái</TableHead>
                  <TableHead className="text-right text-xs font-bold tracking-wide text-[#005f69] uppercase">Hành động</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rooms.map((room) => (
                  <TableRow key={room.id}>
                    <TableCell>
                      <p className="font-semibold">{room.course.code}</p>
                      <p className="text-sm text-[#1f2937]/80">{room.course.name}</p>
                    </TableCell>
                    <TableCell className="text-center font-semibold">{room.waitingCount}</TableCell>
                    <TableCell className="text-center">{room.pendingEntries.length || "--"}</TableCell>
                    <TableCell className="text-center">
                      <Badge className={room.isActive ? "bg-[#22c55e] text-white" : "bg-[#ef4444] text-white"}>
                        {room.isActive ? "ACTIVE" : "INACTIVE"}
                      </Badge>
                    </TableCell>
                    <TableCell className="space-x-2 text-right">
                      <Button variant="outline" onClick={() => setActiveRoom(room)} disabled={!room.demandEntries.length}>
                        Xem FIFO
                      </Button>
                      <Button className="bg-[#005f69] text-white hover:bg-[#004b54]" onClick={() => void approveRoom(room.id)}>
                        Duyệt mở lớp
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </main>

      <Dialog open={Boolean(activeRoom)} onOpenChange={(open) => !open && setActiveRoom(null)}>
        <DialogContent className="overflow-hidden rounded-lg border-0 p-0 sm:max-w-4xl">
          <DialogHeader className="bg-[#005f69] px-6 py-4">
            <DialogTitle className="text-white">FIFO Waiting List · {activeRoom?.course.code}</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Thứ tự FIFO</TableHead>
                  <TableHead>Sinh viên</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead>Ưu tiên khớp</TableHead>
                  <TableHead>Lớp đề xuất</TableHead>
                  <TableHead>Thời gian đăng ký</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedEntries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="font-semibold">{entry.fifoPosition}</TableCell>
                    <TableCell>
                      {entry.studentName}
                      <p className="text-xs text-[#1f2937]/70">{entry.studentCode ?? "N/A"}</p>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{demandStateLabel[entry.state]}</Badge>
                    </TableCell>
                    <TableCell>{entry.matchedPriority ? `P${entry.matchedPriority}` : "--"}</TableCell>
                    <TableCell>{entry.offerSection?.code ?? "--"}</TableCell>
                    <TableCell>{new Date(entry.joinedAt).toLocaleString("vi-VN")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
