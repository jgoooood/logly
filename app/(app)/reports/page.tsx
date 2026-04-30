import Link from "next/link";
import { ReportPanel } from "@/components/features/report/ReportPanel";

export const dynamic = "force-dynamic";

export default function ReportsPage() {
  return (
    <main className="min-h-screen px-6 py-12">
      <div className="mx-auto max-w-3xl">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">주간 리포트</h1>
            <p className="mt-1 text-sm text-slate-600">
              최근 7일 로그를 AI가 한 주의 회고로 요약합니다.
            </p>
          </div>
          <Link
            href="/logs"
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
          >
            로그 목록
          </Link>
        </header>
        <div className="mt-8">
          <ReportPanel />
        </div>
      </div>
    </main>
  );
}
