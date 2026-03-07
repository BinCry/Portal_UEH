"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Info, Loader2, Search, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { dayOfWeekLabel, formatSectionScheduleSummary } from "@/lib/section-display";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type SectionItem = {
  id: string;
  code: string;
  dayOfWeek: string;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
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
  capacityHidden: boolean;
  capacity: number | null;
  registeredCount: number | null;
  reservedCount: number | null;
  studentStatus: "FULL" | "NEAR_FULL" | "AVAILABLE" | "WAITING";
  availableSlots: number;
};

const NONE_PRIORITY = "__NONE__";

const parsePayload = async (response: Response) => {
  try {
    return (await response.json()) as {
      success?: boolean;
      data?: { position?: number };
      error?: { message?: string };
    };
  } catch {
    return null;
  }
};

const getScheduleSummary = (section: SectionItem) =>
  formatSectionScheduleSummary({
    dayOfWeek: section.dayOfWeek,
    startTime: section.timeSlot.startTime,
    endTime: section.timeSlot.endTime,
    startDate: section.startDate,
    endDate: section.endDate,
    address: section.room.address,
    campus: section.room.campus,
    roomCode: section.room.code,
  });

export const SectionsTable = ({
  courseId,
  courseName = "Đang cập nhật",
  waitingActive,
  sections,
  waitingSections,
}: {
  courseId: string;
  courseName?: string;
  waitingActive: boolean;
  sections: SectionItem[];
  waitingSections: SectionItem[];
}) => {
  const router = useRouter();
  const [searchCode, setSearchCode] = useState("");
  const [searchSchedule, setSearchSchedule] = useState("");
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [loadingAction, setLoadingAction] = useState(false);
  const [openDialog, setOpenDialog] = useState(false);
  const [priority1, setPriority1] = useState("");
  const [priority2, setPriority2] = useState("");
  const [priority3, setPriority3] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  const selectableWaitingSections = useMemo(() => {
    const nonFullSections = waitingSections.filter((section) => section.studentStatus !== "FULL");
    return nonFullSections.length ? nonFullSections : waitingSections;
  }, [waitingSections]);
  const canJoinWaiting = waitingActive && waitingSections.length > 0;

  const filteredSections = useMemo(() => {
    return sections.filter((section) => {
      const matchCode = section.code.toLowerCase().includes(searchCode.toLowerCase());
      const scheduleText = getScheduleSummary(section).toLowerCase();
      const matchSchedule = scheduleText.includes(searchSchedule.toLowerCase());
      return matchCode && matchSchedule;
    });
  }, [sections, searchCode, searchSchedule]);

  const selectedSectionData = sections.find((section) => section.id === selectedSectionId);
  const isSelectedAvailable =
    selectedSectionData?.studentStatus === "AVAILABLE" || selectedSectionData?.studentStatus === "NEAR_FULL";

  const handleEnroll = async () => {
    if (!selectedSectionId) {
      toast.error("Vui lòng chọn một lớp học phần để đăng ký");
      return;
    }

    setLoadingAction(true);
    try {
      const response = await fetch("/api/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionId: selectedSectionId }),
      });
      const payload = await parsePayload(response);

      if (!response.ok || !payload?.success) {
        toast.error(payload?.error?.message ?? "Đăng ký thất bại");
        return;
      }

      toast.success("Đăng ký học phần thành công");
      window.location.reload();
    } catch {
      toast.error("Không thể kết nối tới máy chủ");
    } finally {
      setLoadingAction(false);
    }
  };

  const joinWaiting = async () => {
    const selectedPriorities = [priority1, priority2, priority3].filter(Boolean);
    if (!selectedPriorities.length) {
      toast.error("Vui lòng chọn ít nhất 1 nguyện vọng");
      return;
    }
    if (new Set(selectedPriorities).size !== selectedPriorities.length) {
      toast.error("Các nguyện vọng không được trùng nhau");
      return;
    }
    if (!acceptedTerms) {
      toast.error("Bạn phải đồng ý điều khoản trước khi tham gia phòng chờ");
      return;
    }

    setLoadingAction(true);
    try {
      const response = await fetch("/api/waiting/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId,
          acceptedTerms,
          priorities: selectedPriorities.map((sectionId) => ({ sectionId })),
        }),
      });
      const payload = await parsePayload(response);

      if (!response.ok || !payload?.success) {
        toast.error(payload?.error?.message ?? "Không thể tham gia phòng chờ");
        return;
      }

      toast.success(`Tham gia phòng chờ thành công. Vị trí ưu tiên #${payload.data?.position ?? "?"}`);
      setOpenDialog(false);
      setPriority1("");
      setPriority2("");
      setPriority3("");
      setAcceptedTerms(false);
    } catch {
      toast.error("Không thể kết nối tới máy chủ");
    } finally {
      setLoadingAction(false);
    }
  };

  return (
    <div className="space-y-6 bg-white">
      <div className="border-b pb-4">
        <h2 className="text-lg font-bold text-[#0f3b46]">Học phần: {courseName}</h2>
      </div>

      <div className="grid grid-cols-1 items-end gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="searchCode" className="text-xs font-semibold">
            Mã LHP
          </Label>
          <Input
            id="searchCode"
            placeholder="Tìm theo mã..."
            value={searchCode}
            onChange={(event) => setSearchCode(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="searchSchedule" className="text-xs font-semibold">
            Nội dung lịch học
          </Label>
          <Input
            id="searchSchedule"
            placeholder="Thứ, giờ học, địa điểm..."
            value={searchSchedule}
            onChange={(event) => setSearchSchedule(event.target.value)}
          />
        </div>
        <Button className="flex items-center gap-2 bg-[#0f3b46] text-white hover:bg-[#0f3b46]/90">
          <Search className="size-4" /> Tìm kiếm
        </Button>
      </div>

      {!waitingActive ? (
        <div className="flex gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <Info className="size-5 shrink-0 text-amber-600" />
          <span>
            Phòng chờ sẽ được mở khi tất cả lớp học phần của môn này chỉ còn tối đa 5 slot trống. Bạn có thể chọn lớp bổ sung khi
            trạng thái này được kích hoạt.
          </span>
        </div>
      ) : null}

      <div className="rounded-sm border border-gray-300">
        <Table>
          <TableHeader className="bg-gray-100/80">
            <TableRow>
              <TableHead className="w-[60px] border-r text-center font-semibold text-black">Chọn</TableHead>
              <TableHead className="border-r font-semibold text-black">Mã LHP</TableHead>
              <TableHead className="border-r text-center font-semibold text-black">Sĩ số ĐK</TableHead>
              <TableHead className="border-r text-center font-semibold text-black">SL còn lại</TableHead>
              <TableHead className="font-semibold text-black">Lịch học</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredSections.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                  Không tìm thấy lớp học phần.
                </TableCell>
              </TableRow>
            ) : (
              filteredSections.map((section) => (
                <TableRow
                  key={section.id}
                  className={`border-b border-gray-200 ${selectedSectionId === section.id ? "bg-blue-50/50" : ""}`}
                >
                  <TableCell className="border-r text-center">
                    <input
                      type="radio"
                      name="sectionSelection"
                      className="size-4 cursor-pointer accent-[#0f3b46]"
                      checked={selectedSectionId === section.id}
                      onChange={() => setSelectedSectionId(section.id)}
                    />
                  </TableCell>
                  <TableCell className="border-r font-medium">
                    {section.studentStatus === "WAITING" ? (
                      <div className="space-y-1">
                        <span className="block text-amber-700">Waiting room 1</span>
                        <Badge variant="secondary" className="bg-amber-100 text-[10px] text-amber-800">
                          [Đang chờ]
                        </Badge>
                      </div>
                    ) : (
                      section.code
                    )}
                  </TableCell>
                  <TableCell className="border-r text-center">{section.capacityHidden ? "-" : (section.registeredCount ?? 0)}</TableCell>
                  <TableCell className="border-r text-center">{section.capacityHidden ? "-" : section.availableSlots}</TableCell>
                  <TableCell className="text-sm leading-relaxed">{getScheduleSummary(section)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-end gap-3 border-t pt-4">
        <Button
          className="min-w-[180px] bg-emerald-600 text-white hover:bg-emerald-700"
          onClick={() => setOpenDialog(true)}
          disabled={!canJoinWaiting}
        >
          Đăng ký mở lớp bổ sung
        </Button>
        <Button
          className="min-w-[120px] bg-blue-600 text-white hover:bg-blue-700"
          onClick={handleEnroll}
          disabled={!selectedSectionId || !isSelectedAvailable || loadingAction}
        >
          {loadingAction && isSelectedAvailable ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
          Đăng ký
        </Button>
        <Button variant="outline" onClick={() => router.push("/student/courses")}>
          Quay về
        </Button>
      </div>

      <Dialog
        open={openDialog}
        onOpenChange={(isOpen) => {
          setOpenDialog(isOpen);
          if (!isOpen) {
            setPriority1("");
            setPriority2("");
            setPriority3("");
            setAcceptedTerms(false);
          }
        }}
      >
        <DialogContent className="overflow-hidden bg-white p-0 sm:max-w-[700px]">
          <DialogHeader className="border-b bg-gray-50/50 p-6">
            <DialogTitle className="text-xl text-[#0f3b46]">Phòng chờ đăng ký học phần</DialogTitle>
            <DialogDescription>
              Hệ thống sẽ xét theo FIFO và ưu tiên nguyện vọng từ lớp bổ sung do phòng đào tạo mở cho phòng chờ.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-6 p-6 lg:grid-cols-[1.2fr_1fr]">
            <div className="space-y-4">
              {[
                { label: "Ưu tiên 1:", value: priority1, onChange: setPriority1 },
                { label: "Ưu tiên 2:", value: priority2, onChange: setPriority2 },
                { label: "Ưu tiên 3:", value: priority3, onChange: setPriority3 },
              ].map((priority) => (
                <div key={priority.label} className="space-y-2">
                  <Label className="font-semibold text-gray-700">{priority.label}</Label>
                  <Select
                    value={priority.value || NONE_PRIORITY}
                    onValueChange={(value) => priority.onChange(value === NONE_PRIORITY ? "" : value)}
                    disabled={!canJoinWaiting}
                  >
                    <SelectTrigger className="bg-white">
                      <SelectValue placeholder="Không chọn" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE_PRIORITY}>Không chọn</SelectItem>
                      {selectableWaitingSections.map((section) => (
                        <SelectItem key={section.id} value={section.id}>
                          {dayOfWeekLabel(section.dayOfWeek)} {section.timeSlot.startTime} - {section.timeSlot.endTime}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            <div className="flex flex-col justify-center rounded-lg border bg-slate-50 p-5">
              <div className="mb-3 flex items-center gap-2 text-[#0f3b46]">
                <ShieldCheck className="size-5" />
                <h4 className="font-bold">Cam kết</h4>
              </div>
              <label className="flex cursor-pointer items-start gap-3 text-sm leading-snug text-gray-700">
                <input
                  type="checkbox"
                  className="mt-1 size-4 shrink-0 rounded accent-emerald-600"
                  checked={acceptedTerms}
                  onChange={(event) => setAcceptedTerms(event.target.checked)}
                />
                <span>Tôi cam kết có trách nhiệm với lựa chọn tham gia lớp phòng chờ này.</span>
              </label>
            </div>
          </div>
          <DialogFooter className="flex justify-end gap-2 border-t bg-gray-50 p-4">
            <Button
              className="min-w-[160px] bg-[#0f3b46] text-white hover:bg-[#0f3b46]/90"
              onClick={joinWaiting}
              disabled={!acceptedTerms || !canJoinWaiting || loadingAction}
            >
              {loadingAction ? <Loader2 className="mr-2 size-4 animate-spin" /> : null} Tham gia phòng chờ
            </Button>
            <Button variant="outline" onClick={() => setOpenDialog(false)}>
              Đóng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
