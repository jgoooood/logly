# Logly 구현 단계 (IMPLEMENTATION.md)

이 문서는 **단계별 구현 계획 + 진행 상태**의 단일 출처다.
- 모든 패턴 규칙(코드 스타일, 라우트 템플릿, 보안)은 [`CLAUDE.md`](./CLAUDE.md) 참조. 이 문서는 "무엇을, 어디에, 어떤 순서로"만 다룬다.
- 매 단계 시작/종료 시 본 문서의 상태 표와 체크리스트를 갱신한다.
- 단계의 **DoD(Definition of Done)** 가 전부 충족돼야 다음 단계로 넘어간다. 부분 구현으로는 다음 단계를 시작하지 않는다.

## 상태 범례
- ⬜ 미시작
- 🟡 진행 중
- ✅ 완료
- 🔒 잠김 (앞 단계 미완료로 시작 불가)

## 진행 요약

| # | 단계 | 상태 | 의존 |
|---|---|---|---|
| 1 | 셋업 · 동작 검증 | ✅ 완료 | — |
| 2 | DB 스키마 + RLS 마이그레이션 | ✅ 완료 | 1 |
| 3 | Supabase Auth (로그인/회원가입 + 세션 가드) | ✅ 완료 | 2 |
| 4 | transform 라우트 리팩터 (Service Layer) | ✅ 완료 | 3 |
| 5 | 로그 저장 + 목록 화면 | ✅ 완료 | 4 |
| 6 | 주간 리포트 | ✅ 완료 | 5 |
| 7 | 테스트 셋업 (Vitest) | ✅ 완료 | 4 |

의존성 그래프:
```
1 ─▶ 2 ─▶ 3 ─▶ 4 ─┬─▶ 5 ─▶ 6
                  └─▶ 7
```

---

## Stage 1 — 셋업 · 동작 검증

**상태**: ✅ 완료
**메모**: AI 제공자는 비용 부담 없이 진행하기 위해 OpenAI 대신 **Groq (`llama-3.3-70b-versatile`)** 로 시작. OpenAI 호환 API라 SDK는 그대로 사용. Stage 4 리팩터 시 `lib/ai/client.ts` 로 분리되며 provider 교체가 환경변수 한 줄 수준으로 간소화될 예정.
**목표**: 현재 코드가 로컬에서 실행되고 변환 기능이 한 번이라도 정상 동작하는지 확인. 이후 모든 단계의 전제.

### 작업 절차
1. `npm install`
2. `.env.local` 생성 (`.env.example` 복사 후 키 입력)
   - `OPENAI_API_KEY` (필수)
   - 가능하면 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` 도 함께 (Stage 2에서 어차피 필요. 신규 키 체계 사용)
3. `npm run dev` → http://localhost:3000 → 한 줄 입력 → 3종 결과 출력 확인
4. `npx tsc --noEmit`

### 산출물
- `node_modules/`
- `.env.local`

### DoD
- [x] `node_modules/` 존재 — `npm install` 완료 (417 packages)
- [x] `.env.local` 존재 + `GROQ_API_KEY` 채워짐
- [x] 브라우저에서 변환 1회 성공 — 3종 카드(성과 요약/이력서/면접) 출력 확인됨
- [x] `npx tsc --noEmit` 0 errors

---

## Stage 2 — DB 스키마 + RLS 마이그레이션

**상태**: ✅ 완료
**목표**: `logs` 테이블과 RLS 정책을 마이그레이션 파일로 도입. 이후 단계의 DB 기반.

### 사전 준비 (사용자 작업)
- Supabase 콘솔에서 프로젝트 생성
- `Project URL`, `anon key`, `service role key` 확보 → `.env.local`
- (선택) Supabase CLI 설치하면 마이그레이션 자동 적용 가능. CLI 없으면 SQL Editor에 붙여넣기.

### 만들 파일
| 경로 | 역할 |
|---|---|
| `supabase/migrations/0001_init.sql` | `logs` 테이블 + 인덱스 + RLS 정책 4종 |
| `types/domain.ts` | `Log`, `TransformResult` 등 도메인 타입 |
| `types/database.ts` | Supabase 생성 타입 (수동 작성 또는 `supabase gen types`) |

### 마이그레이션 SQL (참고 초안)
```sql
-- supabase/migrations/0001_init.sql
create extension if not exists "pgcrypto";

