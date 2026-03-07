"use client";

import { useEffect, useState } from "react";
import { DayOfWeek, SectionStatus } from "@prisma/client";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TIMEZONE } from "@/lib/constants";
import { formatSectionScheduleSummary } from "@/lib/section-display";

type Course = { id: string; code: string; name: string; planType: "IN_PLAN" | "OUT_PLAN" };
type TimeSlot = { id: string; label: string; startTime: string; endTime: string };

type Section = {
  id: string;
  code: string;
  courseId: string;
  roomId: string;
  dayOfWeek: DayOfWeek;
  timeSlotId: string;
  startDate: string | null;
  endDate: string | null;
  capacity: number;
  capacityHidden: boolean;
  isWaitingOption: boolean;
  registeredCount: number;
  reservedCount: number;
  canEditCapacity: boolean;
  status: SectionStatus;
  course: {
    name: string;
    code: string;
    planType: "IN_PLAN" | "OUT_PLAN";
    waitingRoom: {
      isActive: boolean;
    } | null;
  };
  room: {
    id: string;
    code: string;
    campus?: string | null;
    address?: string | null;
    building?: string | null;
    capacity?: number;
  };
  timeSlot: {
    id: string;
    label: string;
    startTime: string;
    endTime: string;
  };
};

type SectionForm = {
  code: string;
  courseId: string;
  roomCode: string;
  roomCampus: string;
  roomAddress: string;
  roomBuilding: string;
  roomCapacity: number;
  dayOfWeek: DayOfWeek;
  timeSlotId: string;
  startDate: string;
  endDate: string;
  capacity: number;
  registeredCount: number;
  capacityHidden: boolean;
  isWaitingOption: boolean;
  status: SectionStatus;
};

const dayOptions = Object.values(DayOfWeek);
const statusOptions = Object.values(SectionStatus);
const dayLabelMap: Record<DayOfWeek, string> = {
  MONDAY: "Thứ Hai",
  TUESDAY: "Thứ Ba",
  WEDNESDAY: "Thứ Tư",
  THURSDAY: "Thứ Năm",
  FRIDAY: "Thứ Sáu",
  SATURDAY: "Thứ Bảy",
  SUNDAY: "Chủ Nhật",
};

const parseDateInput = (value: string) => {
  const raw = value.trim();
  if (!raw) return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  const dmySlash = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw);
  const dmyDash = /^(\d{2})-(\d{2})-(\d{4})$/.exec(raw);
  const dmySlashShort = /^(\d{2})\/(\d{2})\/(\d{2})$/.exec(raw);
  const dmyDashShort = /^(\d{2})-(\d{2})-(\d{2})$/.exec(raw);

  let year: number;
  let month: number;
  let day: number;

  if (iso) {
    year = Number(iso[1]);
    month = Number(iso[2]);
    day = Number(iso[3]);
  } else if (dmySlash) {
    day = Number(dmySlash[1]);
    month = Number(dmySlash[2]);
    year = Number(dmySlash[3]);
  } else if (dmyDash) {
    day = Number(dmyDash[1]);
    month = Number(dmyDash[2]);
    year = Number(dmyDash[3]);
  } else if (dmySlashShort) {
    day = Number(dmySlashShort[1]);
    month = Number(dmySlashShort[2]);
    year = 2000 + Number(dmySlashShort[3]);
  } else if (dmyDashShort) {
    day = Number(dmyDashShort[1]);
    month = Number(dmyDashShort[2]);
    year = 2000 + Number(dmyDashShort[3]);
  } else {
    return null;
  }

  if (year < 1900 || year > 2100) return null;

  const validated = new Date(Date.UTC(year, month - 1, day));
  const ok =
    validated.getUTCFullYear() === year &&
    validated.getUTCMonth() === month - 1 &&
    validated.getUTCDate() === day;
  if (!ok) return null;

  return { year, month, day };
};

const toDateInputValue = (value?: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) return "";

  return `${day}/${month}/${year}`;
};

