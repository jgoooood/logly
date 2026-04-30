import Link from "next/link";
import { logService } from "@/lib/services/log.service";
import { LogListView } from "@/components/features/log/LogListView";
import { ErrorState } from "@/components/ui/ErrorState";

export const dynamic = "force-dynamic";

export default async function LogsPage() {
  return (
    <main className="min-h-screen px-6 py-12">
      <div className="mx-auto max-w-3xl">
        <PageHeader />
        <div className="mt-8">
          <LogList />
        </div>
      </div>
    </main>
  );
}

async function LogList() {
  try {
    const logs = await logService.listForCurrentUser({ limit: 50 });
    return <LogListView logs={logs} />;
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "로그를 불러올 수 없습니다.";
    return <ErrorState message={message} />;
  }
}

function PageHeader() {
  return (
    <header className="flex items-center justify-between">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">내 로그</h1>
        <p className="mt-1 text-sm text-slate-600">
          지금까지 기록한 업무와 변환 결과
        </p>
      </div>
      <Link
        href="/"
        className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white shadow hover:bg-brand-dark"
      >
        새 로그 작성
      </Link>
    </header>
  );
}
