"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type WaitingItem = {
  id: string;
  state: "QUEUED" | "PENDING_ADMIN" | "OFFERED" | "CONFIRMED" | "DECLINED" | "EXPIRED" | "FAILED" | "DEFERRED";
  joinedAt: string;
  expiresAt: string | null;
  fifoPosition: number | null;
  matchedPriority: number | null;
  reason: string | null;
  waitingRoom: {
    course: {
      code: string;
      name: string;
    };
  };
  offerSection: {
    code: string;
    dayOfWeek: string;
    instructor: {
      name: string;
    };
    room: {
      campus: string | null;
      code: string;
      address: string | null;
    };
    timeSlot: {
      label: string;
      startTime: string;
      endTime: string;
    };
  } | null;
};

type EnrollmentItem = {
  id: string;
  source: "WAITING_ROOM" | "DIRECT";
  createdAt: string;
  section: {
    code: string;
    dayOfWeek: string;
    course: {
      code: string;
      name: string;
    };
    room: {
      campus: string | null;
      code: string;
    };
    timeSlot: {
      label: string;
    };
  };
};

const sourceLabel = (source: EnrollmentItem["source"]) =>
  source === "WAITING_ROOM" ? "Qua phòng chờ" : "Đăng ký trực tiếp";

const waitingStateLabel: Record<WaitingItem["state"], string> = {
  QUEUED: "Đang chờ",
  PENDING_ADMIN: "Chờ admin duyệt",
  OFFERED: "Đã được giữ chỗ",
  CONFIRMED: "Đã xác nhận",
  DECLINED: "Đã từ chối",
  EXPIRED: "Hết hạn",
  FAILED: "Không khớp lịch",
  DEFERRED: "Tạm hoãn",
};