const normalizeDateInput = (value: string) => {
  const parsed = parseDateInput(value);
  if (!parsed) return null;
  return `${String(parsed.day).padStart(2, "0")}/${String(parsed.month).padStart(2, "0")}/${parsed.year}`;
};

const toApiDateValue = (value: string) => {
  const parsed = parseDateInput(value);
  if (!parsed) return undefined;
  return `${parsed.year}-${String(parsed.month).padStart(2, "0")}-${String(parsed.day).padStart(2, "0")}`;
};

const getDateTimestamp = (value: string) => {
  const parsed = parseDateInput(value);
  if (!parsed) return null;
  return Date.UTC(parsed.year, parsed.month - 1, parsed.day);
};

const initialForm: SectionForm = {
  code: "",
  courseId: "",
  roomCode: "",
  roomCampus: "",
  roomAddress: "",
  roomBuilding: "UEH",
  roomCapacity: 80,
  dayOfWeek: DayOfWeek.MONDAY,
  timeSlotId: "",
  startDate: "",
  endDate: "",
  capacity: 40,
  registeredCount: 0,
  capacityHidden: false,
  isWaitingOption: false,
  status: SectionStatus.OPEN,
};

const toPayload = (form: SectionForm) => ({
  code: form.code.trim(),
  courseId: form.courseId,
  room: {
    code: form.roomCode.trim().toUpperCase(),
    campus: form.roomCampus.trim() || undefined,
    address: form.roomAddress.trim() || undefined,
    building: form.roomBuilding.trim() || undefined,
    capacity: form.roomCapacity,
  },
  dayOfWeek: form.dayOfWeek,
  timeSlotId: form.timeSlotId,
  startDate: toApiDateValue(form.startDate),
  endDate: toApiDateValue(form.endDate),
  capacity: form.capacity,
  registeredCount: form.registeredCount,
  capacityHidden: form.capacityHidden,
  isWaitingOption: form.isWaitingOption,
  status: form.status,
});

const sectionToForm = (section: Section): SectionForm => ({
  code: section.code,
  courseId: section.courseId,
  roomCode: section.room.code ?? "",
  roomCampus: section.room.campus ?? "",
  roomAddress: section.room.address ?? "",
  roomBuilding: section.room.building ?? "UEH",
  roomCapacity: section.room.capacity ?? 80,
  dayOfWeek: section.dayOfWeek,
  timeSlotId: section.timeSlotId,
  startDate: toDateInputValue(section.startDate),
  endDate: toDateInputValue(section.endDate),
  capacity: section.capacity,
  registeredCount: section.registeredCount,
  capacityHidden: section.capacityHidden,
  isWaitingOption: section.isWaitingOption,
  status: section.status,
});

const renderSectionSchedule = (section: Section) =>
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

