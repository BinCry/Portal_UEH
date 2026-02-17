"use client";

import { useEffect, useMemo, useState } from "react";
import { differenceInHours } from "date-fns";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type WaitingRoom = {
  id: string;
  isActive: boolean;
  waitingCount: number;
  course: {
    code: string;
    name: string;
  };
  pendingApproval: {
    id: string;
    dueAt: string;
    status: "PENDING";
  } | null;
  latestApproval: {
    id: string;
    status: "PENDING" | "APPROVED" | "REJECTED" | "AUTO_APPROVED";
    reason: string | null;
    updatedAt: string;
  } | null;
  pendingEntries: Array<{
    id: string;
    studentId: string;
    studentName: string;
    studentCode: string | null;
    state: "PENDING_ADMIN";
    joinedAt: string;
    matchedPriority: number | null;
    reason: string | null;
    offerSection: {
      id: string;
      code: string;
    } | null;
  }>;
};

const statusLabel: Record<NonNullable<WaitingRoom["latestApproval"]>["status"], string> = {
  PENDING: "Đang chờ duyệt",
  APPROVED: "Đã phê duyệt",
  AUTO_APPROVED: "Tự động phê duyệt",
  REJECTED: "Đã từ chối",
};

const statusBadgeVariant = (status: NonNullable<WaitingRoom["latestApproval"]>["status"]) => {
  if (status === "APPROVED" || status === "AUTO_APPROVED") return "default";
  if (status === "REJECTED") return "destructive";
  return "secondary";
};

