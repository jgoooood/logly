# Logly 구현 단계 — Round 2 (운영 부채 정리 + 배포 준비)

이 문서는 [`IMPLEMENTATION.md`](./IMPLEMENTATION.md) Stage 1~7 완료 이후 시작되는 **2차 작업 라운드**의 단일 출처다.
구조와 운영 방식은 Round 1과 동일.

- 모든 패턴 규칙(코드 스타일, 라우트 템플릿, 보안)은 [`CLAUDE.md`](./CLAUDE.md) 참조.
- 단계 진행 기록은 [`.claude/stage2/`](./.claude/stage2/) 에 단계 ✅ 처리 시점에 한 파일씩 추가.
- Round 1의 결과 기록은 [`.claude/stages/`](./.claude/stages/) 와 구분.
- DoD가 전부 충족돼야 다음 단계로 넘어간다. 부분 구현으로 다음 단계 시작 금지.

## 상태 범례
- ⬜ 미시작
- 🟡 진행 중
- ✅ 완료
- 🔒 잠김

## 우선도 범례
- 🔴 운영 배포 전 필수
- 🟡 가능한 빨리
- 🟢 여유 있을 때

## 진행 요약

| # | 단계 | 우선도 | 상태 | 의존 |
|---|---|---|---|---|
| 1 | Rate Limit Redis 전환 | 🔴 | ✅ 완료 | — |
| 2 | Supabase 타입 자동생성 + 제네릭 재부착 | 🟡 | ✅ 완료 | — |
| 3 | npm audit 취약점 정리 | 🟡 | ⬜ 미시작 | — |
| 4 | 리포트 캐싱 (reports 테이블) | 🟡 | ⬜ 미시작 | 2 권장 |
| 5 | LogListView 페이지네이션 UI | 🟢 | ⬜ 미시작 | — |
| 6 | 통합/e2e 테스트 확장 | 🟢 | ⬜ 미시작 | — |
| 7 | CI 파이프라인 (GitHub Actions) | 🟢 | ⬜ 미시작 | — |
| 8 | 운영 배포 (Vercel + Confirm email) | — | 🔒 | 1, 7 |

의존성 그래프:
```
1 ──┐
2 ──┤
3 ──┼──▶ 8
4 ──┤
5 ──┤
6 ──┤
7 ──┘
```
(Stage 8은 1과 7이 완료돼야 시작 가능. 나머지는 어느 순서로든 진행 가능 — 단, Stage 4는 Stage 2 이후가 자연스러움.)

---

## Stage 1 — Rate Limit Redis 전환

**상태**: ✅ 완료
**우선도**: 🔴 운영 배포 전 필수
**목표**: `lib/rate-limit.ts` 의 인메모리 Map 카운터를 Upstash Redis 기반으로 교체. 멀티 인스턴스/프로세스 재시작 견고성 확보.

### 사전 준비 (사용자 작업)
- https://upstash.com 가입 (GitHub 로그인)
- Redis DB 생성 (Region: `ap-northeast-1` 또는 `us-east-1`)
- REST URL / REST Token 확보 → `.env.local`

### 패키지 추가
- `@upstash/redis`

### 만들/수정 파일