export const SectionsManager = () => {
  const [sections, setSections] = useState<Section[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingForm, setEditingForm] = useState<SectionForm | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const normalizeCreateDateField = (field: "startDate" | "endDate", value: string) => {
    const normalized = normalizeDateInput(value);
    if (value.trim() && !normalized) {
      toast.error("Ngày không hợp lệ. Vui lòng nhập dd/mm/yyyy hoặc yyyy-mm-dd");
      return;
    }
    setForm((current) => ({ ...current, [field]: normalized ?? "" }));
  };

  const normalizeEditDateField = (field: "startDate" | "endDate", value: string) => {
    if (!editingForm) return;
    const normalized = normalizeDateInput(value);
    if (value.trim() && !normalized) {
      toast.error("Ngày không hợp lệ. Vui lòng nhập dd/mm/yyyy hoặc yyyy-mm-dd");
      return;
    }
    setEditingForm({ ...editingForm, [field]: normalized ?? "" });
  };

  const load = async () => {
    const [sectionsRes, coursesRes, timeSlotsRes] = await Promise.all([
      fetch("/api/admin/sections"),
      fetch("/api/admin/courses"),
      fetch("/api/admin/timeslots"),
    ]);
    const [sectionsData, coursesData, slotData] = await Promise.all([
      sectionsRes.json(),
      coursesRes.json(),
      timeSlotsRes.json(),
    ]);
    if (sectionsData.success) setSections(sectionsData.data);
    if (coursesData.success) setCourses(coursesData.data);
    if (slotData.success) setTimeSlots(slotData.data);
  };

  useEffect(() => {
    void load();
  }, []);

  const createSection = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedStartDate = form.startDate ? (normalizeDateInput(form.startDate) ?? "") : "";
    const normalizedEndDate = form.endDate ? (normalizeDateInput(form.endDate) ?? "") : "";
    if (form.startDate && !normalizedStartDate) {
      toast.error("Ngày bắt đầu không hợp lệ. Vui lòng nhập dd/mm/yyyy");
      return;
    }
    if (form.endDate && !normalizedEndDate) {
      toast.error("Ngày kết thúc không hợp lệ. Vui lòng nhập dd/mm/yyyy");
      return;
    }
    if (normalizedStartDate && normalizedEndDate) {
      const startTs = getDateTimestamp(normalizedStartDate);
      const endTs = getDateTimestamp(normalizedEndDate);
      if (startTs !== null && endTs !== null && startTs > endTs) {
        toast.error("Ngày bắt đầu không được lớn hơn ngày kết thúc");
        return;
      }
    }

    const normalizedForm = {
      ...form,
      startDate: normalizedStartDate,
      endDate: normalizedEndDate,
    };
    setForm(normalizedForm);

    const response = await fetch("/api/admin/sections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toPayload(normalizedForm)),
    });
    const payload = await response.json();
    if (!response.ok || !payload.success) {
      toast.error(payload.error?.message ?? "Không thể tạo LHP");
      return;
    }
    toast.success("Đã tạo LHP");
    setForm(initialForm);
    await load();
  };

  const openEdit = (section: Section) => {
    setEditingId(section.id);
    setEditingForm(sectionToForm(section));
  };

  const saveEdit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingId || !editingForm) return;

    const normalizedStartDate = editingForm.startDate ? (normalizeDateInput(editingForm.startDate) ?? "") : "";
    const normalizedEndDate = editingForm.endDate ? (normalizeDateInput(editingForm.endDate) ?? "") : "";
    if (editingForm.startDate && !normalizedStartDate) {
      toast.error("Ngày bắt đầu không hợp lệ. Vui lòng nhập dd/mm/yyyy");
      return;
    }
    if (editingForm.endDate && !normalizedEndDate) {
      toast.error("Ngày kết thúc không hợp lệ. Vui lòng nhập dd/mm/yyyy");
      return;
    }
    if (normalizedStartDate && normalizedEndDate) {
      const startTs = getDateTimestamp(normalizedStartDate);
      const endTs = getDateTimestamp(normalizedEndDate);
      if (startTs !== null && endTs !== null && startTs > endTs) {
        toast.error("Ngày bắt đầu không được lớn hơn ngày kết thúc");
        return;
      }
    }

    const normalizedEditingForm = {
      ...editingForm,
      startDate: normalizedStartDate,
      endDate: normalizedEndDate,
    };
    setEditingForm(normalizedEditingForm);

    setSavingEdit(true);
    const response = await fetch(`/api/admin/sections/${editingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toPayload(normalizedEditingForm)),
    });
    const payload = await response.json();
    setSavingEdit(false);

    if (!response.ok || !payload.success) {
      toast.error(payload.error?.message ?? "Không thể cập nhật LHP");
      return;
    }

    toast.success("Đã lưu thay đổi lớp học phần");
    setEditingId(null);
    setEditingForm(null);
    await load();
  };

  const deleteSection = async (id: string) => {
    const response = await fetch(`/api/admin/sections/${id}`, { method: "DELETE" });
    const payload = await response.json();
    if (!response.ok || !payload.success) {
      toast.error(payload.error?.message ?? "Không thể xóa LHP");
      return;
    }
    toast.success("Đã xóa LHP");
    await load();
  };

  const updateCapacity = async (section: Section) => {
    const newCapacityRaw = window.prompt("Nhập sĩ số tối đa mới", String(section.capacity));
    if (!newCapacityRaw) return;
    const newCapacity = Number(newCapacityRaw);
    if (Number.isNaN(newCapacity) || newCapacity <= 0) {
      toast.error("Sĩ số không hợp lệ");
      return;
    }
    const response = await fetch(`/api/admin/sections/${section.id}/capacity`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ capacity: newCapacity }),
    });
    const payload = await response.json();
    if (!response.ok || !payload.success) {
      toast.error(payload.error?.message ?? "Không thể cập nhật sĩ số");
      return;
    }
    toast.success("Cập nhật sĩ số thành công");
    await load();
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[460px_1fr]">
      <Card className="glass-card border-cyan-200/70">
        <CardHeader>
          <CardTitle>Tạo lớp học phần mới</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3" onSubmit={createSection}>
            <div className="space-y-2">
              <Label>Mã LHP</Label>
              <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label>Học phần</Label>
              <Select value={form.courseId} onValueChange={(value) => setForm({ ...form, courseId: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Chọn học phần" />
                </SelectTrigger>
                <SelectContent>
                  {courses.map((course) => (
                    <SelectItem key={course.id} value={course.id}>
                      {course.code} - {course.name} ({course.planType === "IN_PLAN" ? "Trong KH" : "Ngoài KH"})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="rounded-2xl border border-cyan-200/80 bg-white/65 p-3">
              <p className="mb-2 text-sm font-semibold text-slate-700">Thông tin phòng học</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Mã phòng</Label>
                  <Input
                    placeholder="Ví dụ: B1-0904"
                    value={form.roomCode}
                    onChange={(event) => setForm({ ...form, roomCode: event.target.value.toUpperCase() })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Cơ sở</Label>
                  <Input
                    placeholder="Ví dụ: Cơ sở Nam Sài Gòn"
                    value={form.roomCampus}
                    onChange={(event) => setForm({ ...form, roomCampus: event.target.value })}
                  />
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Tòa nhà/Khu</Label>
                  <Input
                    placeholder="Ví dụ: Khu B1"
                    value={form.roomBuilding}
                    onChange={(event) => setForm({ ...form, roomBuilding: event.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Sức chứa phòng</Label>
                  <Input
                    type="number"
                    min={1}
                    value={form.roomCapacity}
                    onChange={(event) => setForm({ ...form, roomCapacity: Number(event.target.value) })}
                  />
                </div>
              </div>
              <div className="mt-3 space-y-2">
                <Label>Địa chỉ</Label>
                <Input
                  placeholder="Ví dụ: 279 Nguyễn Tri Phương, Quận 10"
                  value={form.roomAddress}
                  onChange={(event) => setForm({ ...form, roomAddress: event.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Thứ</Label>
                <Select value={form.dayOfWeek} onValueChange={(value) => setForm({ ...form, dayOfWeek: value as DayOfWeek })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {dayOptions.map((day) => (
                      <SelectItem key={day} value={day}>
                        {dayLabelMap[day]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Khung giờ</Label>
                <Select value={form.timeSlotId} onValueChange={(value) => setForm({ ...form, timeSlotId: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn khung giờ" />
                  </SelectTrigger>
                  <SelectContent>
                    {timeSlots.map((slot) => (
                      <SelectItem key={slot.id} value={slot.id}>
                        {slot.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Ngày bắt đầu</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  placeholder="dd/mm/yyyy"
                  value={form.startDate}
                  onChange={(event) => setForm({ ...form, startDate: event.target.value })}
                  onBlur={(event) => normalizeCreateDateField("startDate", event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Ngày kết thúc</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  placeholder="dd/mm/yyyy"
                  value={form.endDate}
                  onChange={(event) => setForm({ ...form, endDate: event.target.value })}
                  onBlur={(event) => normalizeCreateDateField("endDate", event.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Sĩ số tối đa</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.capacity}
                  onChange={(event) => setForm({ ...form, capacity: Number(event.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label>Sĩ số đã đăng ký</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.registeredCount}
                  onChange={(event) => setForm({ ...form, registeredCount: Number(event.target.value) })}
                />
              </div>
            </div>

            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isWaitingOption}
                onChange={(event) => setForm({ ...form, isWaitingOption: event.target.checked })}
              />
              <span>Lớp dành cho phòng chờ (ẩn khỏi đăng ký thường)</span>
            </label>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.capacityHidden}
                onChange={(event) => setForm({ ...form, capacityHidden: event.target.checked })}
              />
              Bật chế độ `capacity_hidden`
            </label>
            <Button className="primary-glow w-full" type="submit">
              Tạo LHP
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="glass-card border-violet-200/70">
        <CardHeader>
          <CardTitle>Danh sách lớp học phần</CardTitle>
        </CardHeader>
        <CardContent>
          <Table className="min-w-[1680px] table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[170px]">Mã LHP</TableHead>
                <TableHead className="w-[280px]">Học phần</TableHead>
                <TableHead className="w-[180px]">Loại lớp</TableHead>
                <TableHead className="w-[380px]">Lịch học & cơ sở</TableHead>
                <TableHead className="w-[120px]">Trạng thái</TableHead>
                <TableHead className="w-[90px]">Sĩ số</TableHead>
                <TableHead className="w-[110px]">Waiting</TableHead>
                <TableHead className="w-[310px] text-right">Tác vụ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sections.map((section) => (
                <TableRow key={section.id}>
                  <TableCell className="max-w-[170px] align-top whitespace-normal break-all leading-snug">{section.code}</TableCell>
                  <TableCell className="max-w-[280px] align-top whitespace-normal break-words leading-snug">
                    {section.course.code} - {section.course.name}
                  </TableCell>
                  <TableCell className="align-top whitespace-normal">
                    <Badge variant={section.isWaitingOption ? "default" : "secondary"}>
                      {section.isWaitingOption ? "Lớp phòng chờ (ẩn)" : "Lớp đăng ký thường"}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-[380px] align-top whitespace-normal break-words text-sm leading-relaxed">
                    {renderSectionSchedule(section)}
                  </TableCell>
                  <TableCell className="align-top">
                    <Badge variant={section.status === "OPEN" ? "default" : "secondary"}>{section.status}</Badge>
                  </TableCell>
                  <TableCell className="align-top">
                    {section.capacityHidden && !section.course.waitingRoom?.isActive ? (
                      <span className="text-muted-foreground text-xs">Ẩn (capacity_hidden=true)</span>
                    ) : (
                      <span>
                        {section.registeredCount + section.reservedCount}/{section.capacity}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="align-top">
                    <Badge variant={section.course.waitingRoom?.isActive ? "default" : "secondary"}>
                      {section.course.waitingRoom?.isActive ? "ĐANG MỞ" : "CHƯA MỞ"}
                    </Badge>
                  </TableCell>
                  <TableCell className="align-top text-right">
                    <div className="flex flex-wrap justify-end gap-2 whitespace-normal">
                      <Button variant="outline" className="whitespace-nowrap" onClick={() => openEdit(section)}>
                        Chi tiết / Sửa
                      </Button>
                      <Button
                        variant="outline"
                        className="whitespace-nowrap"
                        disabled={!section.canEditCapacity}
                        onClick={() => void updateCapacity(section)}
                      >
                        Cập nhật sĩ số
                      </Button>
                      <Button variant="destructive" className="whitespace-nowrap" onClick={() => void deleteSection(section.id)}>
                        Xóa
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(editingForm)}
        onOpenChange={(open) => {
          if (!open) {
            setEditingId(null);
            setEditingForm(null);
          }
        }}
      >
        <DialogContent className="glass-card max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Chi tiết lớp học phần và chỉnh sửa dữ liệu</DialogTitle>
          </DialogHeader>
          {editingForm ? (
            <form className="grid gap-3" onSubmit={saveEdit}>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Mã LHP</Label>
                  <Input value={editingForm.code} onChange={(e) => setEditingForm({ ...editingForm, code: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <Label>Trạng thái lớp</Label>
                  <Select
                    value={editingForm.status}
                    onValueChange={(value) => setEditingForm({ ...editingForm, status: value as SectionStatus })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {statusOptions.map((status) => (
                        <SelectItem key={status} value={status}>
                          {status}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Học phần</Label>
                <Select value={editingForm.courseId} onValueChange={(value) => setEditingForm({ ...editingForm, courseId: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn học phần" />
                  </SelectTrigger>
                  <SelectContent>
                    {courses.map((course) => (
                      <SelectItem key={course.id} value={course.id}>
                        {course.code} - {course.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="rounded-xl border border-cyan-200/70 bg-white/60 p-3">
                <p className="mb-2 text-sm font-semibold">Thông tin phòng học</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Mã phòng</Label>
                    <Input
                      value={editingForm.roomCode}
                      onChange={(event) => setEditingForm({ ...editingForm, roomCode: event.target.value.toUpperCase() })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Cơ sở</Label>
                    <Input
                      value={editingForm.roomCampus}
                      onChange={(event) => setEditingForm({ ...editingForm, roomCampus: event.target.value })}
                    />
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Tòa nhà/Khu</Label>
                    <Input
                      value={editingForm.roomBuilding}
                      onChange={(event) => setEditingForm({ ...editingForm, roomBuilding: event.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Sức chứa phòng</Label>
                    <Input
                      type="number"
                      min={1}
                      value={editingForm.roomCapacity}
                      onChange={(event) => setEditingForm({ ...editingForm, roomCapacity: Number(event.target.value) })}
                    />
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  <Label>Địa chỉ</Label>
                  <Input
                    value={editingForm.roomAddress}
                    onChange={(event) => setEditingForm({ ...editingForm, roomAddress: event.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Thứ</Label>
                  <Select
                    value={editingForm.dayOfWeek}
                    onValueChange={(value) => setEditingForm({ ...editingForm, dayOfWeek: value as DayOfWeek })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {dayOptions.map((day) => (
                        <SelectItem key={day} value={day}>
                          {dayLabelMap[day]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Khung giờ</Label>
                  <Select
                    value={editingForm.timeSlotId}
                    onValueChange={(value) => setEditingForm({ ...editingForm, timeSlotId: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Chọn khung giờ" />
                    </SelectTrigger>
                    <SelectContent>
                      {timeSlots.map((slot) => (
                        <SelectItem key={slot.id} value={slot.id}>
                          {slot.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Ngày bắt đầu</Label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    placeholder="dd/mm/yyyy"
                    value={editingForm.startDate}
                    onChange={(event) => setEditingForm({ ...editingForm, startDate: event.target.value })}
                    onBlur={(event) => normalizeEditDateField("startDate", event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Ngày kết thúc</Label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    placeholder="dd/mm/yyyy"
                    value={editingForm.endDate}
                    onChange={(event) => setEditingForm({ ...editingForm, endDate: event.target.value })}
                    onBlur={(event) => normalizeEditDateField("endDate", event.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Sĩ số tối đa</Label>
                  <Input
                    type="number"
                    min={1}
                    value={editingForm.capacity}
                    onChange={(event) => setEditingForm({ ...editingForm, capacity: Number(event.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Sĩ số đã đăng ký</Label>
                  <Input
                    type="number"
                    min={0}
                    value={editingForm.registeredCount}
                    onChange={(event) => setEditingForm({ ...editingForm, registeredCount: Number(event.target.value) })}
                  />
                </div>
              </div>

              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editingForm.isWaitingOption}
                  onChange={(event) => setEditingForm({ ...editingForm, isWaitingOption: event.target.checked })}
                />
                <span>Lớp dành cho phòng chờ (ẩn khỏi đăng ký thường)</span>
              </label>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editingForm.capacityHidden}
                  onChange={(event) => setEditingForm({ ...editingForm, capacityHidden: event.target.checked })}
                />
                Bật chế độ `capacity_hidden`
              </label>

              <div className="mt-2 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditingId(null);
                    setEditingForm(null);
                  }}
                >
                  Hủy
                </Button>
                <Button type="submit" className="primary-glow" disabled={savingEdit}>
                  {savingEdit ? "Đang lưu..." : "Lưu thay đổi"}
                </Button>
              </div>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
};
