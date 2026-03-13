"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { formatSectionScheduleSummary } from "@/lib/section-display";
import {
  STUDENT_REGISTRATION_UPDATED_EVENT,
  emitStudentRegistrationUpdated,
} from "@/lib/student-registration-events";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type EnrollmentItem = {
  id: string;
  source: "WAITING_ROOM" | "DIRECT";
  participantCount: number;
  participantScope: "SECTION" | "WAITING_FLOW";
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

const participantCountLabel = (item: EnrollmentItem) =>
  item.participantScope === "WAITING_FLOW" ? `${item.participantCount} (phòng chờ)` : String(item.participantCount);

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

export const WaitingHistory = () => {
  const [enrollments, setEnrollments] = useState<EnrollmentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [cancelLoadingId, setCancelLoadingId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<EnrollmentItem | null>(null);
  const [detail, setDetail] = useState<{ title: string; rows: Array<{ label: string; value: string }> } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/enrollments/me");
      const payload = await response.json();

      if (payload.success) {
        setEnrollments(payload.data);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const handleRegistrationUpdated = () => {
      void load();
    };

    void load();
    window.addEventListener(STUDENT_REGISTRATION_UPDATED_EVENT, handleRegistrationUpdated);
    return () => {
      window.removeEventListener(STUDENT_REGISTRATION_UPDATED_EVENT, handleRegistrationUpdated);
    };
  }, []);

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
      emitStudentRegistrationUpdated();
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
        { label: "Sĩ số", value: participantCountLabel(item) },
      ],
    });
  };

  if (loading) return <p className="text-sm">Đang tải dữ liệu...</p>;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-base font-semibold">Môn đã đăng ký</h3>
        <Badge variant="outline">{enrollments.length} môn</Badge>
      </div>
      {enrollments.length === 0 ? (
        <p className="text-muted-foreground text-sm">Chưa có học phần đã đăng ký.</p>
      ) : (
        <div className="pb-2">
          <Table className="min-w-[1240px] table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[250px]">Học phần</TableHead>
                <TableHead className="w-[170px]">LHP</TableHead>
                <TableHead className="w-[420px]">Lịch học & địa chỉ</TableHead>
                <TableHead className="w-[160px]">Nguồn đăng ký</TableHead>
                <TableHead className="w-[90px] text-center">Sĩ số</TableHead>
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
                  <TableCell className="max-w-[420px] align-top whitespace-normal break-words text-sm leading-relaxed">
                    {formatScheduleFromEnrollment(item)}
                  </TableCell>
                  <TableCell className="align-top">
                    <Badge variant={item.source === "WAITING_ROOM" ? "default" : "secondary"}>{sourceLabel(item.source)}</Badge>
                  </TableCell>
                  <TableCell className="align-top text-center font-sans tabular-nums">{item.participantCount}</TableCell>
                  <TableCell className="align-top text-right">
                    <Button
                      variant="outline"
                      className="border-red-200 whitespace-nowrap text-red-700 hover:bg-red-50 hover:text-red-800"
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
        </div>
      )}

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
