import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-semibold">Không tìm thấy trang</h1>
      <Button className="primary-glow" asChild>
        <Link href="/">Về dashboard</Link>
      </Button>
    </div>
  );
}
