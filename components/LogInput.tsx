"use client";

import { useState } from "react";
import ResultCard from "./ResultCard";

type TransformResult = {
  achievement: string;
  resume: string;
  interview: string;
};

export default function LogInput() {
  const [log, setLog] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TransformResult | null>(null);

  async function handleTransform() {
    if (!log.trim() || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/transform", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ log }),
      });

      if (!res.ok) {
        const { error: msg } = await res.json().catch(() => ({ error: "" }));
        throw new Error(msg || `요청 실패 (${res.status})`);
      }

      const data = (await res.json()) as TransformResult;
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "알 수 없는 오류");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-2xl mx-auto flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <label htmlFor="log" className="text-sm font-medium text-slate-700">
          오늘 한 일을 한 줄로 적어보세요
        </label>
        <textarea
          id="log"
          value={log}
          onChange={(e) => setLog(e.target.value)}
          placeholder="예) API 응답 캐싱 도입해서 평균 응답 시간 800ms → 200ms로 줄임"
          rows={3}
          className="w-full rounded-xl border border-slate-300 bg-white p-4 text-base shadow-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30 resize-none"
        />
        <button
          onClick={handleTransform}
          disabled={loading || !log.trim()}
          className="self-end rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-brand-dark disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {loading ? "변환 중..." : "AI 변환하기"}
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {result && (
        <div className="grid gap-4 md:grid-cols-1">
          <ResultCard
            title="성과 요약"
            tone="emerald"
            content={result.achievement}
          />
          <ResultCard
            title="이력서 문장"
            tone="indigo"
            content={result.resume}
          />
          <ResultCard
            title="면접 답변"
            tone="amber"
            content={result.interview}
          />
        </div>
      )}
    </div>
  );
}
