type Props = {
  title?: string;
  message: string;
};

export function ErrorState({ title = "오류가 발생했습니다.", message }: Props) {
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
      <h3 className="text-base font-semibold text-red-900">{title}</h3>
      <p className="mt-1 text-sm text-red-700">{message}</p>
    </div>
  );
}
