type Tone = "emerald" | "indigo" | "amber";

const toneStyles: Record<Tone, { ring: string; badge: string }> = {
  emerald: {
    ring: "border-emerald-200",
    badge: "bg-emerald-100 text-emerald-700",
  },
  indigo: {
    ring: "border-indigo-200",
    badge: "bg-indigo-100 text-indigo-700",
  },
  amber: {
    ring: "border-amber-200",
    badge: "bg-amber-100 text-amber-700",
  },
};

export default function ResultCard({
  title,
  content,
  tone,
}: {
  title: string;
  content: string;
  tone: Tone;
}) {
  const styles = toneStyles[tone];
  return (
    <div className={`rounded-2xl border ${styles.ring} bg-white p-5 shadow-sm`}>
      <span
        className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${styles.badge}`}
      >
        {title}
      </span>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
        {content}
      </p>
    </div>
  );
}
