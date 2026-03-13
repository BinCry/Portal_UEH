"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type StudentLocationRow = {
  id: string;
  fullName: string | null;
  studentCode: string | null;
  email: string;
  faculty: string | null;
  latitude: number | null;
  longitude: number | null;
  accuracyMeters: number | null;
  updatedAt: string | null;
};

const formatCoordinate = (value: number | null) => (value === null ? "--" : value.toFixed(6));
const formatAccuracy = (value: number | null) => (value === null ? "--" : `${value.toFixed(1)} m`);
const buildMapUrl = (latitude: number, longitude: number) => `https://www.google.com/maps?q=${latitude},${longitude}`;

export const StudentLocationsManager = () => {
  const [rows, setRows] = useState<StudentLocationRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch("/api/admin/student-locations");
        const payload = await response.json();

        if (response.ok && payload.success) {
          setRows(payload.data);
        } else {
          setRows([]);
        }
      } catch {
        setRows([]);
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  return (
    <Card className="glass-card border-cyan-200/80">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Vị trí sinh viên</CardTitle>
        <Badge variant="outline">{rows.length} sinh viên</Badge>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Đang tải vị trí sinh viên...
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sinh viên</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Khoa</TableHead>
                <TableHead>Latitude</TableHead>
                <TableHead>Longitude</TableHead>
                <TableHead>Accuracy</TableHead>
                <TableHead>Cập nhật lúc</TableHead>
                <TableHead className="text-right">Bản đồ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const hasLocation = row.latitude !== null && row.longitude !== null;

                return (
                  <TableRow key={row.id}>
                    <TableCell>
                      <p className="font-medium">{row.fullName ?? "Chưa có tên"}</p>
                      <p className="text-xs text-muted-foreground">{row.studentCode ?? "Chưa có MSSV"}</p>
                    </TableCell>
                    <TableCell>{row.email}</TableCell>
                    <TableCell>{row.faculty ?? "--"}</TableCell>
                    <TableCell className="font-mono text-xs">{formatCoordinate(row.latitude)}</TableCell>
                    <TableCell className="font-mono text-xs">{formatCoordinate(row.longitude)}</TableCell>
                    <TableCell>{formatAccuracy(row.accuracyMeters)}</TableCell>
                    <TableCell>{row.updatedAt ? new Date(row.updatedAt).toLocaleString("vi-VN") : "--"}</TableCell>
                    <TableCell className="text-right">
                      {hasLocation ? (
                        <Button variant="outline" size="sm" asChild>
                          <a
                            href={buildMapUrl(row.latitude as number, row.longitude as number)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <ExternalLink className="h-4 w-4" />
                            Mở bản đồ
                          </a>
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">Chưa có tọa độ</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};