export const WaitingHistory = () => {
  const [waitingItems, setWaitingItems] = useState<WaitingItem[]>([]);
  const [enrollments, setEnrollments] = useState<EnrollmentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ title: string; rows: Array<{ label: string; value: string }> } | null>(null);

  const load = async () => {
    setLoading(true);
    const [waitingRes, enrollmentsRes] = await Promise.all([fetch("/api/waiting/me"), fetch("/api/enrollments/me")]);
    const [waitingPayload, enrollmentsPayload] = await Promise.all([waitingRes.json(), enrollmentsRes.json()]);
    setLoading(false);

    if (waitingPayload.success) {
      setWaitingItems(waitingPayload.data);
    }
    if (enrollmentsPayload.success) {
      setEnrollments(enrollmentsPayload.data);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const action = async (type: "confirm" | "decline", waitingEntryId: string) => {
    const target = waitingItems.find((item) => item.id === waitingEntryId);
    if (!target) return;

    const previousWaitingItems = waitingItems;
    const previousEnrollments = enrollments;
    const optimisticState = type === "confirm" ? "CONFIRMED" : "DECLINED";
    setActionLoadingId(waitingEntryId);
    setWaitingItems((current) =>
      current.map((item) =>
        item.id === waitingEntryId
          ? {
              ...item,
              state: optimisticState,
              reason: type === "confirm" ? "Đã xác nhận (đang đồng bộ...)" : "Đã từ chối (đang đồng bộ...)",
            }
          : item,
      ),
    );

    if (type === "confirm" && target.offerSection) {
      const optimisticEnrollment: EnrollmentItem = {
        id: `optimistic-${waitingEntryId}`,
        source: "WAITING_ROOM",
        createdAt: new Date().toISOString(),
        section: {
          code: target.offerSection.code,
          dayOfWeek: target.offerSection.dayOfWeek,
          course: {
            code: target.waitingRoom.course.code,
            name: target.waitingRoom.course.name,
          },
          room: {
            campus: target.offerSection.room.campus,
            code: target.offerSection.room.code,
          },
          timeSlot: {
            label: target.offerSection.timeSlot.label,
          },
        },
      };
      setEnrollments((current) => [optimisticEnrollment, ...current]);
    }

    const response = await fetch(`/api/waiting/${type}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ waitingEntryId }),
    });
    const payload = await response.json();
    setActionLoadingId(null);

    if (!response.ok || !payload.success) {
      setWaitingItems(previousWaitingItems);
      setEnrollments(previousEnrollments);
      toast.error(payload.error?.message ?? "Không thể xử lý");
      return;
    }
    toast.success(type === "confirm" ? "Đã xác nhận tham gia" : "Đã từ chối đề xuất");
    await load();
  };

  const openEnrollmentDetail = (item: EnrollmentItem) => {
    setDetail({
      title: `${item.section.course.code} - ${item.section.course.name}`,
      rows: [
        { label: "Lớp học phần", value: item.section.code },
        { label: "Lịch học", value: `${item.section.dayOfWeek} - ${item.section.timeSlot.label}` },
        { label: "Cơ sở", value: `${item.section.room.campus ?? "UEH"} - ${item.section.room.code}` },
        { label: "Nguồn đăng ký", value: sourceLabel(item.source) },
      ],
    });
  };

  const openWaitingDetail = (item: WaitingItem) => {
    if (!item.offerSection) {
      setDetail({
        title: `${item.waitingRoom.course.code} - ${item.waitingRoom.course.name}`,
        rows: [
          { label: "Trạng thái", value: waitingStateLabel[item.state] },
          { label: "Ưu tiên khớp", value: item.matchedPriority ? `P${item.matchedPriority}` : "-" },
          { label: "Lý do", value: item.reason ?? "Đang chờ xử lý" },
        ],
      });
      return;
    }

    setDetail({
      title: `${item.waitingRoom.course.code} - ${item.waitingRoom.course.name}`,
      rows: [
        { label: "Lớp đề xuất", value: item.offerSection.code },
        {
          label: "Lịch học",
          value: `${item.offerSection.dayOfWeek} - ${item.offerSection.timeSlot.label} (${item.offerSection.timeSlot.startTime}-${item.offerSection.timeSlot.endTime})`,
        },
        { label: "Giảng viên", value: item.offerSection.instructor.name },
        { label: "Phòng học", value: `${item.offerSection.room.campus ?? "UEH"} - ${item.offerSection.room.code}` },
        { label: "Địa chỉ", value: item.offerSection.room.address ?? "Đang cập nhật" },
        { label: "Trạng thái", value: waitingStateLabel[item.state] },
        { label: "Ưu tiên khớp", value: item.matchedPriority ? `P${item.matchedPriority}` : "-" },
      ],
    });
  };

  if (loading) return <p className="text-sm">Đang tải dữ liệu...</p>;

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-base font-semibold">Môn đã đăng ký (trực tiếp + phòng chờ)</h3>
          <Badge variant="outline">{enrollments.length} môn</Badge>
        </div>
        {enrollments.length === 0 ? (
          <p className="text-muted-foreground text-sm">Chưa có học phần đã đăng ký.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Học phần</TableHead>
                <TableHead>LHP</TableHead>
                <TableHead>Thời khóa biểu</TableHead>
                <TableHead>Cơ sở</TableHead>
                <TableHead>Nguồn đăng ký</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {enrollments.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <button className="text-left hover:underline" type="button" onClick={() => openEnrollmentDetail(item)}>
                      <p className="font-medium">{item.section.course.code}</p>
                      <p className="text-muted-foreground text-xs">{item.section.course.name}</p>
                    </button>
                  </TableCell>
                  <TableCell>{item.section.code}</TableCell>
                  <TableCell>
                    {item.section.dayOfWeek} - {item.section.timeSlot.label}
                  </TableCell>
                  <TableCell>
                    {(item.section.room.campus ?? "UEH")} - {item.section.room.code}
                  </TableCell>
                  <TableCell>
                    <Badge variant={item.source === "WAITING_ROOM" ? "default" : "secondary"}>{sourceLabel(item.source)}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-base font-semibold">Lịch sử yêu cầu phòng chờ</h3>
          <Badge variant="outline">{waitingItems.length} yêu cầu</Badge>
        </div>
        {waitingItems.length === 0 ? (
          <p className="text-muted-foreground text-sm">Chưa có lịch sử phòng chờ.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Học phần</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead>Vị trí FIFO</TableHead>
                <TableHead>Offer</TableHead>
                <TableHead>Ưu tiên khớp</TableHead>
                <TableHead>Lý do/Ghi chú</TableHead>
                <TableHead className="text-right">Hành động</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {waitingItems.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <button className="text-left hover:underline" type="button" onClick={() => openWaitingDetail(item)}>
                      <p className="font-medium">{item.waitingRoom.course.code}</p>
                      <p className="text-muted-foreground text-xs">{item.waitingRoom.course.name}</p>
                    </button>
                  </TableCell>
                  <TableCell>
                    <Badge>{waitingStateLabel[item.state]}</Badge>
                  </TableCell>
                  <TableCell>{item.fifoPosition ? `#${item.fifoPosition}` : "-"}</TableCell>
                  <TableCell>{item.offerSection?.code ?? "-"}</TableCell>
                  <TableCell>{item.matchedPriority ? `P${item.matchedPriority}` : "-"}</TableCell>
                  <TableCell>{item.reason ?? "-"}</TableCell>
                  <TableCell className="space-x-2 text-right">
                    {item.state === "OFFERED" ? (
                      <>
                        <Button
                          className="primary-glow"
                          onClick={() => void action("confirm", item.id)}
                          disabled={actionLoadingId === item.id}
                        >
                          Xác nhận
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => void action("decline", item.id)}
                          disabled={actionLoadingId === item.id}
                        >
                          Từ chối
                        </Button>
                      </>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={Boolean(detail)} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="glass-card sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Chi tiết học phần</DialogTitle>
          </DialogHeader>
          {detail ? (
            <div className="space-y-2 text-sm">
              <p className="font-semibold">{detail.title}</p>
              {detail.rows.map((row) => (
                <div key={row.label} className="grid grid-cols-[130px_1fr] gap-2">
                  <span className="text-muted-foreground">{row.label}</span>
                  <span>{row.value}</span>
                </div>
              ))}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
};
