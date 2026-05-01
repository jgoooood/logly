import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockIncr, mockExpire, mockTtl, RedisCtor } = vi.hoisted(() => {
    const incr = vi.fn();
    const expire = vi.fn();
    const ttl = vi.fn();
    const ctor = vi.fn(function (this: unknown) {
        Object.assign(this as object, { incr, expire, ttl });
    });
    return {
        mockIncr: incr,
        mockExpire: expire,
        mockTtl: ttl,
        RedisCtor: ctor,
    };
});

vi.mock("@upstash/redis", () => ({
    Redis: RedisCtor,
}));

import { rateLimit, __resetRateLimitClientForTest } from "@/lib/rate-limit";

describe("rateLimit (Upstash 기반)", () => {
    beforeEach(() => {
        vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://test.upstash.io");
        vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-token");
        mockIncr.mockReset();
        mockExpire.mockReset();
        mockTtl.mockReset();
        RedisCtor.mockClear();
        __resetRateLimitClientForTest();
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("첫 호출은 INCR=1 → EXPIRE 호출 후 ok 반환", async () => {
        mockIncr.mockResolvedValueOnce(1);
        mockExpire.mockResolvedValueOnce(1);

        const r = await rateLimit({ key: "k1", limit: 10, windowSec: 60 });

        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.remaining).toBe(9);
            expect(r.resetAt).toBeGreaterThan(Date.now());
        }
        expect(mockIncr).toHaveBeenCalledWith("k1");
        expect(mockExpire).toHaveBeenCalledWith("k1", 60);
        expect(mockTtl).not.toHaveBeenCalled();
    });

    it("한도 미달 두 번째 호출은 EXPIRE 미호출 + remaining 감소", async () => {
        mockIncr.mockResolvedValueOnce(7);
        mockTtl.mockResolvedValueOnce(45);

        const r = await rateLimit({ key: "k2", limit: 10, windowSec: 60 });

        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.remaining).toBe(3);
        }
        expect(mockExpire).not.toHaveBeenCalled();
        expect(mockTtl).toHaveBeenCalledWith("k2");
    });

    it("한도 초과 시 ok=false + retryAfter=TTL", async () => {
        mockIncr.mockResolvedValueOnce(11);
        mockTtl.mockResolvedValueOnce(30);

        const r = await rateLimit({ key: "k3", limit: 10, windowSec: 60 });

        expect(r.ok).toBe(false);
        if (!r.ok) {
            expect(r.retryAfter).toBe(30);
        }
        expect(mockExpire).not.toHaveBeenCalled();
    });

    it("env 미설정 시 fail-open (Redis 호출 0회)", async () => {
        vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
        vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
        __resetRateLimitClientForTest();

        const r = await rateLimit({ key: "k4", limit: 10, windowSec: 60 });

        expect(r.ok).toBe(true);
        expect(RedisCtor).not.toHaveBeenCalled();
        expect(mockIncr).not.toHaveBeenCalled();
    });
});
