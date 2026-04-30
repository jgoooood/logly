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

import { transformService } from "@/lib/services/transform.service";
import { completeJSON } from "@/lib/ai/client";
import { logRepo } from "@/lib/supabase/log.repo";

const mockCompleteJSON = vi.mocked(completeJSON);
const mockInsert = vi.mocked(logRepo.insert);

describe("transformService.run", () => {
  beforeEach(() => {
    mockCompleteJSON.mockReset();
    mockInsert.mockReset();
  });

  it("AI 결과를 반환하고 logRepo.insert 를 정확한 인자로 호출한다", async () => {
    mockCompleteJSON.mockResolvedValue({
      achievement: "성과 1",
      resume: "이력서 1",
      interview: "면접 1",
    });
    mockInsert.mockResolvedValue();

    const result = await transformService.run({
      userId: "u1",
      log: "테스트 입력",
    });

    expect(result).toEqual({
      achievement: "성과 1",
      resume: "이력서 1",
      interview: "면접 1",
    });
    expect(mockInsert).toHaveBeenCalledWith({
      userId: "u1",
      raw: "테스트 입력",
      achievement: "성과 1",
      resume: "이력서 1",
      interview: "면접 1",
    });
  });

  it("AI 실패 시 에러를 그대로 던지고 insert 는 호출하지 않는다", async () => {
    mockCompleteJSON.mockRejectedValue(new Error("AI down"));

    await expect(
      transformService.run({ userId: "u1", log: "테스트" }),
    ).rejects.toThrow("AI down");
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("repo 저장 실패 시 에러를 사용자에게 전파 (데이터 일관성 우선)", async () => {
    mockCompleteJSON.mockResolvedValue({
      achievement: "a",
      resume: "r",
      interview: "i",
    });
    mockInsert.mockRejectedValue(new Error("db down"));

    await expect(
      transformService.run({ userId: "u1", log: "테스트" }),
    ).rejects.toThrow("db down");
  });
});
