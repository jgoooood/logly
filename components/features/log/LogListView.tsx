"use client";

import { useState } from "react";
import type { Log } from "@/types/domain";
import { EmptyState } from "@/components/ui/EmptyState";

type Props = {
  logs: Log[];
};

export function LogListView({ logs }: Props) {
  if (logs.length === 0) {
    return (
      <EmptyState
        title="아직 로그가 없습니다."
        description="홈에서 한 줄 업무 기록을 작성하면 여기에 쌓입니다."
      />
    );
  }

  return (
    <ul className="flex flex-col gap-4">
      {logs.map((log) => (
        <LogCard key={log.id} log={log} />
      ))}
    </ul>
  );
}

function LogCard({ log }: { log: Log }) {
  const [open, setOpen] = useState(false);
  const dateLabel = formatDate(log.createdAt);

  return (
    <li className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-4 p-5 text-left"
        aria-expanded={open}
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-slate-500">{dateLabel}</p>
          <p className="mt-1 text-base text-slate-900">{log.raw}</p>
        </div>
        <span className="shrink-0 text-sm text-slate-400" aria-hidden="true">
          {open ? "▲" : "▼"}
        </span>
      </button>
      {open && (
        <div className="grid gap-3 border-t border-slate-100 p-5">
          <ResultLine label="성과 요약" tone="emerald" content={log.achievement} />
          <ResultLine label="이력서 문장" tone="indigo" content={log.resume} />
          <ResultLine label="면접 답변" tone="amber" content={log.interview} />
        </div>
      )}
    </li>
  );
}

type Tone = "emerald" | "indigo" | "amber";

const toneBadge: Record<Tone, string> = {
  emerald: "bg-emerald-100 text-emerald-700",
  indigo: "bg-indigo-100 text-indigo-700",
  amber: "bg-amber-100 text-amber-700",
};

function ResultLine({
  label,
  tone,
  content,
}: {
  label: string;
  tone: Tone;
  content: string;
}) {
  return (
    <div>
      <span
        className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${toneBadge[tone]}`}
      >
        {label}
      </span>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
        {content}
      </p>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}
