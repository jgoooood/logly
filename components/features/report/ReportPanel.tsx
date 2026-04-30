"use client";

import { useState } from "react";

type ReportOutput = {
  summary: string;
  highlights: string[];
  keywords: string[];
};

type WeeklyReport =
  | { empty: true; periodStart: string; periodEnd: string }
  | {
      empty: false;
      periodStart: string;
      periodEnd: string;
      logCount: number;
      output: ReportOutput;
    };

export function ReportPanel() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<WeeklyReport | null>(null);

  async function handleGenerate() {
    if (loading) return;
    setLoading(true);
    setError(null);
    setReport(null);

    try {
      const res = await fetch("/api/reports/weekly", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `요청 실패 (${res.status})`);
      }
      const data = (await res.json()) as WeeklyReport;
      setReport(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "알 수 없는 오류");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <button
        type="button"
        onClick={handleGenerate}
        disabled={loading}
        className="self-start rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white shadow hover:bg-brand-dark disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        {loading ? "생성 중..." : report ? "다시 생성하기" : "이번 주 리포트 생성"}
      </button>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {report && report.empty && <EmptyReport />}
      {report && !report.empty && <ReportView report={report} />}
    </div>
  );
}

function EmptyReport() {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
      <h3 className="text-base font-semibold text-slate-900">
        최근 7일 동안 작성한 로그가 없습니다.
      </h3>
      <p className="mt-2 text-sm text-slate-600">
        홈에서 한 줄 업무 기록을 작성하면 다음 주에 리포트로 요약됩니다.
      </p>
    </div>
  );
}

function ReportView({
  report,
}: {
  report: {
    periodStart: string;
    periodEnd: string;
    logCount: number;
    output: ReportOutput;
  };
}) {
  const start = report.periodStart.slice(0, 10);
  const end = report.periodEnd.slice(0, 10);

  return (
    <div className="flex flex-col gap-5">
      <div className="text-sm text-slate-500">
        {start} ~ {end} · 로그 {report.logCount}건
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-emerald-700">요약</h3>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
          {report.output.summary}
        </p>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-indigo-700">주요 성과</h3>
        {report.output.highlights.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">기록된 성과가 없습니다.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {report.output.highlights.map((h, i) => (
              <li key={i} className="text-sm leading-relaxed text-slate-800">
                · {h}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-amber-700">키워드</h3>
        {report.output.keywords.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">키워드가 없습니다.</p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            {report.output.keywords.map((k, i) => (
              <span
                key={i}
                className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700"
              >
                #{k}
              </span>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
