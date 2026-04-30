# Stage 7 — 테스트 셋업 (Vitest + 핵심 유닛 테스트)

**완료일**: 2026-05-01
**상태**: ✅ 완료
**목표**: Vitest + RTL 도입, service/순수 함수 단위 테스트로 회귀 방지망 구축. `npm run verify` 단일 명령으로 typecheck + lint + test 게이트 표준화.

---

## 1. 구현 결과

### 신규 파일

| 경로 | 역할 |
|---|---|
| `vitest.config.ts` | jsdom 환경, `@/*` path alias, `__tests__/**` 매칭 |
| `vitest.setup.ts` | `@testing-library/jest-dom/vitest` 매처 등록 |
| `__tests__/unit/errors.test.ts` | `Errors` 팩토리 + `toErrorResponse` 분기 (8 tests) |
| `__tests__/unit/prompts.test.ts` | `buildTransformUserMessage`/`buildReportUserMessage` 인젝션 sanitize (6 tests) |
| `__tests__/unit/transform.service.test.ts` | 성공 / AI 실패 / repo 실패 (3 tests) |
| `__tests__/unit/report.service.test.ts` | empty / 정상 / 윈도우 밖 / PII 미포함 (4 tests) |
| `.eslintrc.json` | `next/core-web-vitals` 확장 — `next lint` 첫 실행 prompt 우회 |

### 수정 파일

| 경로 | 변경 |
|---|---|
| `package.json` | `typecheck`, `test`, `test:watch`, `verify` 스크립트 추가 |

### 패키지 추가
- `vitest` — 테스트 러너
- `@vitejs/plugin-react` — JSX 변환
- `jsdom` — 브라우저 환경 시뮬레이션
- `@testing-library/react` — 컴포넌트 테스트 도구 (현재 사용 안 함, Stage 8+ 컴포넌트 테스트 대비)
- `@testing-library/jest-dom` — DOM 매처

---

## 2. 핵심 결정 사항

### 결정 ① 테스트 러너: Vitest (Jest 아님)

**선택**: Vitest.

**왜 Vitest인가**:
- **Vite 생태계 호환** — `@/*` path alias, ESM, TS 변환을 별도 설정 없이 처리. Jest는 ts-jest/SWC 추가 셋업 필요.
- **속도** — 21 tests 1.55s (jsdom 환경 포함). Jest는 cold start가 더 큼.
- **Vi mock API** — `vi.mock(path, factory)` 호이스팅이 자동. import 위에 적어도 작동.
- **Watch 모드 UX** — 변경된 파일만 재실행. dev 사이클이 짧아짐.
- **Next.js 공식 가이드** — Next.js 14+ 도 Vitest를 1순위로 안내.

**대안**: Jest. 안정적이지만 위 4가지가 Vitest보다 약함. 본 프로젝트는 Next.js + TS strict + ESM 기반이라 Vitest가 자연스러운 매칭.

### 결정 ② 테스트 우선순위: service + 순수 함수만

**선택**: 라우트 핸들러 / 컴포넌트 테스트는 도입 미룸. service layer 와 `lib/errors.ts`, `lib/ai/prompts/*` 만 우선.

**왜 이 우선순위인가**:
- service는 비즈니스 규칙 + AI 호출 + DB 호출의 **결합점**. 깨지면 사용자 가치 직접 손상.
- Errors / prompts는 **순수 함수** — 외부 의존 없어 테스트 비용 가장 낮음, ROI 높음.
- 라우트는 Stage 4에서 curl로 수동 검증됨 + service 테스트가 통과하면 라우트의 5단계 가드 골격은 안정적.
- 컴포넌트 (LogInput, ReportPanel) 테스트는 가치 있지만, Stage 7 DoD에 포함 안 됨 — 후속 단계로 분리.

**커버리지 의도**:
- `lib/errors.ts` — 100% (모든 분기)
- `lib/ai/prompts/*` 인젝션 sanitize — 100%
- `lib/services/*.service.ts` — 80% 이상 (외부 의존 mock)
- 그 외 — 측정 안 함

### 결정 ③ Mock 전략: 외부 의존만, 도메인 타입은 실타입

**선택**: `vi.mock("@/lib/ai/client")`, `vi.mock("@/lib/supabase/log.repo")` — service의 외부 의존만 모킹. 도메인 타입(`Log`, `TransformOutput`)은 그대로 사용.

```ts
vi.mock("@/lib/ai/client", () => ({
  completeJSON: vi.fn(),
  AI_MODEL: "test-model",
}));

vi.mock("@/lib/supabase/log.repo", () => ({
  logRepo: { insert: vi.fn(), listForUser: vi.fn() },
}));
```

**왜 이렇게**:
- service의 책임(비즈니스 흐름) 만 검증. 외부 시스템(OpenAI/DB) 정확성은 테스트 책임 밖.
- 도메인 타입은 실타입 사용 → 타입 변경 시 컴파일 에러로 테스트도 동시에 깨짐 → 테스트가 도메인과 동기화됨.
- Mock 객체에 직접 데이터 모양 작성 → 매 테스트가 사용 시나리오를 명확히 표현.

**왜 service 안에서 외부 의존 주입 패턴(DI) 안 쓰나**:
- vi.mock 호이스팅 + ESM module mocking 으로 충분히 모킹 가능. DI 도입은 indirection 비용 ↑.
- 향후 외부 의존이 늘어 mock 셋업이 복잡해지면 도입 검토.

### 결정 ④ `verify` 단일 명령 = CI 게이트 등가

**선택**: `npm run verify` = `npm run typecheck && npm run lint && npm run test`.

