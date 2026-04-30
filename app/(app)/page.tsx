import Link from "next/link";
import LogInput from "@/components/LogInput";

export default function Home() {
  return (
    <main className="min-h-screen px-6 py-16">
      <div className="mx-auto max-w-3xl">
        <header className="mb-12 text-center">
          <h1 className="text-4xl font-bold tracking-tight text-slate-900">
            Logly
          </h1>
          <p className="mt-3 text-slate-600">
            한 줄의 업무 기록을 성과 · 이력서 · 면접 답변으로 변환합니다.
          </p>
          <div className="mt-4 flex items-center justify-center gap-5 text-sm font-semibold text-brand">
            <Link href="/logs" className="hover:underline">
              내 로그 보기 →
            </Link>
            <Link href="/reports" className="hover:underline">
              주간 리포트 →
            </Link>
          </div>
        </header>
        <LogInput />
      </div>
    </main>
  );
}
