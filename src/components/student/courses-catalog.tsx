"use client";

import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type CourseItem = {
  id: string;
  code: string;
  name: string;
  faculty: string;
  credits: number;
  planType: "IN_PLAN" | "OUT_PLAN";
  waitingRoom: {
    isActive: boolean;
  } | null;
  _count: {
    sections: number;
  };
};

const CourseTable = ({ courses }: { courses: CourseItem[] }) => {
  if (!courses.length) {
    return <p className="text-muted-foreground text-sm">Chưa có học phần khả dụng.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Mã HP</TableHead>
          <TableHead>Tên học phần</TableHead>
          <TableHead>Ngành</TableHead>
          <TableHead>Tín chỉ</TableHead>
          <TableHead>Số LHP</TableHead>
          <TableHead>Phòng chờ</TableHead>
          <TableHead className="text-right">Đăng ký</TableHead>
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
            <TableCell>{course._count.sections}</TableCell>
            <TableCell>
              <Badge variant={course.waitingRoom?.isActive ? "default" : "secondary"}>
                {course.waitingRoom?.isActive ? "Đang mở" : "Chưa mở"}
              </Badge>
            </TableCell>
            <TableCell className="text-right">
              <Button className="primary-glow" asChild>
                <Link href={`/student/courses/${course.id}/sections`}>Chọn lớp học phần</Link>
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};

export const CoursesCatalog = ({
  courses,
  studentFaculty,
}: {
  courses: CourseItem[];
  studentFaculty: string | null;
}) => {
  const inPlanCourses = courses.filter((course) => course.planType === "IN_PLAN");
  const outPlanCourses = courses.filter((course) => course.planType === "OUT_PLAN");

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle>Danh sách học phần mở đăng ký</CardTitle>
        <p className="text-muted-foreground text-sm">
          {studentFaculty
            ? `Ngành hiện tại: ${studentFaculty}. Chỉ hiển thị học phần đúng chương trình đào tạo ngành của bạn.`
            : "Bạn chưa được gán ngành/chương trình đào tạo. Vui lòng liên hệ Phòng đào tạo."}
        </p>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="in-plan" className="space-y-4">
          <TabsList className="bg-muted/60">
            <TabsTrigger value="in-plan">Trong kế hoạch ({inPlanCourses.length})</TabsTrigger>
            <TabsTrigger value="out-plan">Ngoài kế hoạch ({outPlanCourses.length})</TabsTrigger>
            <TabsTrigger value="all">Tất cả ({courses.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="in-plan">
            <CourseTable courses={inPlanCourses} />
          </TabsContent>
          <TabsContent value="out-plan">
            <CourseTable courses={outPlanCourses} />
          </TabsContent>
          <TabsContent value="all">
            <CourseTable courses={courses} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};
