// Upstash Redis 기반 fixed-window rate limit.
// 호출부 인터페이스(`rateLimit({ key, limit, windowSec })`)와 `RateLimitResult` 타입은
// 인메모리 stub 시절과 100% 동일하게 유지한다 (호출부 0줄 변경).

import { Redis } from "@upstash/redis";
import { logger } from "@/lib/logger";

export type RateLimitResult =
    | { ok: true; remaining: number; resetAt: number }
    | { ok: false; retryAfter: number };

let client: Redis | null = null;
let warnedMissingEnv = false;

function getClient(): Redis | null {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) {
        if (!warnedMissingEnv) {
            logger.warn("rate-limit.upstash_env_missing", {
                msg: "UPSTASH_REDIS_REST_URL/TOKEN 미설정 — rate limit이 fail-open으로 동작합니다.",
            });
            warnedMissingEnv = true;
        }
        return null;
    }
    if (!client) {
        client = new Redis({ url, token });
    }
    return client;
}

export async function rateLimit(args: {
    key: string;
    limit: number;
    windowSec: number;
}): Promise<RateLimitResult> {
    const now = Date.now();
    const redis = getClient();

    // env 미설정 시 dev/preview 가 막히지 않도록 fail-open. 운영에선 env 필수 (배포 가이드 참조).
    if (!redis) {
        return { ok: true, remaining: args.limit - 1, resetAt: now + args.windowSec * 1000 };
    }

    try {
        const count = await redis.incr(args.key);

        // 첫 증가에만 TTL 부여 — 이후 호출은 같은 윈도우 내 카운터 유지.
        if (count === 1) {
            await redis.expire(args.key, args.windowSec);
        }

        if (count > args.limit) {
            const ttl = await redis.ttl(args.key);
            const retryAfter = ttl > 0 ? ttl : args.windowSec;
            return { ok: false, retryAfter };
        }

        const ttl = count === 1 ? args.windowSec : await redis.ttl(args.key);
        const effectiveTtl = ttl > 0 ? ttl : args.windowSec;
        return { ok: true, remaining: args.limit - count, resetAt: now + effectiveTtl * 1000 };
    } catch (e) {
        // Redis 장애 시에도 서비스 자체가 죽으면 안 되므로 fail-open.
        // 단, 알람을 위해 error 로그는 남긴다.
        logger.error("rate-limit.upstash_error", { err: e, key: args.key });
        return { ok: true, remaining: args.limit - 1, resetAt: now + args.windowSec * 1000 };
    }
}

// 테스트 전용: 모듈 캐시된 클라이언트와 warn 플래그 초기화. 운영 코드에서 사용 금지.
export function __resetRateLimitClientForTest(): void {
    client = null;
    warnedMissingEnv = false;
}
