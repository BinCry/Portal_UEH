"use client";

import { useMemo, useState } from "react";
import { Info, Loader2, MapPin, ShieldCheck, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type SectionItem = {
  id: string;
  code: string;
  dayOfWeek: string;
  timeSlot: {
    label: string;
    startTime: string;
    endTime: string;
  };
  room: {
    code: string;
    campus?: string | null;
    address?: string | null;
  };
  instructor: {
    name: string;
  };
  capacityHidden: boolean;
  capacity: number | null;
  registeredCount: number | null;
  reservedCount: number | null;
  studentStatus: "FULL" | "NEAR_FULL" | "AVAILABLE";
  availableSlots: number;
};

const statusLabel = (status: SectionItem["studentStatus"]) => {
  if (status === "FULL") return "Đã đầy";
  if (status === "NEAR_FULL") return "Gần đầy";
  return "Còn chỗ";
};

const dayOfWeekLabel = (day: string) => {
  const map: Record<string, string> = {
    MONDAY: "Thứ Hai",
    TUESDAY: "Thứ Ba",
    WEDNESDAY: "Thứ Tư",
    THURSDAY: "Thứ Năm",
    FRIDAY: "Thứ Sáu",
    SATURDAY: "Thứ Bảy",
    SUNDAY: "Chủ Nhật",
  };
  return map[day] ?? day;
};

export const SectionsTable = ({
  courseId,
  waitingActive,
  sections,
  waitingSections,
}: {
  courseId: string;
  waitingActive: boolean;
  sections: SectionItem[];
  waitingSections: SectionItem[];
}) => {
  const [loadingSectionId, setLoadingSectionId] = useState<string | null>(null);
  const [openDialog, setOpenDialog] = useState(false);
  const [priority1, setPriority1] = useState<string>("");
  const [priority2, setPriority2] = useState<string>("");
  const [priority3, setPriority3] = useState<string>("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  const selectableWaitingSections = useMemo(
    () => (waitingSections.filter((section) => section.studentStatus !== "FULL").length ? waitingSections : waitingSections.slice(0, 3)),
    [waitingSections],
  );
  const canJoinWaiting = waitingActive && waitingSections.length > 0;

  const enroll = async (sectionId: string) => {
    setLoadingSectionId(sectionId);
    const response = await fetch("/api/enroll", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sectionId }),
    });
    const payload = await response.json();
    setLoadingSectionId(null);

    if (!response.ok || !payload.success) {
      toast.error(payload.error?.message ?? "Đăng ký thất bại");
      return;
    }

    toast.success("Đăng ký học phần thành công");
    window.location.reload();
  };

  const joinWaiting = async () => {
    const priorities = [priority1, priority2, priority3].filter(Boolean).map((sectionId) => ({ sectionId }));
    if (!priorities.length) {
      toast.error("Vui lòng chọn ít nhất 1 nguyện vọng");
      return;
    }
    if (!acceptedTerms) {
      toast.error("Bạn phải đồng ý điều khoản trước khi tham gia phòng chờ");
      return;
    }

    const response = await fetch("/api/waiting/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        courseId,
        acceptedTerms,
        priorities,
      }),
    });
    const payload = await response.json();
    if (!response.ok || !payload.success) {
      toast.error(payload.error?.message ?? "Không thể tham gia phòng chờ");
      return;
    }

    toast.success(`Tham gia phòng chờ thành công. Vị trí FIFO #${payload.data.position}`);
    setOpenDialog(false);
    setPriority1("");
    setPriority2("");
    setPriority3("");
    setAcceptedTerms(false);
  };

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          Danh sách bên dưới chỉ là lớp học phần đăng ký trực tiếp. Lớp bổ sung sẽ được mở trong phòng chờ.
        </p>
        <Button className="primary-glow h-10 rounded-xl px-5" onClick={() => setOpenDialog(true)} disabled={!canJoinWaiting}>
          Tham gia phòng chờ
        </Button>
      </div>

      {!waitingActive ? (
        <div className="mb-4 rounded-2xl border border-amber-200/80 bg-amber-50/65 p-3 text-sm">
          Phòng chờ chưa kích hoạt. Khi học phần đạt ngưỡng gần đầy/full, hệ thống sẽ mở phòng chờ và hiển thị lớp bổ sung
          để bạn chọn 3 nguyện vọng.
        </div>
      ) : null}

      {sections.length === 0 ? (
        <p className="text-muted-foreground text-sm">Hiện chưa có lớp học phần đăng ký trực tiếp cho học phần này.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Mã LHP</TableHead>
              <TableHead>Lịch học</TableHead>
              <TableHead>Giảng viên</TableHead>
              <TableHead>Cơ sở học</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead className="text-right">Hành động</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sections.map((section) => {
              const allowDirectEnroll = section.studentStatus === "AVAILABLE";

              return (
                <TableRow key={section.id}>
                  <TableCell>{section.code}</TableCell>
                  <TableCell>
                    <p className="font-medium">
                      {dayOfWeekLabel(section.dayOfWeek)} - {section.timeSlot.label}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {section.timeSlot.startTime} - {section.timeSlot.endTime}
                    </p>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 text-sm">
                      <UserRound className="text-muted-foreground size-3.5" />
                      <span>{section.instructor.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <p className="text-sm font-medium">
                        {section.room.campus ?? "Cơ sở UEH"} - {section.room.code}
                      </p>
                      <p className="text-muted-foreground flex items-start gap-1 text-xs leading-relaxed">
                        <MapPin className="mt-0.5 size-3 shrink-0" />
                        <span>{section.room.address ?? "Địa chỉ đang cập nhật"}</span>
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={section.studentStatus === "FULL" ? "destructive" : "secondary"}>
                      {statusLabel(section.studentStatus)}
                    </Badge>
                    {!section.capacityHidden && section.capacity ? (
                      <span className="text-muted-foreground mt-1 block text-xs">
                        Còn {section.availableSlots}/{section.capacity}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right">
                    {allowDirectEnroll ? (
                      <Button
                        className="primary-glow"
                        onClick={() => void enroll(section.id)}
                        disabled={loadingSectionId === section.id}
                      >
                        {loadingSectionId === section.id ? <Loader2 className="size-4 animate-spin" /> : "Đăng ký"}
                      </Button>
                    ) : (
                      <Button variant="outline" onClick={() => setOpenDialog(true)} disabled={!canJoinWaiting}>
                        Phòng chờ
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <Dialog
        open={openDialog}
        onOpenChange={(value) => {
          setOpenDialog(value);
          if (!value) {
            setAcceptedTerms(false);
          }
        }}
      >
        <DialogContent className="glass-card sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Chọn 3 nguyện vọng lớp bổ sung (P1-P3)</DialogTitle>
            <DialogDescription>
              Hệ thống sẽ xét theo FIFO và ưu tiên nguyện vọng từ lớp bổ sung do phòng đào tạo mở cho phòng chờ.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Nguyện vọng 1</Label>
                <Select value={priority1} onValueChange={setPriority1} disabled={!canJoinWaiting}>
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn lớp bổ sung ưu tiên 1" />
                  </SelectTrigger>
                  <SelectContent>
                    {selectableWaitingSections.map((section) => (
                      <SelectItem key={section.id} value={section.id}>
                        {section.code} - {dayOfWeekLabel(section.dayOfWeek)} {section.timeSlot.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Nguyện vọng 2</Label>
                <Select value={priority2} onValueChange={setPriority2} disabled={!canJoinWaiting}>
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn lớp bổ sung ưu tiên 2" />
                  </SelectTrigger>
                  <SelectContent>
                    {selectableWaitingSections.map((section) => (
                      <SelectItem key={section.id} value={section.id}>
                        {section.code} - {dayOfWeekLabel(section.dayOfWeek)} {section.timeSlot.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Nguyện vọng 3</Label>
                <Select value={priority3} onValueChange={setPriority3} disabled={!canJoinWaiting}>
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn lớp bổ sung ưu tiên 3" />
                  </SelectTrigger>
                  <SelectContent>
                    {selectableWaitingSections.map((section) => (
                      <SelectItem key={section.id} value={section.id}>
                        {section.code} - {dayOfWeekLabel(section.dayOfWeek)} {section.timeSlot.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {canJoinWaiting ? null : (
                <p className="text-muted-foreground text-xs">
                  Hiện chưa có lớp bổ sung để chọn. Vui lòng quay lại sau khi phòng chờ active.
                </p>
              )}
            </div>

            <div className="bg-primary/8 border-primary/20 rounded-2xl border p-4">
              <div className="mb-3 flex items-center gap-2">
                <ShieldCheck className="text-primary size-4" />
                <h4 className="text-sm font-semibold">Điều khoản tham gia phòng chờ</h4>
              </div>
              <ul className="text-muted-foreground space-y-2 text-xs leading-relaxed">
                <li className="flex gap-2">
                  <Info className="mt-0.5 size-3 shrink-0" />
                  <span>Bạn cam kết xác nhận/từ chối offer trong thời hạn 24 giờ kể từ lúc nhận thông báo.</span>
                </li>
                <li className="flex gap-2">
                  <Info className="mt-0.5 size-3 shrink-0" />
                  <span>Nếu quá hạn, offer sẽ tự động hết hiệu lực và chuyển cho sinh viên tiếp theo theo FIFO.</span>
                </li>
                <li className="flex gap-2">
                  <Info className="mt-0.5 size-3 shrink-0" />
                  <span>Thông tin đăng ký khi xác nhận thành công sẽ được ghi nhận vào học vụ và tài chính.</span>
                </li>
                <li className="flex gap-2">
                  <Info className="mt-0.5 size-3 shrink-0" />
                  <span>Bạn chịu trách nhiệm đảm bảo không đăng ký trùng lịch và tuân thủ quy định đào tạo hiện hành.</span>
                </li>
              </ul>

              <label className="mt-4 flex cursor-pointer items-start gap-2 rounded-xl border border-emerald-400/25 bg-white/55 p-3 text-xs leading-relaxed">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 rounded border-emerald-500 accent-emerald-600"
                  checked={acceptedTerms}
                  onChange={(event) => setAcceptedTerms(event.target.checked)}
                />
                <span>
                  Tôi đã đọc, hiểu và <strong>đồng ý điều khoản</strong> tham gia phòng chờ lớp học.
                </span>
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenDialog(false)}>
              Hủy
            </Button>
            <Button className="primary-glow" onClick={() => void joinWaiting()} disabled={!acceptedTerms || !canJoinWaiting}>
              Xác nhận
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
