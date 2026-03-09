import { PageTransition } from "@/components/shared/page-transition";
import { WaitingHistory } from "@/components/student/waiting-history";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth";

export default async function StudentWaitingPage() {
  await requireRole("STUDENT");

  return (
    <PageTransition>
      <Card className="glass-card border-cyan-200/80">
        <CardHeader>
          <CardTitle>Lịch sử đăng ký học phần</CardTitle>
        </CardHeader>
        <CardContent>
          <WaitingHistory />
        </CardContent>
      </Card>
    </PageTransition>
  );
}
