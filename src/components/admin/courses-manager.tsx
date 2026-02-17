"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Course = {
  id: string;
  code: string;
  name: string;
  faculty: string;
  credits: number;
  planType: "IN_PLAN" | "OUT_PLAN";
  isActive: boolean;
  _count?: {
    sections: number;
  };
};

type CourseForm = {
  code: string;
  name: string;
  faculty: string;
  credits: number;
  planType: "IN_PLAN" | "OUT_PLAN";
  isActive: boolean;
};

const defaultForm: CourseForm = {
  code: "",
  name: "",
  faculty: "Kinh doanh",
  credits: 3,
  planType: "IN_PLAN",
  isActive: true,
};

export const CoursesManager = () => {
  const [courses, setCourses] = useState<Course[]>([]);
  const [form, setForm] = useState(defaultForm);

  const load = async () => {
    const response = await fetch("/api/admin/courses");
    const payload = await response.json();
    if (payload.success) {
      setCourses(payload.data);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const createCourse = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const response = await fetch("/api/admin/courses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const payload = await response.json();
    if (!response.ok || !payload.success) {
      toast.error(payload.error?.message ?? "Không thể tạo học phần");
      return;
    }

    toast.success("Tạo học phần thành công");
    setForm(defaultForm);
    await load();
  };

  const deleteCourse = async (id: string) => {
    const response = await fetch(`/api/admin/courses/${id}`, { method: "DELETE" });
    const payload = await response.json();
    if (!response.ok || !payload.success) {
      toast.error(payload.error?.message ?? "Không thể xóa học phần");
      return;
    }
    toast.success("Đã xóa học phần");
    await load();
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[400px_1fr]">
      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Tạo học phần mới</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-3" onSubmit={createCourse}>
            <div className="space-y-2">
              <Label>Mã học phần</Label>
              <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label>Tên học phần</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label>Ngành / Chương trình đào tạo</Label>
              <Input
                value={form.faculty}
                onChange={(e) => setForm({ ...form, faculty: e.target.value })}
                placeholder="Ví dụ: Kinh doanh, Tài chính, CNTT..."
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Số tín chỉ</Label>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={form.credits}
                  onChange={(e) => setForm({ ...form, credits: Number(e.target.value) })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Nhóm đăng ký</Label>
                <Select value={form.planType} onValueChange={(value) => setForm({ ...form, planType: value as "IN_PLAN" | "OUT_PLAN" })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="IN_PLAN">Trong kế hoạch</SelectItem>
                    <SelectItem value="OUT_PLAN">Ngoài kế hoạch</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button className="primary-glow w-full" type="submit">
              Lưu học phần
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Danh sách học phần</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mã</TableHead>
                <TableHead>Tên học phần</TableHead>
                <TableHead>Ngành/CTĐT</TableHead>
                <TableHead>Tín chỉ</TableHead>
                <TableHead>Nhóm</TableHead>
                <TableHead>LHP</TableHead>
                <TableHead className="text-right">Tác vụ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {courses.map((course) => (
                <TableRow key={course.id}>
                  <TableCell>{course.code}</TableCell>
                  <TableCell>{course.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{course.faculty}</Badge>
                  </TableCell>
                  <TableCell>{course.credits}</TableCell>
                  <TableCell>
                    <Badge variant={course.planType === "IN_PLAN" ? "default" : "secondary"}>
                      {course.planType === "IN_PLAN" ? "Trong kế hoạch" : "Ngoài kế hoạch"}
                    </Badge>
                  </TableCell>
                  <TableCell>{course._count?.sections ?? 0}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" onClick={() => void deleteCourse(course.id)}>
                      Xóa
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};
