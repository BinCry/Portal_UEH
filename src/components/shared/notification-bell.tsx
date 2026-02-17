"use client";

import { useEffect, useMemo, useState } from "react";
import { Bell, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type NotificationItem = {
  id: string;
  type: "WAITING_OFFER" | "WAITING_REJECTED" | "WAITING_EXPIRED" | "SYSTEM";
  payloadJson: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
};

const typeLabel: Record<NotificationItem["type"], string> = {
  WAITING_OFFER: "Đề xuất từ phòng chờ",
  WAITING_REJECTED: "Phòng chờ bị từ chối",
  WAITING_EXPIRED: "Offer hết hạn",
  SYSTEM: "Hệ thống",
};

const typeTone: Record<NotificationItem["type"], string> = {
  WAITING_OFFER: "bg-emerald-50 border-emerald-200",
  WAITING_REJECTED: "bg-rose-50 border-rose-200",
  WAITING_EXPIRED: "bg-amber-50 border-amber-200",
  SYSTEM: "bg-sky-50 border-sky-200",
};

const extractText = (item: NotificationItem) => {
  const title = typeof item.payloadJson.title === "string" ? item.payloadJson.title : typeLabel[item.type];
  const messageCandidate = item.payloadJson.message ?? item.payloadJson.reason;
  const message =
    typeof messageCandidate === "string"
      ? messageCandidate
      : "Bạn có một cập nhật mới. Vui lòng mở trang liên quan để xem chi tiết.";
  return { title, message };
};

export const NotificationBell = () => {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = async () => {
    const response = await fetch("/api/notifications/me");
    const payload = await response.json();
    if (payload.success) {
      setItems(payload.data);
    }
  };

  useEffect(() => {
    void load();
    const id = window.setInterval(() => {
      if (!document.hidden) {
        void load();
      }
    }, 60_000);
    return () => window.clearInterval(id);
  }, []);

  const unreadCount = useMemo(() => items.filter((item) => !item.readAt).length, [items]);

  const markRead = async () => {
    const previous = items;
    const readAt = new Date().toISOString();
    setItems((current) => current.map((item) => (item.readAt ? item : { ...item, readAt })));

    const response = await fetch("/api/notifications/read", {
      method: "POST",
    });
    const payload = await response.json();
    if (!response.ok || !payload.success) {
      setItems(previous);
      toast.error(payload.error?.message ?? "Không thể đánh dấu đã đọc");
      return;
    }
    toast.success("Đã đánh dấu toàn bộ thông báo đã đọc");
  };

  const clearRead = async () => {
    const previous = items;
    setItems((current) => current.filter((item) => !item.readAt));

    const response = await fetch("/api/notifications/read", {
      method: "DELETE",
    });
    const payload = await response.json();
    if (!response.ok || !payload.success) {
      setItems(previous);
      toast.error(payload.error?.message ?? "Không thể xóa thông báo đã đọc");
      return;
    }

    toast.success(`Đã xóa ${payload.data.deletedCount} thông báo đã đọc`);
  };

  const deleteOne = async (notificationId: string) => {
    const previous = items;
    setItems((current) => current.filter((item) => item.id !== notificationId));
    setDeletingId(notificationId);

    const response = await fetch(`/api/notifications/${notificationId}`, {
      method: "DELETE",
    });
    const payload = await response.json();
    setDeletingId(null);

    if (!response.ok || !payload.success) {
      setItems(previous);
      toast.error(payload.error?.message ?? "Không thể xóa thông báo");
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" className="relative">
          <Bell className="size-4" />
          {unreadCount > 0 ? (
            <span className="bg-primary text-primary-foreground absolute -top-1 -right-1 rounded-full px-1.5 text-[10px] font-semibold">
              {unreadCount}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[360px]">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Thông báo</span>
          <div className="flex items-center gap-3">
            <button className="text-primary text-xs hover:underline" type="button" onClick={() => void markRead()}>
              Đánh dấu đã đọc
            </button>
            <button className="text-destructive text-xs hover:underline" type="button" onClick={() => void clearRead()}>
              Xóa đã đọc
            </button>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.length === 0 ? (
          <DropdownMenuItem disabled>Chưa có thông báo</DropdownMenuItem>
        ) : (
          items.slice(0, 12).map((item) => {
            const { title, message } = extractText(item);
            return (
              <DropdownMenuItem key={item.id} className="block cursor-default whitespace-normal p-0">
                <div className={cn("w-full rounded-lg border p-2.5", typeTone[item.type])}>
                  <div className="mb-1 flex items-start justify-between gap-2">
                    <p className="text-[12px] font-semibold leading-tight">{title}</p>
                    {!item.readAt ? (
                      <span className="mt-1 size-2 shrink-0 rounded-full bg-blue-500" />
                    ) : (
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-foreground inline-flex size-5 items-center justify-center"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          void deleteOne(item.id);
                        }}
                        disabled={deletingId === item.id}
                        aria-label="Xóa thông báo"
                      >
                        <X className="size-3.5" />
                      </button>
                    )}
                  </div>
                  <p className="text-muted-foreground text-[12px] leading-relaxed">{message}</p>
                  <p className="text-muted-foreground mt-1 text-[11px]">
                    {new Date(item.createdAt).toLocaleString("vi-VN")}
                  </p>
                </div>
              </DropdownMenuItem>
            );
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
