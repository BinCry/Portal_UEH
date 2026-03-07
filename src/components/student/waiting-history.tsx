"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { formatSectionScheduleSummary } from "@/lib/section-display";
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
    startDate?: string | null;
    endDate?: string | null;
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
    id?: string;
    code: string;
    dayOfWeek: string;
    startDate?: string | null;
    endDate?: string | null;
    course: {
      code: string;
      name: string;
    };
    room: {
      campus: string | null;
      code: string;
      address?: string | null;
    };
    timeSlot: {
      label: string;
      startTime?: string;
      endTime?: string;
    };
  };
};

type CancelEnrollmentPayload = {
  success?: boolean;
  data?: {
    enrollmentId: string;
    sectionId: string;
    source: "WAITING_ROOM" | "DIRECT";
    warningNextSemester: boolean;
  };
  error?: {
    message?: string;
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

const formatScheduleFromEnrollment = (item: EnrollmentItem) =>
  formatSectionScheduleSummary({
    dayOfWeek: item.section.dayOfWeek,
    startTime: item.section.timeSlot.startTime,
    endTime: item.section.timeSlot.endTime,
    startDate: item.section.startDate,
    endDate: item.section.endDate,
    address: item.section.room.address,
    campus: item.section.room.campus,
    roomCode: item.section.room.code,
  });

const formatScheduleFromWaiting = (item: WaitingItem) => {
  if (!item.offerSection) return "Đang cập nhật";
  return formatSectionScheduleSummary({
    dayOfWeek: item.offerSection.dayOfWeek,
    startTime: item.offerSection.timeSlot.startTime,
    endTime: item.offerSection.timeSlot.endTime,
    startDate: item.offerSection.startDate,
    endDate: item.offerSection.endDate,
    address: item.offerSection.room.address,
    campus: item.offerSection.room.campus,
    roomCode: item.offerSection.room.code,
  });
};

export const WaitingHistory = () => {
  const [waitingItems, setWaitingItems] = useState<WaitingItem[]>([]);
  const [enrollments, setEnrollments] = useState<EnrollmentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [cancelLoadingId, setCancelLoadingId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<EnrollmentItem | null>(null);
  const [detail, setDetail] = useState<{ title: string; rows: Array<{ label: string; value: string }> } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [waitingRes, enrollmentsRes] = await Promise.all([fetch("/api/waiting/me"), fetch("/api/enrollments/me")]);
      const [waitingPayload, enrollmentsPayload] = await Promise.all([waitingRes.json(), enrollmentsRes.json()]);

      if (waitingPayload.success) {
        setWaitingItems(waitingPayload.data);
      }
      if (enrollmentsPayload.success) {
        setEnrollments(enrollmentsPayload.data);
      }
    } finally {
      setLoading(false);
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
          startDate: target.offerSection.startDate,
          endDate: target.offerSection.endDate,
          course: {
            code: target.waitingRoom.course.code,
            name: target.waitingRoom.course.name,
          },
          room: {
            campus: target.offerSection.room.campus,
            code: target.offerSection.room.code,
            address: target.offerSection.room.address,
          },
          timeSlot: {
            label: target.offerSection.timeSlot.label,
            startTime: target.offerSection.timeSlot.startTime,
            endTime: target.offerSection.timeSlot.endTime,
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

  const cancelEnrollment = async () => {
    if (!cancelTarget) return;
    setCancelLoadingId(cancelTarget.id);

    try {
      const response = await fetch("/api/enrollments/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enrollmentId: cancelTarget.id }),
      });
      const payload = (await response.json()) as CancelEnrollmentPayload;

      if (!response.ok || !payload.success || !payload.data) {
        toast.error(payload.error?.message ?? "Không thể hủy học phần");
        return;
      }

      if (payload.data.warningNextSemester) {
        toast.success("Đã hủy học phần. Lưu ý trách nhiệm với lựa chọn phòng chờ ở kỳ sau.");
      } else {
        toast.success("Đã hủy học phần thành công.");
      }

      setCancelTarget(null);
      await load();
    } catch {
      toast.error("Không thể kết nối tới máy chủ");
    } finally {
      setCancelLoadingId(null);
    }
  };

  const openEnrollmentDetail = (item: EnrollmentItem) => {
    setDetail({
      title: `${item.section.course.code} - ${item.section.course.name}`,
      rows: [
        { label: "Lớp học phần", value: item.section.code },
        { label: "Lịch học & địa chỉ", value: formatScheduleFromEnrollment(item) },
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
        { label: "Lịch học & địa chỉ", value: formatScheduleFromWaiting(item) },
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
          <Table className="min-w-[1120px] table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[260px]">Học phần</TableHead>
                <TableHead className="w-[170px]">LHP</TableHead>
                <TableHead className="w-[430px]">Lịch học & địa chỉ</TableHead>
                <TableHead className="w-[160px]">Nguồn đăng ký</TableHead>
                <TableHead className="w-[150px] text-right">Hành động</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {enrollments.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="align-top whitespace-normal">
                    <button className="text-left hover:underline" type="button" onClick={() => openEnrollmentDetail(item)}>
                      <p className="font-medium">{item.section.course.code}</p>
                      <p className="text-muted-foreground text-xs">{item.section.course.name}</p>
                    </button>
                  </TableCell>
                  <TableCell className="align-top">{item.section.code}</TableCell>
                  <TableCell className="max-w-[430px] align-top whitespace-normal break-words text-sm leading-relaxed">
                    {formatScheduleFromEnrollment(item)}
                  </TableCell>
                  <TableCell className="align-top">
                    <Badge variant={item.source === "WAITING_ROOM" ? "default" : "secondary"}>{sourceLabel(item.source)}</Badge>
                  </TableCell>
                  <TableCell className="align-top text-right">
                    <Button
                      variant="outline"
                      className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800 whitespace-nowrap"
                      onClick={() => setCancelTarget(item)}
                      disabled={cancelLoadingId === item.id}
                    >
                      Hủy học phần
                    </Button>
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

      <Dialog
        open={Boolean(cancelTarget)}
        onOpenChange={(open) => {
          if (!open && !cancelLoadingId) {
            setCancelTarget(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Xác nhận hủy học phần</DialogTitle>
          </DialogHeader>
          {cancelTarget ? (
            <div className="space-y-3 text-sm">
              <p>
                Bạn sắp hủy học phần <strong>{cancelTarget.section.course.code}</strong> - {cancelTarget.section.course.name} (
                {cancelTarget.section.code}).
              </p>
              {cancelTarget.source === "WAITING_ROOM" ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900">
                  Phòng chờ kỳ sau: Bạn đang hủy học phần đã xác nhận qua phòng chờ. Vui lòng cân nhắc trách nhiệm với lựa chọn
                  phòng chờ ở kỳ sau.
                </div>
              ) : null}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setCancelTarget(null)} disabled={cancelLoadingId === cancelTarget.id}>
                  Giữ lại
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => void cancelEnrollment()}
                  disabled={cancelLoadingId === cancelTarget.id}
                >
                  Xác nhận hủy
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
};