export const WaitingRoomsManager = () => {
  const [rooms, setRooms] = useState<WaitingRoom[]>([]);
  const [reason, setReason] = useState("");
  const [entryLoading, setEntryLoading] = useState<string | null>(null);

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
      body: JSON.stringify({ reason: reason || "Phê duyệt bổ sung slot cho phòng chờ" }),
    });
    const payload = await response.json();
    if (!response.ok || !payload.success) {
      toast.error(payload.error?.message ?? "Không thể phê duyệt");
      return;
    }
    toast.success("Phê duyệt phòng chờ thành công");
    await load();
  };

  const rejectRoom = async (roomId: string) => {
    const response = await fetch(`/api/admin/waiting/${roomId}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: reason || "Tạm hoãn do chưa có slot phù hợp" }),
    });
    const payload = await response.json();
    if (!response.ok || !payload.success) {
      toast.error(payload.error?.message ?? "Không thể từ chối");
      return;
    }
    toast.success("Đã từ chối phòng chờ");
    await load();
  };

  const approveEntry = async (entryId: string) => {
    setEntryLoading(entryId);
    const response = await fetch(`/api/admin/waiting/entries/${entryId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reason: reason || "Admin đã duyệt đề xuất, mời sinh viên xác nhận lần cuối",
      }),
    });
    const payload = await response.json();
    setEntryLoading(null);
    if (!response.ok || !payload.success) {
      toast.error(payload.error?.message ?? "Không thể duyệt đề xuất");
      return;
    }
    toast.success("Đã duyệt đề xuất và gửi cho sinh viên");
    await load();
  };

  const rejectEntry = async (entryId: string) => {
    setEntryLoading(entryId);
    const response = await fetch(`/api/admin/waiting/entries/${entryId}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reason: reason || "Admin từ chối đề xuất, hệ thống sẽ xét suất cho hàng đợi tiếp theo",
      }),
    });
    const payload = await response.json();
    setEntryLoading(null);
    if (!response.ok || !payload.success) {
      toast.error(payload.error?.message ?? "Không thể từ chối đề xuất");
      return;
    }
    toast.success("Đã từ chối đề xuất");
    await load();
  };

  const pendingEntries = useMemo(
    () =>
      rooms.flatMap((room) =>
        room.pendingEntries.map((entry) => ({
          ...entry,
          roomId: room.id,
          courseCode: room.course.code,
          courseName: room.course.name,
        })),
      ),
    [rooms],
  );

  return (
    <Card className="glass-card border-amber-200/80">
      <CardHeader>
        <CardTitle>Phê duyệt Waiting Room</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label>Lý do phê duyệt / từ chối</Label>
          <Input
            placeholder="Nhập lý do để gửi thông báo cho sinh viên"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </div>

        {rooms.length === 0 ? (
          <p className="text-muted-foreground text-sm">Không có waiting room đang active hoặc gần đây.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Học phần</TableHead>
                <TableHead>Số người chờ</TableHead>
                <TableHead>Entry chờ duyệt</TableHead>
                <TableHead>Trạng thái room</TableHead>
                <TableHead>SLA deadline</TableHead>
                <TableHead className="text-right">Tác vụ room</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rooms.map((room) => {
                const dueAt = room.pendingApproval?.dueAt ? new Date(room.pendingApproval.dueAt) : null;
                const countdown = dueAt ? differenceInHours(dueAt, new Date()) : null;
                const status = room.latestApproval?.status ?? "PENDING";
                const hasPending = Boolean(room.pendingApproval);

                return (
                  <TableRow key={room.id}>
                    <TableCell>
                      <p className="font-medium">
                        {room.course.code} - {room.course.name}
                      </p>
                      <p className="text-muted-foreground text-xs">{room.isActive ? "Đang mở" : "Đã đóng"}</p>
                    </TableCell>
                    <TableCell className="font-sans tabular-nums">{room.waitingCount}</TableCell>
                    <TableCell>
                      <Badge variant={room.pendingEntries.length ? "default" : "secondary"}>{room.pendingEntries.length}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusBadgeVariant(status)}>{statusLabel[status]}</Badge>
                      {room.latestApproval?.reason ? (
                        <p className="text-muted-foreground mt-1 text-xs">{room.latestApproval.reason}</p>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {dueAt ? (
                        <>
                          <p>{dueAt.toLocaleString("vi-VN")}</p>
                          <Badge variant={countdown !== null && countdown < 0 ? "destructive" : "secondary"}>
                            {countdown !== null ? `${countdown} giờ` : "--"}
                          </Badge>
                        </>
                      ) : (
                        <span className="text-muted-foreground text-xs">Không còn SLA chờ xử lý</span>
                      )}
                    </TableCell>
                    <TableCell className="space-x-2 text-right">
                      <Button className="primary-glow" disabled={!hasPending} onClick={() => void approveRoom(room.id)}>
                        Phê duyệt room
                      </Button>
                      <Button variant="destructive" disabled={!hasPending} onClick={() => void rejectRoom(room.id)}>
                        Từ chối room
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-base font-semibold">Danh sách sinh viên chờ duyệt đề xuất lớp</h3>
            <Badge variant="outline">{pendingEntries.length} entry</Badge>
          </div>
          {pendingEntries.length === 0 ? (
            <p className="text-muted-foreground text-sm">Chưa có entry nào đang chờ admin duyệt.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Học phần</TableHead>
                  <TableHead>Sinh viên</TableHead>
                  <TableHead>Lớp đề xuất</TableHead>
                  <TableHead>Ưu tiên khớp</TableHead>
                  <TableHead>Ngày nhập</TableHead>
                  <TableHead>Ghi chú</TableHead>
                  <TableHead className="text-right">Tác vụ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingEntries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>
                      <p className="font-medium">{entry.courseCode}</p>
                      <p className="text-muted-foreground text-xs">{entry.courseName}</p>
                    </TableCell>
                    <TableCell>
                      <p className="font-medium">{entry.studentName}</p>
                      <p className="text-muted-foreground text-xs">{entry.studentCode ?? "N/A"}</p>
                    </TableCell>
                    <TableCell>{entry.offerSection?.code ?? "-"}</TableCell>
                    <TableCell>
                      <Badge variant={entry.matchedPriority === 1 ? "default" : "secondary"}>
                        P{entry.matchedPriority ?? "-"}
                      </Badge>
                    </TableCell>
                    <TableCell>{new Date(entry.joinedAt).toLocaleString("vi-VN")}</TableCell>
                    <TableCell>{entry.reason ?? "-"}</TableCell>
                    <TableCell className="space-x-2 text-right">
                      <Button
                        className="primary-glow"
                        disabled={entryLoading === entry.id}
                        onClick={() => void approveEntry(entry.id)}
                      >
                        Duyệt entry
                      </Button>
                      <Button
                        variant="destructive"
                        disabled={entryLoading === entry.id}
                        onClick={() => void rejectEntry(entry.id)}
                      >
                        Từ chối entry
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