| 경로 | 변경 |
|---|---|
| `lib/rate-limit.ts` | 내부 구현을 Upstash Redis로 교체. 외부 시그니처(`rateLimit({ key, limit, windowSec })`) 그대로 — 호출부 0줄 변경 |
| `.env.local`, `.env.example` | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` 추가 |
| `__tests__/unit/rate-limit.test.ts` (신규) | Upstash 클라이언트 모킹, 첫 호출 / 한도 미달 / 한도 초과 3 케이스 |

### 알고리즘 (Fixed Window)
- 키: `args.key`
- Redis `INCR` + 첫 증가 시 `EXPIRE windowSec`
- 결과 ≤ limit이면 ok, 초과 시 `TTL` 조회해 retryAfter 계산

### DoD
- [x] dev 서버 재시작 후 카운터 유지됨 (Upstash 대시보드에서 키 확인)
- [x] transform / report 라우트 코드 변경 0줄
- [x] `npm run verify` 통과
- [x] `__tests__/unit/rate-limit.test.ts` 3 케이스 추가 + 통과

---

## Stage 2 — Supabase 타입 자동생성 + 제네릭 재부착

**상태**: ✅ 완료
**우선도**: 🟡
**목표**: 수동 `types/database.ts` 를 Supabase CLI 자동생성으로 교체. 클라이언트에 `<Database>` 제네릭 재부착해 컴파일 타임 안전성 복구.

### 사전 준비 (사용자 작업)
- Supabase CLI 설치 (Windows): `npm install -g supabase` 또는 https://supabase.com/docs/guides/cli/getting-started 의 Scoop/zip 방식
- `supabase login` (브라우저 토큰 인증)
- Project Ref 확보 (대시보드 → Project Settings → General)

### 만들/수정 파일

| 경로 | 변경 |
|---|---|
| `types/database.ts` | CLI 자동 생성으로 덮어쓰기 |
| `lib/supabase/{client,server,middleware}.ts` | `createBrowserClient<Database>(...)`, `createServerClient<Database>(...)` 로 제네릭 재부착 |
| `lib/supabase/log.repo.ts` | typed insert/select. row→domain 매핑 함수 시그니처 정밀화 |
| `package.json` | 스크립트 `"types:gen": "supabase gen types typescript --project-id <REF> > types/database.ts"` 추가 |

### DoD
- [x] `npm run types:gen` 으로 `types/database.ts` 자동 갱신 동작
- [x] `from("logs")` 의 insert/select 가 typed (`Database['public']['Tables']['logs']['Row']` 추론)
- [x] 잘못된 컬럼명 사용 시 컴파일 에러 발생 검증
- [x] `npm run verify` 통과

---

## Stage 3 — npm audit 취약점 정리

**상태**: ⬜ 미시작
**우선도**: 🟡
**목표**: Stage 1(Round 1) 시점부터 누적된 8건(critical 1 / high 6 / moderate 1) 해소.

### 작업 절차
1. `npm audit` 으로 취약점 목록 + 영향 패키지 분석
2. `npm audit fix` 시도 (breaking change 없는 것만 자동 적용)
3. 남은 항목은 수동 업그레이드 (예: Next.js 마이너 패치, transitive dep override)
4. 모든 변경 후 `npm run verify` + 핵심 흐름 수동 회귀 (변환 1회)

### DoD
- [ ] `npm audit` critical 0
- [ ] `npm audit` high 0 — 또는 의도적 보류 사유 stage doc에 명시
- [ ] `npm run verify` 통과
- [ ] 변환 / 리포트 / 로그 목록 흐름 regression 없음 (수동 1회)

---

## Stage 4 — 리포트 캐싱 (reports 테이블)

**상태**: ⬜ 미시작
**우선도**: 🟡
**목표**: 같은 사용자가 같은 주에 여러 번 리포트를 호출해도 AI 호출은 1회만 발생. 비용 절감 + 응답 속도 개선.

### 의존
- Stage 2 (typed 클라이언트) — 권장. typed 없이도 가능하지만 typed 후 작성하면 일관성 ↑

### 만들/수정 파일

| 경로 | 변경 |
|---|---|
| `supabase/migrations/0002_reports.sql` | `reports` 테이블 + RLS 4종 + 유니크 인덱스 (user_id, week_key) |
| `lib/supabase/report.repo.ts` (신규) | `getByWeekKey`, `upsertByWeekKey` |
| `lib/services/report.service.ts` | 캐시 hit 우선 → miss 시 AI 호출 후 저장. `force` 인자 지원 |
| `app/api/reports/weekly/route.ts` | body 또는 query에 `force` 받아 service에 전달 |
| `components/features/report/ReportPanel.tsx` | "다시 생성" 버튼이 force 플래그 전송 |
| `__tests__/unit/report.service.test.ts` | 캐시 hit / 캐시 miss / force 재생성 케이스 추가 |

### 스키마 초안
```sql
create table public.reports (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  week_key    text not null,            -- 'YYYY-WW' (ISO week)
  period_start timestamptz not null,
  period_end   timestamptz not null,
  log_count   int not null,
  output      jsonb not null,           -- { summary, highlights, keywords }
  created_at  timestamptz not null default now(),
  refreshed_at timestamptz not null default now(),
  unique (user_id, week_key)
);
```

### DoD
- [ ] 같은 주 두 번째 호출은 AI 호출 안 함 — `logger.info("report.weekly.cache_hit", ...)` 로그 검증
- [ ] "다시 생성" 클릭 시 force 동작 → 캐시 갱신
- [ ] 캐시 hit 응답 시간 < 100ms (실측)
- [ ] RLS 본인 캐시만 접근
- [ ] `npm run verify` 통과

---

## Stage 5 — LogListView 페이지네이션 UI

**상태**: ⬜ 미시작
**우선도**: 🟢
**목표**: `/logs` 페이지의 50건 한도 해제. cursor 기반 "더 보기" 버튼.

### 만들/수정 파일

| 경로 | 변경 |
|---|---|
| `app/(app)/logs/actions.ts` (신규) | `loadMoreLogs(cursor: string): Promise<Log[]>` Server Action |
| `components/features/log/LogListView.tsx` | 마지막 row의 createdAt을 cursor로 사용. "더 보기" 버튼 + 로딩/끝 상태 |
| `lib/services/log.service.ts` | 인자에 `cursor` 그대로 전달 (이미 시그니처 존재) |

### DoD
- [ ] 50건 넘는 사용자도 모두 조회 가능
- [ ] 끝 도달 시 버튼 숨김 + "마지막입니다" 안내
- [ ] 로딩 중 버튼 비활성화 + 스피너
- [ ] `npm run verify` 통과

---

## Stage 6 — 통합/e2e 테스트 확장

**상태**: ⬜ 미시작
**우선도**: 🟢
**목표**: Route Handler 통합 테스트 + Playwright e2e 도입. 핵심 플로우 회귀 방지.

### 패키지 추가
- `@playwright/test`

### 만들 파일

| 경로 | 역할 |
|---|---|
| `__tests__/integration/transform.route.test.ts` | 5단계 가드 동작 (인증/검증/서비스 mock/응답) |
| `__tests__/integration/reports.weekly.route.test.ts` | empty / 정상 / rate limit |
| `e2e/auth.spec.ts` (Playwright) | 가입 → 로그인 → 로그아웃 |
| `e2e/transform.spec.ts` | 로그인 → 변환 → 카드 3개 → 로그 목록 진입 |
| `playwright.config.ts` | webServer로 dev 자동 시작 |
| `package.json` 스크립트 | `"test:e2e": "playwright test"` |

### DoD
- [ ] 라우트 통합 테스트 2개 통과
- [ ] e2e 2개 통과 (로컬에서)
- [ ] e2e는 무거우니 기본 `verify` 에서는 제외, 별도 명령으로만
- [ ] CI에서 e2e는 라벨 시에만 실행 (Stage 7과 연계)

---

## Stage 7 — CI 파이프라인 (GitHub Actions)

**상태**: ⬜ 미시작
**우선도**: 🟢
**목표**: PR 머지 게이트 자동화. 로컬 `npm run verify` 와 1:1 매칭.

### 사전 준비
- GitHub 레포 푸시 완료 (사용자 작업)
- (선택) Supabase 키 / Groq 키를 GitHub Secrets에 등록 — service 단위 테스트는 mock 기반이라 필수 아님. e2e는 필요.

### 만들 파일

| 경로 | 역할 |
|---|---|
| `.github/workflows/verify.yml` | push/pull_request에서 `npm ci && npm run verify` |
| `.github/workflows/e2e.yml` | label `e2e` 시 Playwright 실행 |
| `.github/dependabot.yml` (옵션) | 주간 의존성 업데이트 PR |

### DoD
- [ ] PR에 verify 자동 실행 + 결과 표시
- [ ] 메인 브랜치 보호 룰 — verify 실패 시 머지 차단
- [ ] (선택) e2e 라벨 워크플로 동작

---

## Stage 8 — 운영 배포 (Vercel + Confirm email)

**상태**: 🔒 잠김
**우선도**: —
**목표**: Vercel 운영 환경에 배포. Confirm email ON으로 복귀.

### 의존
- Stage 1 (Redis rate limit) — **필수**. 인메모리는 운영에서 사실상 미동작.
- Stage 7 (CI) — **권장**. CI 없이도 배포 가능하지만 회귀 방지망 없는 상태.

### 사전 준비 (사용자 작업)
- Supabase 운영용 프로젝트 분리 (권장) → 새 마이그레이션 일괄 적용
- Vercel 가입, GitHub 레포 import
- 운영용 환경변수 입력
- 운영 도메인 연결 (선택)

### 작업 항목
1. Vercel 환경변수 셋업 (`production` / `preview` 분리)
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`
   - `GROQ_API_KEY`
   - `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
2. Supabase Authentication → Email → **Confirm email ON** 복귀
3. Supabase 콘솔에서 운영 도메인을 redirect URL allow list에 추가
4. 첫 배포 후 흐름 검증

### DoD
- [ ] 운영 URL에서 가입 → 이메일 확인 메일 수신 → 확인 → 로그인 → 변환 → 로그 목록 → 리포트 흐름 동작
- [ ] dev 환경변수가 운영에 미사용 (Supabase 프로젝트 분리됐는지 확인)
- [ ] 빌드 번들에 `sb_secret_` 미포함 (배포된 .next/static 검증)
- [ ] `IMPLEMENTATION.md` 의 Round 1 메모 (Confirm email OFF) 가 운영에선 ON으로 갱신된 상태

---

## 운영 규칙

### 단계 전환 절차
1. 작업 시작 전: 본 문서의 진행 요약 표 + 단계 본문 상태를 🟡 로 변경.
2. 작업 중: DoD 체크박스를 충족할 때마다 `[x]` 로 마킹.
3. 작업 종료 시: DoD 전부 `[x]` → 상태 ✅ → (다음 단계의 의존이 만족되면) 잠금 해제.
4. **DoD 일부 미달이면 절대 ✅ 로 바꾸지 않는다.** 새 작업은 같은 단계 체크리스트에 추가하거나, 별도 후속 단계로 분리.
5. **단계 ✅ 처리 시 `.claude/stage2/NN-name.md` 를 함께 작성.** 양식은 `.claude/stage2/README.md` 참조 (구현 결과 / Why / Q&A / DoD / 다음 단계 메모 5섹션). 한 번 작성한 stage 파일은 수정하지 않는다(append-only).

### Round 1 결과와의 분리
- Round 1 산출물: `IMPLEMENTATION.md`, `.claude/stages/01~07.md`. **수정하지 않는다.**
- Round 2의 변경이 Round 1 코드/결정을 뒤집을 경우, 본 문서 또는 stage doc에 변경 사유를 기록한다.
