# Stage 1 — Rate Limit Redis 전환 (Upstash)

**완료일**: 2026-05-01
**우선도**: 🔴 운영 배포 전 필수
**상태**: ✅ 완료
**목표**: `lib/rate-limit.ts` 의 인메모리 Map 카운터를 Upstash Redis 기반 fixed-window 카운터로 교체. 외부 시그니처 보존(호출부 0줄 변경). 멀티 인스턴스 / 프로세스 재시작 견고성 확보.

---

## 1. 구현 결과

### 신규 파일

| 경로 | 역할 |
|---|---|
| `__tests__/unit/rate-limit.test.ts` | Upstash 클라이언트 모킹 — 첫 호출(INCR=1+EXPIRE) / 한도 미달 / 한도 초과 / env 미설정 fail-open. 4 cases |
| `.claude/docs/2.develop/stage2/qa-stage1-redis-upstash.md` | 사용자 학습 Q&A 노트 (Redis / Upstash / Vercel 멀티 인스턴스 / 무료 티어 5문항) |

### 수정 파일

| 경로 | 변경 |
|---|---|
| `lib/rate-limit.ts` | 내부 구현 Upstash Redis 로 교체. `RateLimitResult` 타입 + `rateLimit({ key, limit, windowSec })` 시그니처 100% 동일. 테스트 전용 `__resetRateLimitClientForTest` 추가 export |
| `.env.example` | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` 추가 |
| `.env.local` | 동 키 2개 추가. 사용자가 Upstash 콘솔에서 발급받은 실제 값 입력 (도쿄 리전 `big-tahr-111621.upstash.io`) |
| `package.json` / `package-lock.json` | `@upstash/redis` 의존성 추가 (+1 패키지) |

### 패키지 추가

- `@upstash/redis` — HTTPS REST 기반 Redis 클라이언트 (서버리스 친화적)

### 호출부 코드 변경

| 경로 | 변경 줄 수 |
|---|---|
| `app/api/transform/route.ts` | **0** |
| `app/api/reports/weekly/route.ts` | **0** |

→ "외부 시그니처 보존" DoD 항목 충족.

---

## 2. 핵심 결정 사항

### 결정 ① 백엔드 선택: Upstash Redis (Postgres 카운터 / Vercel KV 아님)

**선택**: Upstash Redis (REST API).

**왜 Upstash 인가**:
- **서버리스 친화** — Vercel 인스턴스가 요청마다 ephemeral 하게 떠도 HTTPS REST 면 connection pool 고민 불필요. 일반 Redis(TCP)는 서버리스에서 connection storm 위험.
- **무료 티어 충분** — 일 10,000 명령. Logly 의 1 변환 = 1~1.2 명령 → 사용자 수천 명까지 무료. 신용카드 등록 불필요.
- **CLAUDE.md §9.5 준수** — "메모리 카운터 금지" 의 정석 해법 중 하나로 본문에 명시됨.

**대안**:
- **Vercel KV** — Upstash 와 동일한 Redis 호스팅. Vercel 대시보드에서 한 번에 셋업 가능. 다만 vendor lock-in ↑ + 무료 한도가 더 작음. Vercel 외 환경(예: 향후 self-host) 으로 옮기기 어려움.
- **Postgres counter** — Supabase 에 카운터 테이블. 별도 의존 추가 없음 + RLS 일관성. 단점: INCR 처럼 원자 연산이 단순하지 않음 (UPSERT + 트리거 또는 row lock 필요), 성능 떨어짐, TTL 자동 만료가 없어 cron 필요.

**선택 근거**: 의존 1개 추가 비용 < (Postgres 카운터의 복잡도 비용 + 성능 부담). vendor lock-in 은 Redis 추상화로 거의 0 — 향후 self-host Redis 로 옮길 때 URL/Token 만 바꾸면 됨.

### 결정 ② 알고리즘: Fixed Window (Sliding Window 아님)

**선택**: INCR + 첫 증가 시 EXPIRE 의 단순 fixed window.

```
첫 요청:    INCR k=1 → EXPIRE k 86400 → ok (remaining=9)
이후 요청:   INCR k=2..10            → ok (remaining 감소)
한도 초과:   INCR k=11 → TTL k 조회   → 429 (retryAfter)
24h 후:    Redis 가 자동 삭제        → 카운터 0 으로 리셋
```

**왜 fixed window 인가**:
- **단순성** — 1~2 round trip. 코드 30줄.
- **명령 절감** — sliding window 는 sorted set + ZADD/ZREMRANGEBYSCORE 로 명령 수 ≥3배. 무료 티어 한도에 직접적 영향.
- **충분한 정밀도** — Logly 는 일 10회 한도. 윈도우 경계에서 잠깐 2배 사용 가능한 fixed window 의 약점은 "일 한도" 단위에선 무시 가능 (사용자가 자정 1초 전 + 자정 1초 후 도합 20회 를 칠 시나리오는 비현실적).

**대안**:
- **Sliding Window Log** — 정확하지만 비쌈. 분 단위 한도(IP 기반 30/min)에는 유리.
- **Token Bucket** — 버스트 허용. 사용자별 일 한도엔 과스펙.

**향후 영향**:
- 미인증 IP 기반 (분당 30) 제한이 필요해지면 sliding window 로 별도 함수 추가 검토. 현 `rateLimit` 시그니처 그대로 사용 가능.

### 결정 ③ Fail Behavior: env 미설정 / Redis 장애 시 모두 fail-open

**선택**: env 누락 또는 Upstash 호출 throw 시 `{ ok: true }` 반환.

```ts
if (!redis) return { ok: true, remaining: limit-1, resetAt: ... };
catch (e) {
    logger.error("rate-limit.upstash_error", { err: e, key });
    return { ok: true, remaining: limit-1, resetAt: ... };
}
```

**왜 fail-open 인가**:
- **dev/preview 부담 ↓** — env 비워둬도 로컬 개발이 막히지 않음 (warn 1회 출력으로 가시성 유지).
- **외부 의존 장애 격리** — Upstash 장애가 서비스 전체 5xx 로 전이되지 않음. rate limit 은 추가 안전망이지 1차 가드가 아니라는 철학.
- **반대급부 인지** — 운영에서 fail-open 은 "장애 중 일시적 abuse 허용" 을 의미. 그래서 error 로그에 key 까지 남겨 알람 연계 가능.

**대안**: fail-closed (`{ ok: false, retryAfter: 60 }`). dev 가 막히고 외부 장애가 사용자 차단으로 전이됨. 트레이드오프 부적합.

**대안**: 메모리 fallback. CLAUDE.md §9.5 가 "메모리 카운터 금지" 라 명시 — 채택 불가.

**향후 영향**:
- 운영에서 fail-open 누적되면 Sentry/알람 트리거 필요. Stage 8 전 모니터링 셋업에서 처리.

### 결정 ④ 모듈 캐시 클라이언트 (싱글턴) + 테스트 전용 reset hook

**선택**:

```ts
let client: Redis | null = null;
function getClient(): Redis | null {
    if (!url || !token) return null;
    if (!client) client = new Redis({ url, token });
    return client;
}
export function __resetRateLimitClientForTest(): void {
    client = null;
    warnedMissingEnv = false;
}
```

**왜 싱글턴**:
- 매 요청마다 `new Redis()` 객체 생성 회피. `@upstash/redis` 는 fetch 기반이라 객체 생성 비용 자체는 작지만, env 검증과 warn 로그도 1회만 실행되도록 캐시.
- 환경변수 검증을 **모듈 load 시점이 아닌 사용 시점**으로 미룸 (CLAUDE.md §15.7: "환경변수는 사용 시점에 검증. 모듈 로드 시점 throw 금지").

**왜 reset hook**:
- 테스트가 env stub 을 동적으로 바꿔야 하는데 (`UPSTASH_REDIS_REST_URL` 빈 값 케이스 검증), 이미 캐시된 client 가 있으면 새 env 가 반영되지 않음.
- export 명에 `__` 와 `ForTest` 모두 붙여 "운영 코드에서 호출 금지" 시그널 명시.

**대안**: `vi.resetModules()` + 동적 import. 케이스마다 라이브러리 재로드 → 테스트 느려짐 + import 위치가 복잡. reset hook 이 가장 직관적.

### 결정 ⑤ 테스트 모킹: vi.hoisted + 일반 함수 ctor

**선택**:

```ts
const { mockIncr, mockExpire, mockTtl, RedisCtor } = vi.hoisted(() => {
    const incr = vi.fn();
    ...
    const ctor = vi.fn(function (this: unknown) {
        Object.assign(this as object, { incr, expire, ttl });
    });
    return { mockIncr: incr, ..., RedisCtor: ctor };
});

