import Link from "next/link";
import { signIn } from "../actions";

type Props = {
  searchParams: { error?: string; signedUp?: string };
};

export default function LoginPage({ searchParams }: Props) {
  const { error, signedUp } = searchParams;

  return (
    <main className="min-h-screen px-6 py-16">
      <div className="mx-auto max-w-md">
        <h1 className="text-3xl font-bold text-slate-900 text-center">로그인</h1>
        <p className="mt-2 text-center text-sm text-slate-600">
          Logly 계정으로 시작하세요
        </p>

        {signedUp && (
          <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
            가입이 완료됐습니다. 이메일 확인 후 로그인하세요.
          </div>
        )}
        {error && (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <form action={signIn} className="mt-8 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="email" className="text-sm font-medium text-slate-700">
              이메일
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="rounded-xl border border-slate-300 bg-white p-3 text-base shadow-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="password" className="text-sm font-medium text-slate-700">
              비밀번호
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              minLength={6}
              className="rounded-xl border border-slate-300 bg-white p-3 text-base shadow-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
          </div>
          <button
            type="submit"
            className="mt-2 rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white shadow hover:bg-brand-dark"
          >
            로그인
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-600">
          계정이 없으신가요?{" "}
          <Link href="/signup" className="font-semibold text-brand hover:underline">
            가입하기
          </Link>
        </p>
      </div>
    </main>
  );
}
