type Props = {
  className?: string;
};

export function Skeleton({ className }: Props) {
  const base = "animate-pulse rounded-md bg-slate-200";
  return <div className={className ? `${base} ${className}` : base} />;
}
