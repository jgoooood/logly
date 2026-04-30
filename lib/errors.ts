import { NextResponse } from "next/server";

export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export const Errors = {
  BadInput: (issues: unknown) =>
    new AppError(400, "BAD_INPUT", "입력이 올바르지 않습니다.", { issues }),
  Unauthorized: () =>
    new AppError(401, "UNAUTHORIZED", "로그인이 필요합니다."),
  Forbidden: () =>
    new AppError(403, "FORBIDDEN", "권한이 없습니다."),
  NotFound: (what: string) =>
    new AppError(404, "NOT_FOUND", `${what}을(를) 찾을 수 없습니다.`),
  RateLimited: (retryAfter: number) =>
    new AppError(429, "RATE_LIMITED", "잠시 후 다시 시도해주세요.", { retryAfter }),
  AiBadResponse: () =>
    new AppError(502, "AI_BAD_RESPONSE", "AI 응답을 해석하지 못했습니다."),
  AiUnavailable: () =>
    new AppError(503, "AI_UNAVAILABLE", "AI 서비스가 일시적으로 불안정합니다."),
};

export function toErrorResponse(e: unknown) {
  if (e instanceof AppError) {
    return NextResponse.json(
      { error: e.message, code: e.code, ...e.extra },
      { status: e.status },
    );
  }
  return NextResponse.json(
    { error: "서버 오류가 발생했습니다.", code: "INTERNAL" },
    { status: 500 },
  );
}
