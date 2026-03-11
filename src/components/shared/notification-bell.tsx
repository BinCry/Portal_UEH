"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Bell, CalendarCheck, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { displayText } from "@/lib/text";
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
  WAITING_OFFER: "border-emerald-200 bg-emerald-50",
  WAITING_REJECTED: "border-rose-200 bg-rose-50",
  WAITING_EXPIRED: "border-amber-200 bg-amber-50",
  SYSTEM: "border-sky-200 bg-sky-50",
};

const getString = (value: unknown) => (typeof value === "string" ? value : undefined);

const extractText = (item: NotificationItem) => {
  const title = displayText(getString(item.payloadJson.title)) ?? typeLabel[item.type];
  const messageCandidate = item.payloadJson.message ?? item.payloadJson.reason;
  const message =
    displayText(getString(messageCandidate)) ??
    "Bạn có một cập nhật mới. Vui lòng mở trang liên quan để xem chi tiết.";

  return {
    title,
    message,
    courseName: displayText(getString(item.payloadJson.courseName)),
    schedule: displayText(getString(item.payloadJson.schedule)),
    waitingEntryId: getString(item.payloadJson.waitingEntryId),
  };
};

const parsePayload = async (response: Response) => {
  try {
    return (await response.json()) as {
      success?: boolean;
      data?: unknown;
      error?: { message?: string };
    };
  } catch {
    return null;
  }
};

