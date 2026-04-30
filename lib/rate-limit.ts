// 인메모리 레이트 리밋 stub.
// 한계: 프로세스 재시작 시 초기화, 멀티 인스턴스 환경에서 동기화되지 않음.
// TODO: 운영 배포 전 Upstash Redis 또는 Postgres 카운터로 교체 (인터페이스는 유지).

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export type RateLimitResult =
  | { ok: true; remaining: number; resetAt: number }
  | { ok: false; retryAfter: number };

export async function rateLimit(args: {
  key: string;
  limit: number;
  windowSec: number;
}): Promise<RateLimitResult> {
  const now = Date.now();
  const bucket = buckets.get(args.key);

  if (!bucket || now >= bucket.resetAt) {
    const resetAt = now + args.windowSec * 1000;
    buckets.set(args.key, { count: 1, resetAt });
    return { ok: true, remaining: args.limit - 1, resetAt };
  }

  if (bucket.count >= args.limit) {
    return { ok: false, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
  }

  bucket.count += 1;
  return { ok: true, remaining: args.limit - bucket.count, resetAt: bucket.resetAt };
}
