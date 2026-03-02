"use client";

import { useState } from "react";
import Link from "next/link";
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

export const CoursesCatalog = ({
  courses,
  studentFaculty,
}: {
  courses: CourseItem[];
  studentFaculty: string | null;
}) => {
  const [filter, setFilter] = useState<"IN_PLAN" | "OUT_PLAN">(() =>
    courses.some((course) => course.planType === "IN_PLAN") ? "IN_PLAN" : "OUT_PLAN",
  );

  const filteredCourses = courses.filter((course) => course.planType === filter);

  return (
    <div className="min-h-[500px] space-y-4 bg-white font-sans text-gray-800">
      <div className="mb-4 space-y-1 border-b pb-3">
        <h2 className="text-lg font-bold text-[#0f3b46]">Đăng ký học phần HKI, 2026</h2>
        <p className="text-sm">
          Chương trình đào tạo: 1. {studentFaculty || "Quản trị"} - Khóa 32 Đợt 1 (Hướng ứng dụng)
        </p>
      </div>

      <div className="mb-4 flex items-center gap-6 text-sm font-medium">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="radio"
            name="planFilter"
            className="h-4 w-4 cursor-pointer accent-[#0f3b46]"
            checked={filter === "IN_PLAN"}
            onChange={() => setFilter("IN_PLAN")}
          />
          Đúng kế hoạch
        </label>
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="radio"
            name="planFilter"
            className="h-4 w-4 cursor-pointer accent-[#0f3b46]"
            checked={filter === "OUT_PLAN"}
            onChange={() => setFilter("OUT_PLAN")}
          />
          Ngoài kế hoạch
        </label>
      </div>

      <div className="mb-2 text-center font-bold text-gray-700 uppercase">
        -{filter === "IN_PLAN" ? "Đúng kế hoạch" : "Ngoài kế hoạch"}-
      </div>
      <p className="mb-2 text-sm italic text-gray-600">* Ghi chú: đăng ký môn trong năm học - học kỳ</p>

      <div className="overflow-hidden rounded-sm border border-gray-300 bg-white">
        <Table>
          <TableHeader className="bg-gray-100/80">
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-10 w-[50px] border-r border-gray-200 text-center font-semibold text-black">
                STT
              </TableHead>
              <TableHead className="h-10 border-r border-gray-200 font-semibold text-black">Mã học phần</TableHead>
              <TableHead className="h-10 border-r border-gray-200 font-semibold text-black">Tên học phần</TableHead>
              <TableHead className="h-10 border-r border-gray-200 text-center font-semibold text-black">STC</TableHead>
              <TableHead className="h-10 border-r border-gray-200 text-center font-semibold text-black">
                Số lượng LHP
              </TableHead>
              <TableHead className="h-10 border-r border-gray-200 text-center font-semibold text-black">Bắt buộc</TableHead>
              <TableHead className="h-10 text-center font-semibold text-black" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredCourses.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-6 text-center text-muted-foreground">
                  Không có học phần nào trong danh sách này.
                </TableCell>
              </TableRow>
            ) : (
              filteredCourses.map((course, index) => (
                <TableRow key={course.id} className="border-b border-gray-200 hover:bg-slate-50">
                  <TableCell className="border-r border-gray-200 text-center">{index + 1}</TableCell>
                  <TableCell className="border-r border-gray-200 font-medium">{course.code}</TableCell>
                  <TableCell className="border-r border-gray-200">{course.name}</TableCell>
                  <TableCell className="border-r border-gray-200 text-center">{course.credits.toFixed(1)}</TableCell>
                  <TableCell className="border-r border-gray-200 text-center">{course._count.sections}</TableCell>
                  <TableCell className="border-r border-gray-200 text-center">
                    <input type="checkbox" checked readOnly className="h-3.5 w-3.5 cursor-default accent-gray-500" />
                  </TableCell>
                  <TableCell className="text-center">
                    <Link
                      href={`/student/courses/${course.id}/sections`}
                      className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      [Đăng ký]
                    </Link>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};