**왜 단일 명령**:
- PR 머지 직전 / 커밋 직전에 한 번만 치면 모든 게이트 통과. 무엇을 빠뜨렸는지 고민 X.
- CI 도입 시 동일 명령을 GitHub Actions/Vercel에서 실행 → 로컬과 CI의 통과 기준 1:1 일치.
- CLAUDE.md §11.4 의 PR 머지 게이트 4개 중 3개(`tsc`, `eslint`, `vitest`)를 묶음.

**왜 build 는 안 묶었나**:
- `next build`는 통과시키려면 환경변수 다 설정해야 하고 시간이 김. 일상 verify 비용으로 비쌈.
- build는 별도 PR 검증 단계 또는 deploy preview에서 처리.

### 결정 ⑤ ESLint config 수동 작성

**선택**: `.eslintrc.json` 을 직접 작성 (`{ "extends": ["next/core-web-vitals"] }`).

**대안**: `next lint` 첫 실행 시 interactive prompt에서 "Strict" 선택.

**왜 수동인가**:
- interactive prompt는 자동화 흐름(`npm run verify`)을 막음.
- prompt 결과가 동일한 한 줄짜리 config 생성이라 결과물 동일 → 수동 작성이 빠름.
- 팀 협업 시 누구나 같은 config로 시작하도록 보장.

### 결정 ⑥ jsdom 환경을 모든 테스트에 적용

**선택**: `vitest.config.ts` 의 `environment: "jsdom"` 글로벌 설정.

**대안**: 파일별로 `// @vitest-environment node` 또는 `jsdom` 헤더.

**왜 글로벌**:
- 현재 service/순수 함수 테스트는 환경 무관 — node여도 동작.
- 향후 컴포넌트 테스트 추가 시 jsdom 필수 → 미리 글로벌 설정해 두면 신규 테스트 작성 부담 ↓.
- 단점: service 테스트가 jsdom 부팅 비용 추가. 21 tests 1.5s로 여전히 빠름 → 무시 가능.

**향후**: 컴포넌트 테스트가 늘고 service 테스트도 늘면 파일별 환경 분리 검토.

---

## 3. 진행 중 Q&A

이 단계는 사용자 추가 질문 없이 자동 작업으로 진행됨. 단, ESLint 첫 실행 prompt 자동화가 막혀 `.eslintrc.json` 직접 작성으로 우회 (위 결정 ⑤).

---

## 4. 검증 (DoD)

| 항목 | 결과 | 검증 방법 |
|---|---|---|
| `npm run test` 통과 | ✅ | 4 files, 21 tests, 1.55s |
| transform.service 테스트 3개 이상 | ✅ | 성공 / AI 실패 / repo 실패 = 3 cases |
| 외부 의존 vi.mock | ✅ | `@/lib/ai/client`, `@/lib/supabase/log.repo` |
| `npm run verify` 한 줄 통과 | ✅ | typecheck (exit 0) + lint (No warnings) + test (21 pass) |

**커버리지 (수동 측정)**:
- `lib/errors.ts` — 모든 Errors 팩토리 + toErrorResponse 분기 (4개 케이스 + spread + unknown throw)
- `lib/ai/prompts/transform.ts` `buildTransformUserMessage` — 정상 + 인젝션 sanitize
- `lib/ai/prompts/report.ts` `buildReportUserMessage` — 정상 + 인젝션 sanitize + 빈 배열
- `lib/services/transform.service.ts` `run` — 성공 / AI 실패 / repo 실패
- `lib/services/report.service.ts` `generateWeekly` — empty / 정상 / 윈도우 밖 / PII 미포함

---

## 5. 다음 단계로 넘기는 메모

### 도입은 했지만 확장 여지 (후속 단계 후보)
- **컴포넌트 테스트** — `LogInput`, `ReportPanel` 의 인터랙션. RTL 의존성은 이미 설치됨.
- **route handler 통합 테스트** — `/api/transform`, `/api/reports/weekly` 의 5단계 가드 동작. Supabase 모킹 + 인증 / 레이트 / 검증 / 응답 매핑.
- **e2e (Playwright)** — 로그인 → 변환 → 목록 → 리포트 흐름. Stage 1~6 의 핵심 플로우 회귀 방지.
- **커버리지 측정 도입** — `vitest --coverage` + 임계값 강제.
- **CI 파이프라인** — GitHub Actions 에서 `npm run verify` 실행. PR 머지 게이트 자동화.

### 운영 배포 전 처리 부채 (Stage 7 시점에는 손대지 않은 항목)
- `types/database.ts` Supabase CLI 자동생성 + `<Database>` 제네릭 재부착 (Stage 5 결정 ⑤ 부채)
- 인메모리 rate-limit → Redis/Postgres (Stage 4 결정 ④ 부채)
- 리포트 캐싱 (Stage 6 결정 ⑥ 부채)
- npm audit 8 vulnerabilities 정리 (Stage 1 메모)
- LogListView 페이지네이션 UI (Stage 5 결정 ③ 후속)

### 패턴 정착 효과
- service layer 분리 (Stage 4) + repo 분리 (Stage 5) + prompts 분리 (Stage 4/6) 가 Stage 7 테스트에서 검증됨.
- 외부 의존만 mock 하면 service 테스트가 즉시 가능 → **추상화가 유효함이 테스트로 증명**.
- 향후 새 service/route 추가 시 동일 골격 + 동일 테스트 패턴으로 비용 ↓.

### 한 줄 요약
**`npm run verify` 가 통과하면 코드는 머지 가능하다** — 이게 이 프로젝트의 새 단일 진실. 이후 모든 변경은 이 명령에 종속.