vi.mock("@upstash/redis", () => ({ Redis: RedisCtor }));
```

**왜 vi.hoisted**:
- `vi.mock` factory 는 파일 최상단으로 호이스팅됨 → factory 내부에서 일반 top-level 변수 참조 시 `Cannot access before initialization` 에러.
- `vi.hoisted` 가 반환하는 변수는 호이스팅 보존됨.

**왜 일반 함수 ctor (arrow 아님)**:
- `vi.fn().mockImplementation(() => ({...}))` 의 arrow 함수는 `[[Construct]]` 가 없어 `new` 호출 시 "is not a constructor" TypeError. 첫 시도에서 만난 함정.
- `vi.fn(function (this) { Object.assign(this, {...}) })` 으로 실 constructor 시뮬레이션 → `new Redis({url, token})` 호출이 mock 인스턴스를 정상 생성.

**향후 적용 가치**: 다른 서버리스 클라이언트 (Stripe, Resend 등) 모킹 시 동일 패턴 재사용 가능.

---

## 3. 진행 중 Q&A

사용자가 단계 진행 중 던진 개념 질문 5개. 답변 원본은 `qa-stage1-redis-upstash.md` 에 보관.

| # | 질문 | 핵심 응답 요약 |
|---|---|---|
| 1 | "Rate Limit Redis 전환 < 이건 왜 필요한거야? 그리고 REDIS는 뭐야?" | 인메모리 Map 의 두 한계 (재시작 초기화 / 멀티 인스턴스 미동기화). Redis = 메모리 기반 키-값 DB. CLAUDE.md §9.5 가 메모리 카운터 금지로 못 박은 근거 |
| 2 | "그럼 COUNT를 REDIS에 저장해서 사용자별 카운트를 절대적으로 관리하겠다는거지?" | 단일 출처 + INCR 원자성 + TTL 자동 만료. 인스턴스/재시작/시간대 무관 절대 보장 |
| 3 | "VERCEL이 인스턴스가 2개로 분산되어도 하나의 REDIS를 보는거야?" | 환경변수의 단일 URL → 모든 인스턴스가 동일 DB 참조. Redis INCR 원자성으로 동시 호출 race 없음 |
| 4 | "UPSTASH는 뭐야? 그리고 REDIS랑 어떻게 연계되는거야?" | Redis = SW / Upstash = 호스팅 회사. Postgres-Supabase 와 동치. HTTPS REST → 서버리스 친화. 코드는 `new Redis({url, token})` 한 줄로 추상화 |
| 5 | "UPSTASH를 무료로 사용하는거야?" | 무료 티어 (일 10K 명령 / 256MB / 카드 미등록) 로 사용자 수천 명까지 충분. 운영 전환 비용 거의 0 — 그래서 🔴 우선도 |

**의의**: 사용자가 "왜" 를 다층적으로 검증하고 진입한 단계. 향후 Stage 4 (리포트 캐싱) 이나 Stage 8 (운영 배포) 에서 같은 인프라 의문이 다시 나오면 이 노트 참조.

---

## 4. 검증 (DoD)

| 항목 | 결과 | 검증 방법 |
|---|---|---|
| dev 서버 재시작 후 카운터 유지 | ✅ | 사용자가 변환 1회 → Upstash Data Browser 에서 `transform:<userId>` 키 + 카운트 + TTL 확인. 서버 재시작 후 값 보존 확인 |
| transform / report 라우트 코드 변경 0줄 | ✅ | `app/api/transform/route.ts`, `app/api/reports/weekly/route.ts` 의 `rateLimit({ key, limit, windowSec })` 호출부 그대로. import도 동일 |
| `npm run verify` 통과 | ✅ | typecheck (exit 0) + lint (No warnings) + test (5 files / 25 tests / 1.47s) |
| `__tests__/unit/rate-limit.test.ts` 3 케이스 추가 + 통과 | ✅ | 4 cases (INCR=1+EXPIRE / 한도 미달 / 한도 초과 / env 미설정 fail-open) — 스펙 3 + 보너스 1 |

**테스트 시나리오 상세**:
1. **첫 호출** — `mockIncr` 1 반환 → `EXPIRE` 호출 검증, `TTL` 미호출, remaining = limit-1
2. **한도 미달** — `mockIncr` 7 반환 → `EXPIRE` 미호출, `TTL` 호출로 resetAt 계산, remaining = limit-7
3. **한도 초과** — `mockIncr` 11 반환 → `ok: false`, retryAfter = TTL (30s)
4. **env 미설정** — URL/Token 빈 문자열 → `Redis` ctor 미호출, fail-open `ok: true`

---

## 5. 다음 단계로 넘기는 메모

### 부채 / 의도적 보류

- **명령 사용량 모니터링** — Upstash 무료 티어 일 10K 한도. 현재는 알람 미설정. Stage 8 (운영 배포) 의 모니터링 셋업에서 80% 알람 추가 검토.
- **fail-open 알람** — Redis 장애 시 error 로그만 남고 외부 알람 미연계. Sentry 도입 시 `rate-limit.upstash_error` event 별도 채널.
- **분당 IP 기반 rate limit** — 현재는 사용자별 일 한도만 구현. 미인증 엔드포인트 (예: 향후 health/feedback) 도입 시 sliding window 또는 별도 fixed window key 추가 필요. CLAUDE.md §9.5 의 "IP당 분당 30회" 규칙은 미구현 상태 유지.

### 후속 단계 영향

- **Stage 7 (CI 파이프라인)** — `npm run verify` 가 그대로 게이트로 동작. Upstash 키는 mock 기반이라 Secrets 등록 불필요. e2e 워크플로에서만 (Stage 6) 실 Upstash 또는 별도 테스트 DB 검토.
- **Stage 8 (운영 배포)** — Vercel 환경변수에 `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` 추가 필수 (preview / production 분리). dev 와 운영이 같은 DB 를 보면 dev 호출이 운영 카운터에 누적됨 → **운영용 별도 Upstash DB 분리 권장**.
- **Stage 4 (리포트 캐싱)** — 동일한 fail-open 패턴 (캐시 미스 시 AI 호출, 캐시 장애 시 무시) 차용 가능. 단 캐시 결과는 Redis 보다 Postgres `reports` 테이블이 적합 (구조화된 jsonb + RLS).

### 한 줄 요약

**rate limit 이 이제 진짜 rate limit 이다** — 인스턴스가 몇 개로 분산되든, 프로세스가 재시작되든, 사용자별 카운터는 단일 출처(Upstash Redis)에 절대값으로 누적된다. CLAUDE.md §9.5 부채 청산 + Stage 8 운영 배포의 첫 차단막 해제.
