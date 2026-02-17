"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type User = {
  id: string;
  email: string;
  role: string;
  status: string;
  studentProfile: {
    fullName: string;
    studentCode: string;
  } | null;
};

const initialForm = {
  email: "",
  fullName: "",
  studentCode: "",
  faculty: "",
  defaultPassword: "",
};

export const UsersManager = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [form, setForm] = useState(initialForm);

  const load = async () => {
    const response = await fetch("/api/admin/users");
    const payload = await response.json();
    if (payload.success) setUsers(payload.data);
  };

  useEffect(() => {
    void load();
  }, []);

  const createStudent = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const response = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const payload = await response.json();
    if (!response.ok || !payload.success) {
      toast.error(payload.error?.message ?? "Không thể tạo tài khoản");
      return;
    }
    toast.success("Đã tạo tài khoản sinh viên");
    setForm(initialForm);
    await load();
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Tạo tài khoản sinh viên</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-3" onSubmit={createStudent}>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Họ tên</Label>
              <Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label>MSSV</Label>
              <Input
                value={form.studentCode}
                onChange={(e) => setForm({ ...form, studentCode: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Khoa</Label>
              <Input value={form.faculty} onChange={(e) => setForm({ ...form, faculty: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Mật khẩu mặc định</Label>
              <Input
                type="password"
                placeholder="Temporary password"
                value={form.defaultPassword}
                onChange={(e) => setForm({ ...form, defaultPassword: e.target.value })}
                required
              />
            </div>
            <Button className="primary-glow w-full" type="submit">
              Tạo user
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Danh sách người dùng</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Vai trò</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead>Thông tin</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>
                    <Badge>{user.role}</Badge>
                  </TableCell>
                  <TableCell>{user.status}</TableCell>
                  <TableCell>
                    {user.studentProfile
                      ? `${user.studentProfile.fullName} (${user.studentProfile.studentCode})`
                      : "Admin"}
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