export const NotificationBell = () => {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedOffer, setSelectedOffer] = useState<NotificationItem | null>(null);
  const [isProcessingOffer, setIsProcessingOffer] = useState(false);

  const load = async () => {
    try {
      const response = await fetch("/api/notifications/me");
      const payload = await parsePayload(response);
      if (payload?.success && Array.isArray(payload.data)) {
        setItems(payload.data as NotificationItem[]);
      }
    } catch {
      return;
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
  const selectedOfferMeta = useMemo(
    () => (selectedOffer ? extractText(selectedOffer) : null),
    [selectedOffer],
  );
  const selectedOfferActionable = Boolean(selectedOfferMeta?.waitingEntryId);

  const markRead = async () => {
    const previous = items;
    const readAt = new Date().toISOString();
    setItems((current) => current.map((item) => (item.readAt ? item : { ...item, readAt })));

    try {
      const response = await fetch("/api/notifications/read", { method: "POST" });
      const payload = await parsePayload(response);
      if (!response.ok || !payload?.success) {
        setItems(previous);
        toast.error(payload?.error?.message ?? "Không thể đánh dấu đã đọc");
      }
    } catch {
      setItems(previous);
      toast.error("Không thể kết nối tới máy chủ");
    }
  };

  const clearRead = async () => {
    const previous = items;
    setItems((current) => current.filter((item) => !item.readAt));

    try {
      const response = await fetch("/api/notifications/read", { method: "DELETE" });
      const payload = await parsePayload(response);
      if (!response.ok || !payload?.success) {
        setItems(previous);
        toast.error(payload?.error?.message ?? "Không thể xóa thông báo đã đọc");
      }
    } catch {
      setItems(previous);
      toast.error("Không thể kết nối tới máy chủ");
    }
  };

  const deleteOne = async (id: string) => {
    const previous = items;
    setItems((current) => current.filter((item) => item.id !== id));
    setDeletingId(id);

    try {
      const response = await fetch(`/api/notifications/${id}`, { method: "DELETE" });
      const payload = await parsePayload(response);
      if (!response.ok || !payload?.success) {
        setItems(previous);
        toast.error(payload?.error?.message ?? "Không thể xóa thông báo");
      }
    } catch {
      setItems(previous);
      toast.error("Không thể kết nối tới máy chủ");
    } finally {
      setDeletingId(null);
    }
  };

  const handleOfferAction = async (action: "confirm" | "decline") => {
    if (!selectedOfferMeta?.waitingEntryId) {
      toast.error("Thông báo này đã hết hiệu lực thao tác");
      return;
    }

    setIsProcessingOffer(true);
    try {
      const response = await fetch(`/api/waiting/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ waitingEntryId: selectedOfferMeta.waitingEntryId }),
      });
      const payload = await parsePayload(response);

      if (!response.ok || !payload?.success) {
        toast.error(payload?.error?.message ?? "Thao tác thất bại");
        return;
      }

      toast.success(action === "confirm" ? "Đã xác nhận lớp" : "Đã hủy lớp");
      setSelectedOffer(null);
      await load();
    } catch {
      toast.error("Không thể kết nối tới máy chủ");
    } finally {
      setIsProcessingOffer(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" className="relative bg-white hover:bg-gray-100">
            <Bell className="size-5 text-gray-700" />
            {unreadCount > 0 ? (
              <span className="absolute -top-1.5 -right-1.5 flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 border-white bg-red-600 text-[10px] font-bold text-white">
                {unreadCount}
              </span>
            ) : null}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[360px] bg-white p-2">
          <DropdownMenuLabel className="flex items-center justify-between pb-2">
            <span className="text-sm font-bold text-gray-800">Thông báo</span>
            <div className="flex gap-3 text-xs">
              <button
                className="text-blue-600 hover:underline"
                type="button"
                onClick={() => void markRead()}
              >
                Đánh dấu đã đọc
              </button>
              <button
                className="text-red-600 hover:underline"
                type="button"
                onClick={() => void clearRead()}
              >
                Xóa đã đọc
              </button>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <div className="max-h-[400px] overflow-y-auto">
            {items.length === 0 ? (
              <div className="p-4 text-center text-sm text-gray-500">Chưa có thông báo</div>
            ) : (
              items.slice(0, 12).map((item) => {
                const { title, message, waitingEntryId } = extractText(item);
                const isOffer = item.type === "WAITING_OFFER" || item.type === "WAITING_REJECTED";
                return (
                  <DropdownMenuItem
                    key={item.id}
                    className="block cursor-pointer p-1"
                    onSelect={() => {
                      if (isOffer) {
                        setSelectedOffer(item);
                      }
                    }}
                  >
                    <div
                      className={cn(
                        "w-full rounded-md border p-3 hover:shadow-sm",
                        typeTone[item.type],
                      )}
                    >
                      <div className="mb-1 flex justify-between gap-2">
                        <p className="text-[13px] font-bold text-[#0f3b46]">{title}</p>
                        {!item.readAt ? (
                          <span className="mt-1 size-2 rounded-full bg-red-500" />
                        ) : (
                          <button
                            className="text-gray-400 hover:text-red-500 disabled:opacity-60"
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              void deleteOne(item.id);
                            }}
                            disabled={deletingId === item.id}
                          >
                            <X className="size-4" />
                          </button>
                        )}
                      </div>
                      <p className="text-xs leading-relaxed text-gray-600">{message}</p>
                      {isOffer ? (
                        <p className="mt-2 text-[11px] font-medium text-blue-600 underline">
                          {waitingEntryId ? "Nhấn để xem và xác nhận" : "Nhấn để xem chi tiết"}
                        </p>
                      ) : null}
                      <p className="mt-2 text-[10px] text-gray-400">
                        {new Date(item.createdAt).toLocaleString("vi-VN")}
                      </p>
                    </div>
                  </DropdownMenuItem>
                );
              })
            )}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={Boolean(selectedOffer)}
        onOpenChange={(open) => !open && setSelectedOffer(null)}
      >
        <DialogContent className="bg-white sm:max-w-[450px]">
          <DialogHeader className="flex flex-col items-center border-b pb-4">
            {selectedOffer?.type === "WAITING_OFFER" ? (
              <CalendarCheck className="mb-2 size-12 text-emerald-500" />
            ) : (
              <AlertTriangle className="mb-2 size-12 text-amber-500" />
            )}
            <DialogTitle className="text-center text-lg font-bold text-[#0f3b46] uppercase">
              {selectedOffer?.type === "WAITING_OFFER"
                ? "THÔNG BÁO XẾP LỚP VÀ HỦY"
                : "THÔNG BÁO ĐĂNG KÝ KHÔNG THÀNH CÔNG"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-4 text-center text-sm">
            {selectedOffer?.type === "WAITING_OFFER" ? (
              <>
                <p className="text-gray-700">Bạn đã được xếp vào lớp:</p>
                <div className="rounded-md border border-gray-200 bg-slate-100 p-3 font-bold text-black">
                  <p>{selectedOfferMeta?.courseName || "Đang cập nhật môn học"}</p>
                  <p className="mt-1 text-xs font-normal text-gray-500">
                    Lịch học: {selectedOfferMeta?.schedule || "Đang cập nhật"}
                  </p>
                </div>
                <div className="mt-4 flex items-start justify-center gap-1 text-xs font-medium text-red-600">
                  <AlertTriangle className="size-4 shrink-0" />
                  <p>Có 24 giờ để xác nhận. Hủy sẽ bị hạn chế quyền ưu tiên sau này.</p>
                </div>
              </>
            ) : (
              <>
                <p className="text-gray-700">Rất tiếc, lớp học phần bạn đăng ký đã hết chỗ.</p>
                <p className="mt-2 text-gray-700">Hệ thống đề xuất chuyển sang lớp khác:</p>
                <div className="rounded-md border border-gray-200 bg-slate-100 p-3 font-bold text-black">
                  <p>{selectedOfferMeta?.courseName || "Lớp đề xuất mới"}</p>
                  <p className="mt-1 text-xs font-normal text-gray-500">
                    Lịch học: {selectedOfferMeta?.schedule || "Đang cập nhật"}
                  </p>
                </div>
                <div className="mt-4 flex items-start justify-center gap-1 text-xs font-medium text-red-600">
                  <AlertTriangle className="size-4 shrink-0" />
                  <p>Có 3 ngày để xác nhận. Không xác nhận sẽ mất quyền ưu tiên.</p>
                </div>
              </>
            )}
          </div>
          <div className="flex justify-center gap-3 border-t pt-4">
            {selectedOfferActionable ? (
              <>
                <Button
                  className="flex-1 bg-blue-600 text-white hover:bg-blue-700"
                  onClick={() => void handleOfferAction("confirm")}
                  disabled={isProcessingOffer}
                >
                  {isProcessingOffer ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                  {selectedOffer?.type === "WAITING_OFFER" ? "CHẤP NHẬN" : "CHẤP NHẬN LỚP MỚI"}
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1 bg-red-600 text-white hover:bg-red-700"
                  onClick={() => void handleOfferAction("decline")}
                  disabled={isProcessingOffer}
                >
                  HỦY HỌC PHẦN
                </Button>
              </>
            ) : (
              <Button variant="outline" className="w-full" onClick={() => setSelectedOffer(null)}>
                Đóng
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