create table logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  raw         text not null,
  achievement text not null,
  resume      text not null,
  interview   text not null,
  created_at  timestamptz not null default now()
);

create index logs_user_id_created_at_idx on logs (user_id, created_at desc);

alter table logs enable row level security;

create policy "logs_select_own" on logs for select  using (auth.uid() = user_id);
create policy "logs_insert_own" on logs for insert  with check (auth.uid() = user_id);
create policy "logs_update_own" on logs for update  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "logs_delete_own" on logs for delete  using (auth.uid() = user_id);
```

### DoD
- [x] `supabase/migrations/0001_init.sql` 존재 + RLS 정책 4종 포함
- [x] Supabase 프로젝트에 마이그레이션 적용됨 — 컬럼 7개 / 정책 4개 / 익명 select 0건 확인
- [x] `types/domain.ts` 에 `Log`/`TransformResult` export
- [x] **격리 검증**: 익명 세션 select 0건 확인 (Stage 3 이후 사용자 단위 추가 검증)

---

## Stage 3 — Supabase Auth (로그인/회원가입 + 세션 가드)

**상태**: ✅ 완료
**목표**: 인증된 사용자만 앱을 사용할 수 있도록 세션 갱신 미들웨어 + 라우트 그룹 가드.

### 패키지 추가
- `@supabase/ssr` (App Router 권장 방식)

### 만들 파일
| 경로 | 역할 |
|---|---|
| `lib/supabase/server.ts` | RSC/Route Handler 용 — `createServerClient` + `cookies()` |
| `lib/supabase/client.ts` | 브라우저 — `createBrowserClient`, anon key만 |
| `lib/supabase/middleware.ts` | `updateSession(request)` |
| `middleware.ts` (프로젝트 루트) | 모든 요청에서 세션 갱신 |
| `app/(auth)/login/page.tsx` | 이메일/비밀번호 폼 |
| `app/(auth)/signup/page.tsx` | 회원가입 폼 |
| `app/(auth)/actions.ts` | `signIn`, `signUp`, `signOut` Server Action |
| `app/(app)/layout.tsx` | 미인증 시 `/login` redirect + 헤더(로그아웃 버튼) |

### 이동
- 기존 `app/page.tsx` → `app/(app)/page.tsx` (인증 필요 영역으로)

### 보안 체크포인트 (CLAUDE.md §9)
- `lib/supabase/server.ts` 만 service role key 접근. `client.ts` 는 절대 service role 미사용.
- 세션은 HTTP-only 쿠키 (Supabase ssr 기본). `localStorage` 토큰 저장 금지.

### DoD
- [x] 미로그인 상태로 `/` 접근 시 `/login` redirect
- [x] 회원가입 → 로그인 → 홈 진입 한 번 동작
- [x] 로그아웃 동작
- [x] 빌드 번들에 `sb_secret_` 미포함 (`findstr /s /c:"sb_secret_" .next\static\*` 결과 0건)

---

## Stage 4 — transform 라우트 리팩터 (Service Layer)

**상태**: ✅ 완료
**목표**: 현재 `app/api/transform/route.ts` 를 [`CLAUDE.md` §5/§8](./CLAUDE.md) 표준 템플릿으로 재작성. 이후 모든 라우트가 따라갈 표준.

### 패키지 추가
- `zod`

### 만들 파일
| 경로 | 역할 |
|---|---|
| `lib/errors.ts` | `AppError`, `Errors`, `toErrorResponse` |
| `lib/logger.ts` | console 기반 구조화 로거(개발). 운영 교체 가능하게 인터페이스만 통일 |
| `lib/ai/client.ts` | OpenAI 싱글턴 + `completeJSON<T>()` 헬퍼 + `OPENAI_MODEL` 상수 |
| `lib/ai/prompts/transform.ts` | `TRANSFORM_SYSTEM_PROMPT`, `transformOutputSchema`, `buildTransformUserMessage` |
| `lib/services/transform.service.ts` | `transformService.run({ userId, log })` |
| `lib/validation/transform.schema.ts` | 입력 zod (`{ log: string max 500 }`) |
| `lib/rate-limit.ts` | 인메모리 stub (사용자별 일 10회). TODO 주석으로 Upstash/DB 마이그 표시 |

### 수정 파일
- `app/api/transform/route.ts` — 5단계 템플릿(인증 → 레이트리밋 → 검증 → 서비스 → 응답)으로 재작성
- 기존 `lib/openai.ts` 는 `lib/ai/client.ts` 에 흡수 후 삭제

### 시그니처 안정성
- 클라이언트(`components/LogInput.tsx`)가 호출하는 응답 모양 `{ achievement, resume, interview }` 은 그대로 유지. 클라이언트 변경 0줄.

### DoD
- [x] Route Handler 안에 OpenAI 호출/프롬프트 문자열 없음 (전부 service/lib/ai 로 이동)
- [x] zod 검증 실패 시 400, AI 응답 파싱 실패 시 502 동작 확인
- [x] 미인증 시 401 반환 — `curl` 401 + `로그인이 필요합니다.` 응답 확인
- [x] `npx tsc --noEmit` 0 errors
- [x] 홈에서 변환 동작 동일하게 유지 (regression 없음)

---

## Stage 5 — 로그 저장 + 목록 화면

**상태**: ✅ 완료
**목표**: 변환 결과를 `logs` 테이블에 저장하고 사용자가 자기 로그를 목록으로 본다.

### 만들 파일
| 경로 | 역할 |
|---|---|
| `lib/supabase/log.repo.ts` | `insert`, `listForUser({ limit, cursor })` |
| `lib/services/log.service.ts` | `listForCurrentUser()` (서버 컨텍스트에서 세션 user 사용) |
| `app/(app)/logs/page.tsx` | RSC — 목록 조회 후 view에 전달 |
| `components/features/log/LogListView.tsx` | `"use client"` — 정렬/페이지네이션 |
| `components/ui/EmptyState.tsx` | 빈 상태 표준 컴포넌트 |
| `components/ui/ErrorState.tsx` | 에러 상태 표준 컴포넌트 |
| `components/ui/Skeleton.tsx` | 로딩 스켈레톤 표준 |

### 수정 파일
- `lib/services/transform.service.ts` — 변환 성공 후 `logRepo.insert` 호출
- 홈에 "내 로그 보기" 링크

### 데이터 규약
- `select` 시 컬럼 명시 (`select id, raw, achievement, resume, interview, created_at`).
- 목록 기본 20개 + cursor(`created_at`) 기반.

### DoD
- [x] 변환 후 `logs` 테이블에 row 생성 — Supabase SQL Editor 확인
- [x] `/logs` 에서 본인 데이터만 보임 (RLS) — 빈 상태 / 본인 로그 분기 동작
- [x] 4상태(loading/empty/error/ready) 컴포넌트로 처리됨 — `loading.tsx` + `EmptyState`/`ErrorState` + 정상 렌더
- [x] `select *` 사용 없음 — `id, user_id, raw, achievement, resume, interview, created_at` 명시

---

## Stage 6 — 주간 리포트

**상태**: ✅ 완료
**목표**: 최근 7일 로그를 모아 한 주 요약을 AI로 생성. 두 번째 AI 사용 사례로, 패턴 일관성 검증.

### 만들 파일
| 경로 | 역할 |
|---|---|
| `lib/ai/prompts/report.ts` | 시스템 프롬프트 + `reportOutputSchema` |
| `lib/services/report.service.ts` | `generateWeekly({ userId })` |
| `app/api/reports/weekly/route.ts` | POST, §5.1 템플릿 (AI 호출은 비용 발생 액션 → POST 의미적 적합) |
| `app/(app)/reports/page.tsx` | 결과 표시 + 재생성 버튼 |

### 데이터 흐름
1. service: 최근 7일 로그 조회 (없으면 명시적 빈 응답)
2. service: 로그 텍스트만 모아 프롬프트에 전달 (PII 제거 — `user_id`, 이메일 미포함)
3. AI 응답 zod 검증 후 반환

### DoD
- [x] `/api/reports/weekly` 인증 필수 (401 확인) + zod 출력 검증 (`reportOutputSchema`)
- [x] 7일 데이터 0건이면 200 + `{ empty: true, periodStart, periodEnd }`
- [x] 화면에서 리포트 1회 생성·표시 확인 (요약/주요 성과/키워드 3섹션)
- [x] 프롬프트 어디에도 사용자 식별 정보 미포함 — `buildReportUserMessage` 가 `date + text` 만 받음

---

## Stage 7 — 테스트 셋업 (Vitest)

**상태**: ✅ 완료
**목표**: [`CLAUDE.md` §11](./CLAUDE.md) 의 최소 테스트 골격. 이후 모든 기능 추가 시 테스트가 함께 따라오도록 강제.

### 패키지 추가
- `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`, `@vitejs/plugin-react`

### 만들 파일
| 경로 | 역할 |
|---|---|
| `vitest.config.ts` | jsdom 환경, `@/*` path alias |
| `vitest.setup.ts` | `@testing-library/jest-dom` import |
| `__tests__/unit/transform.service.test.ts` | 성공/AI 실패/입력 빈 값 |
| `__tests__/unit/errors.test.ts` | `toErrorResponse` 매핑 |

### `package.json` 스크립트
```json
"scripts": {
  "test": "vitest run",
  "test:watch": "vitest",
  "typecheck": "tsc --noEmit",
  "verify": "npm run typecheck && npm run lint && npm run test"
}
```

### DoD
- [x] `npm run test` 통과 — 4 files, 21 tests
- [x] `transform.service` 테스트 3개 (성공 / AI 실패 / repo 실패) + report.service 4개 + errors 8개 + prompts 6개 = 총 21개
- [x] `npm run verify` 한 번에 typecheck + lint + test 실행 가능 — 전부 PASS

---

## 운영 규칙

### 단계 전환 절차
1. 작업 시작 전: 본 문서에서 해당 단계 상태를 🟡 로 변경.
2. 작업 중: DoD 체크박스를 충족할 때마다 `[x]` 로 마킹.
3. 작업 종료 시: DoD 전부 `[x]` → 상태 ✅ → 다음 단계 🔒 → ⬜.
4. **DoD 일부 미달이면 절대 ✅ 로 바꾸지 않는다.** 새로 발견된 작업은 같은 단계의 체크리스트에 추가하거나, 별도 후속 단계로 분리.
5. **단계 ✅ 처리 시 `.claude/stages/NN-name.md` 를 함께 작성.** 양식은 `.claude/stages/README.md` 참조 (구현 결과 / Why / Q&A / DoD / 다음 단계 메모 5섹션). 한 번 작성한 stage 파일은 수정하지 않는다(append-only).

### 단계 변경/추가
- 진행 중에 단계 자체가 바뀌어야 한다면(범위 확장, 순서 변경) **코드 수정 전에 본 문서를 먼저 갱신**한다.
- 진행 요약 표 + 의존성 그래프 + 해당 단계 본문을 함께 수정.

### 동기화
- 본 문서는 Claude의 작업 추적(`TaskList`)과 일치시킨다. 둘 중 하나가 갱신되면 다른 하나도 같은 PR/세션에서 갱신.
