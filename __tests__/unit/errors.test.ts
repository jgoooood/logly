import { describe, it, expect } from "vitest";
import { AppError, Errors, toErrorResponse } from "@/lib/errors";

describe("Errors factory", () => {
  it("Unauthorized — 401 / UNAUTHORIZED", () => {
    const e = Errors.Unauthorized();
    expect(e).toBeInstanceOf(AppError);
    expect(e.status).toBe(401);
    expect(e.code).toBe("UNAUTHORIZED");
  });

  it("RateLimited — 429 + retryAfter extra", () => {
    const e = Errors.RateLimited(60);
    expect(e.status).toBe(429);
    expect(e.code).toBe("RATE_LIMITED");
    expect(e.extra).toEqual({ retryAfter: 60 });
  });

  it("BadInput — 400 + issues extra", () => {
    const issues = { fieldErrors: { log: ["required"] } };
    const e = Errors.BadInput(issues);
    expect(e.status).toBe(400);
    expect(e.extra).toEqual({ issues });
  });

  it("NotFound — 404 + 한국어 메시지", () => {
    const e = Errors.NotFound("로그");
    expect(e.status).toBe(404);
    expect(e.message).toContain("로그");
  });

  it("AiBadResponse / AiUnavailable — 502 / 503", () => {
    expect(Errors.AiBadResponse().status).toBe(502);
    expect(Errors.AiUnavailable().status).toBe(503);
  });
});

describe("toErrorResponse", () => {
  it("AppError → status + body", async () => {
    const res = toErrorResponse(Errors.Unauthorized());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({
      error: "로그인이 필요합니다.",
      code: "UNAUTHORIZED",
    });
  });

  it("AppError extra 가 본문에 spread 된다", async () => {
    const res = toErrorResponse(Errors.RateLimited(60));
    const body = await res.json();
    expect(body.retryAfter).toBe(60);
    expect(body.code).toBe("RATE_LIMITED");
  });

  it("일반 Error → 500 INTERNAL", async () => {
    const res = toErrorResponse(new Error("oops"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({
      error: "서버 오류가 발생했습니다.",
      code: "INTERNAL",
    });
  });

  it("미지의 throw value → 500 INTERNAL", async () => {
    const res = toErrorResponse("string error");
    expect(res.status).toBe(500);
  });
});
