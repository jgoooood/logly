import Link from "next/link";
import { signUp } from "../actions";

type Props = {
  searchParams: { error?: string };
};

export default function SignupPage({ searchParams }: Props) {
  const { error } = searchParams;

  return (
    <main className="min-h-screen px-6 py-16">
      <div className="mx-auto max-w-md">
        <h1 className="text-3xl font-bold text-slate-900 text-center">회원가입</h1>
        <p className="mt-2 text-center text-sm text-slate-600">
          이메일과 비밀번호로 시작하기
        </p>

        {error && (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <form action={signUp} className="mt-8 flex flex-col gap-4">
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
              비밀번호 (최소 6자)
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
              className="rounded-xl border border-slate-300 bg-white p-3 text-base shadow-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
          </div>
          <button
            type="submit"
            className="mt-2 rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white shadow hover:bg-brand-dark"
          >
            가입하기
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-600">
          이미 계정이 있나요?{" "}
          <Link href="/login" className="font-semibold text-brand hover:underline">
            로그인
          </Link>
        </p>
      </div>
    </main>
  );
}
