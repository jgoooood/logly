import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/ai/client", () => ({
  completeJSON: vi.fn(),
  AI_MODEL: "test-model",
}));

vi.mock("@/lib/supabase/log.repo", () => ({
  logRepo: {
    insert: vi.fn(),
    listForUser: vi.fn(),
  },
}));

import { reportService } from "@/lib/services/report.service";
import { completeJSON } from "@/lib/ai/client";
import { logRepo } from "@/lib/supabase/log.repo";
import type { Log } from "@/types/domain";

const mockCompleteJSON = vi.mocked(completeJSON);
const mockListForUser = vi.mocked(logRepo.listForUser);

function makeLog(args: { id: string; daysAgo: number; raw?: string }): Log {
  const created = new Date(
    Date.now() - args.daysAgo * 24 * 60 * 60 * 1000,
  ).toISOString();
  return {
    id: args.id,
    userId: "u1",
    raw: args.raw ?? `로그 ${args.id}`,
    achievement: "a",
    resume: "r",
    interview: "i",
    createdAt: created,
  };
}

describe("reportService.generateWeekly", () => {
  beforeEach(() => {
    mockCompleteJSON.mockReset();
    mockListForUser.mockReset();
  });

  it("최근 7일 로그가 0건이면 empty: true, AI 호출 안 함", async () => {
    mockListForUser.mockResolvedValue([]);

    const result = await reportService.generateWeekly({ userId: "u1" });

    expect(result.empty).toBe(true);
    expect(mockCompleteJSON).not.toHaveBeenCalled();
  });

  it("7일 윈도우 안의 로그만 AI 입력으로 사용한다", async () => {
    mockListForUser.mockResolvedValue([
      makeLog({ id: "1", daysAgo: 1 }),
      makeLog({ id: "2", daysAgo: 6 }),
      makeLog({ id: "3", daysAgo: 8 }), // 윈도우 밖
    ]);
    mockCompleteJSON.mockResolvedValue({
      summary: "요약",
      highlights: ["h1"],
      keywords: ["k1"],
    });

    const result = await reportService.generateWeekly({ userId: "u1" });

    expect(result.empty).toBe(false);
    if (!result.empty) {
      expect(result.logCount).toBe(2);
      expect(result.output.summary).toBe("요약");
    }
    expect(mockCompleteJSON).toHaveBeenCalledOnce();
  });

  it("8일 이상된 로그만 있으면 empty: true (윈도우 밖)", async () => {
    mockListForUser.mockResolvedValue([
      makeLog({ id: "1", daysAgo: 8 }),
      makeLog({ id: "2", daysAgo: 30 }),
    ]);

    const result = await reportService.generateWeekly({ userId: "u1" });

    expect(result.empty).toBe(true);
    expect(mockCompleteJSON).not.toHaveBeenCalled();
  });

  it("프롬프트에는 raw + date 만 전달, userId 등 PII 미포함", async () => {
    mockListForUser.mockResolvedValue([
      makeLog({ id: "1", daysAgo: 1, raw: "캐싱 도입" }),
    ]);
    mockCompleteJSON.mockResolvedValue({
      summary: "s",
      highlights: [],
      keywords: [],
    });

    await reportService.generateWeekly({ userId: "secret-user-id" });

    const callArgs = mockCompleteJSON.mock.calls[0]?.[0];
    expect(callArgs?.user).toContain("캐싱 도입");
    expect(callArgs?.user).not.toContain("secret-user-id");
  });
});
