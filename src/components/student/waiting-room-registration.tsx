"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Course = {
  id: string;
  code: string;
  name: string;
  planType: "IN_PLAN" | "OUT_PLAN";
  waitingRoom: { isActive: boolean } | null;
};

type Section = {
  id: string;
  code: string;
  dayOfWeek: string;
  capacity: number | null;
  registeredCount: number | null;
  availableSlots: number;
  instructor: { name: string };
  timeSlot: { label: string };
  studentStatus: "AVAILABLE" | "NEAR_FULL" | "FULL";
};

type WaitingEntry = {
  id: string;
  state: "QUEUED" | "PENDING_ADMIN" | "OFFERED" | "CONFIRMED" | "DECLINED" | "EXPIRED" | "FAILED" | "DEFERRED";
  waitingRoom: { course: { code: string } };
};

const dayMap: Record<string, string> = {
  MONDAY: "Thứ 2",
  TUESDAY: "Thứ 3",
  WEDNESDAY: "Thứ 4",
  THURSDAY: "Thứ 5",
  FRIDAY: "Thứ 6",
  SATURDAY: "Thứ 7",
  SUNDAY: "Chủ nhật",
};

export const WaitingRoomRegistration = () => {
  const [courses, setCourses] = useState<Course[]>([]);
  const [planMode, setPlanMode] = useState<"IN_PLAN" | "OUT_PLAN">("IN_PLAN");
  const [query, setQuery] = useState("");
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");
  const [sections, setSections] = useState<Section[]>([]);
  const [waitingSections, setWaitingSections] = useState<Section[]>([]);
  const [waitingEntries, setWaitingEntries] = useState<WaitingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [priority1, setPriority1] = useState("");
  const [priority2, setPriority2] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const selectedCourse = courses.find((course) => course.id === selectedCourseId);
  const inPlanCourses = useMemo(() => courses.filter((course) => course.planType === "IN_PLAN"), [courses]);
  const outPlanCourses = useMemo(() => courses.filter((course) => course.planType === "OUT_PLAN"), [courses]);
  const coursesByMode = planMode === "IN_PLAN" ? inPlanCourses : outPlanCourses;
  const waitingChoices = waitingSections.length ? waitingSections : sections;

  const activeWaitingByCourse = useMemo(
    () =>
      new Set(
        waitingEntries
          .filter((item) => item.state === "QUEUED" || item.state === "PENDING_ADMIN" || item.state === "OFFERED")
          .map((item) => item.waitingRoom.course.code),
      ),
    [waitingEntries],
  );

  const loadCourses = async () => {
    const [coursesRes, waitingRes] = await Promise.all([fetch("/api/courses"), fetch("/api/waiting/me")]);
    const [coursesPayload, waitingPayload] = await Promise.all([coursesRes.json(), waitingRes.json()]);

    if (coursesPayload.success) {
      setCourses(coursesPayload.data);
      const first = coursesPayload.data.find((course: Course) => course.planType === "IN_PLAN")?.id ?? coursesPayload.data[0]?.id;
      setSelectedCourseId((current) => current || first || "");
    }
    if (waitingPayload.success) {
      setWaitingEntries(waitingPayload.data);
    }
    setLoading(false);
  };

  const loadSections = async (courseId: string) => {
    if (!courseId) return;
    const res = await fetch(`/api/courses/${courseId}/sections`);
    const payload = await res.json();
    if (payload.success) {
      setSections(payload.data.sections);
      setWaitingSections(payload.data.waitingSections);
    }
  };

  useEffect(() => {
    void loadCourses();
  }, []);

  useEffect(() => {
    if (selectedCourseId) void loadSections(selectedCourseId);
  }, [selectedCourseId]);

  useEffect(() => {
    const validInMode = coursesByMode.some((course) => course.id === selectedCourseId);
    if (!validInMode) {
      setSelectedCourseId(coursesByMode[0]?.id ?? "");
    }
  }, [coursesByMode, selectedCourseId]);

  const filteredSections = sections.filter((section) => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return true;
    return (
      section.code.toLowerCase().includes(keyword) ||
      section.instructor.name.toLowerCase().includes(keyword) ||
      section.timeSlot.label.toLowerCase().includes(keyword)
    );
  });

  const openDialog = () => {
    setPriority1("");
    setPriority2("");
    setAcceptedTerms(false);
    setDialogOpen(true);
  };

  const joinWaiting = async () => {
    if (!selectedCourseId) return;

    const priorities = [priority1, priority2].filter(Boolean);
    if (!priorities.length) {
      toast.error("Bạn cần chọn ít nhất 1 ưu tiên");
      return;
    }

    setSubmitting(true);
    const res = await fetch("/api/waiting/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        courseId: selectedCourseId,
        acceptedTerms,
        priorities: priorities.map((sectionId) => ({ sectionId })),
      }),
    });
    const payload = await res.json();
    setSubmitting(false);

    if (!res.ok || !payload.success) {
      toast.error(payload.error?.message ?? "Không thể tham gia phòng chờ");
      return;
    }

    toast.success("Đăng ký phòng chờ thành công");
    setDialogOpen(false);
    await loadCourses();
  };

  return (
    <div className="space-y-4 rounded-lg border border-[#005f69]/25 bg-white p-4">
      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-1">
          <Label className="text-[#005f69]">Loại học phần</Label>
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setPlanMode("IN_PLAN")}
              className={planMode === "IN_PLAN" ? "border-[#005f69] bg-[#005f69] text-white hover:bg-[#005f69]" : "border-[#005f69]/40"}
            >
              Trong kế hoạch
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPlanMode("OUT_PLAN")}
              className={planMode === "OUT_PLAN" ? "border-[#005f69] bg-[#005f69] text-white hover:bg-[#005f69]" : "border-[#005f69]/40"}
            >
              Ngoài kế hoạch
            </Button>
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-[#005f69]">Học phần</Label>
          <Select value={selectedCourseId} onValueChange={setSelectedCourseId}>
            <SelectTrigger>
              <SelectValue placeholder="Chọn học phần" />
            </SelectTrigger>
            <SelectContent>
              {coursesByMode.map((course) => (
                <SelectItem key={course.id} value={course.id}>
                  {course.code} - {course.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1 md:col-span-1">
          <Label className="text-[#005f69]">Tìm kiếm lớp học phần</Label>
          <Input placeholder="Mã LHP, giảng viên, lịch học..." value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-[#005f69]/40">
        <Table>
          <TableHeader>
            <TableRow className="border-b-2 border-[#005f69] bg-[#f8f9fa] hover:bg-[#f8f9fa]">
              <TableHead className="text-center text-xs font-bold tracking-wide text-[#005f69] uppercase">Mã LHP</TableHead>
              <TableHead className="text-center text-xs font-bold tracking-wide text-[#005f69] uppercase">Sĩ số ĐK</TableHead>
              <TableHead className="text-center text-xs font-bold tracking-wide text-[#005f69] uppercase">SL còn lại</TableHead>
              <TableHead className="text-left text-xs font-bold tracking-wide text-[#005f69] uppercase">Giảng viên</TableHead>
              <TableHead className="text-left text-xs font-bold tracking-wide text-[#005f69] uppercase">Lịch học</TableHead>
              <TableHead className="text-center text-xs font-bold tracking-wide text-[#005f69] uppercase">Trạng thái</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm">
                  Đang tải dữ liệu...
                </TableCell>
              </TableRow>
            ) : filteredSections.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-[#1f2937]/70">
                  Không có lớp phù hợp.
                </TableCell>
              </TableRow>
            ) : (
              filteredSections.map((section) => {
                const inQueue = selectedCourse ? activeWaitingByCourse.has(selectedCourse.code) : false;
                const waitingEnabled = Boolean(selectedCourse?.waitingRoom?.isActive);
                const showWaitingAction = section.studentStatus === "FULL";

                return (
                  <TableRow key={section.id}>
                    <TableCell className="text-center font-semibold">{section.code}</TableCell>
                    <TableCell className="text-center">{section.registeredCount ?? "--"}</TableCell>
                    <TableCell className="text-center">{section.capacity === null ? "--" : Math.max(section.availableSlots, 0)}</TableCell>
                    <TableCell>{section.instructor.name}</TableCell>
                    <TableCell>
                      {(dayMap[section.dayOfWeek] ?? section.dayOfWeek)} · {section.timeSlot.label}
                    </TableCell>
                    <TableCell className="text-center">
                      {showWaitingAction ? (
                        <Button
                          type="button"
                          onClick={openDialog}
                          disabled={!waitingEnabled || inQueue}
                          className="bg-[#ef4444] text-white hover:bg-[#dc2626]"
                        >
                          {inQueue ? "Đang chờ" : "Waiting Room"}
                        </Button>
                      ) : (
                        <Badge className="bg-[#22c55e] text-white">Còn chỗ</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Alert className="border-[#22c55e]/30 bg-[#22c55e]/10 text-[#1f2937]">
          <AlertTitle className="text-[#005f69]">Đăng ký thành công</AlertTitle>
          <AlertDescription>Lớp phòng chờ mở thành công, hệ thống sẽ gửi thông báo xác nhận đến bạn.</AlertDescription>
        </Alert>
        <Alert className="border-[#ef4444]/40 bg-[#ef4444]/10 text-[#1f2937]">
          <AlertTitle className="text-[#005f69]">Đăng ký không thành công</AlertTitle>
          <AlertDescription>Không thể mở lớp, hệ thống giữ thứ tự ưu tiên FIFO để xét lớp thay thế.</AlertDescription>
        </Alert>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="overflow-hidden rounded-lg border-0 p-0 sm:max-w-xl">
          <DialogHeader className="bg-[#005f69] px-6 py-4">
            <DialogTitle className="text-white">Phòng chờ đăng ký học phần</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 px-6 py-5">
            <div className="space-y-1">
              <Label>Ưu tiên 1</Label>
              <Select value={priority1} onValueChange={setPriority1}>
                <SelectTrigger>
                  <SelectValue placeholder="Chọn lớp ưu tiên 1" />
                </SelectTrigger>
                <SelectContent>
                  {waitingChoices.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.code} · {(dayMap[item.dayOfWeek] ?? item.dayOfWeek)} · {item.timeSlot.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Ưu tiên 2</Label>
              <Select value={priority2} onValueChange={setPriority2}>
                <SelectTrigger>
                  <SelectValue placeholder="Chọn lớp ưu tiên 2 (không bắt buộc)" />
                </SelectTrigger>
                <SelectContent>
                  {waitingChoices
                    .filter((item) => item.id !== priority1)
                    .map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.code} · {(dayMap[item.dayOfWeek] ?? item.dayOfWeek)} · {item.timeSlot.label}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} />
              <span>Tôi cam kết tham gia lớp mở từ phòng chờ nếu được phê duyệt.</span>
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Đóng
              </Button>
              <Button className="bg-[#005f69] text-white hover:bg-[#004b54]" disabled={submitting} onClick={() => void joinWaiting()}>
                Tham gia phòng chờ
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
