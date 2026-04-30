# Stage Records

이 디렉터리는 Logly 프로젝트의 **단계별 완료 기록 보관소**다. 각 단계가 완료될 때 그 시점의 산출물 · 결정 · 진행 중 Q&A를 한 파일에 동결시킨다.

## 왜 분리해서 보관하나
- `IMPLEMENTATION.md`는 **계획 + 진행 상태** (살아 있는 문서, 갱신 잦음)
- `STAGE_RESULTS.md` 역할인 이 디렉터리는 **완료된 단계의 스냅샷** (append-only, 수정 안 함)
- 향후 "왜 X 라이브러리를 골랐지?", "Groq 쓰기로 한 이유가 뭐였지?" 같은 질문이 생겼을 때 코드/PR 히스토리만으로는 알 수 없는 **의사결정 맥락**을 즉시 찾기 위함

## 작성 시점
- 단계의 DoD 전부 충족 → IMPLEMENTATION.md에서 ✅ 마킹할 때 동시에 이 디렉터리에 새 파일 추가
- 한 번 작성된 파일은 **수정하지 않는다**. 잘못된 결정이 드러나면 별도 단계 또는 후속 메모로 처리

## 인덱스

| # | 단계 | 완료일 | 핵심 산출물 |
|---|---|---|---|
| 1 | [셋업 · 동작 검증](./01-setup.md) | 2026-04-30 | 의존성 설치, `.env.local`, AI 제공자 결정 (OpenAI → Groq) |
| 2 | [DB 스키마 + RLS](./02-db-rls.md) | 2026-04-30 | `logs` 마이그레이션, RLS 4종, Supabase 신규 키 체계 swap |
| 3 | [Supabase Auth](./03-auth.md) | 2026-05-01 | `(auth)`/`(app)` 라우트 그룹, 세션 미들웨어, 가드 |
| 4 | [transform 라우트 리팩터](./04-transform-refactor.md) | 2026-05-01 | 5단계 라우트 템플릿, AppError 패턴, service layer 분리, AI 추상화 (`AI_MODEL`) |
| 5 | [로그 저장 + 목록](./05-log-list.md) | 2026-05-01 | `log.repo` (cursor 페이지네이션), `/logs` RSC, 4상태 컴포넌트 표준 |
| 6 | [주간 리포트](./06-weekly-report.md) | 2026-05-01 | 두 번째 AI 도메인, GET→POST, empty discriminated union, PII 격리 |
| 7 | [테스트 셋업](./07-testing-setup.md) | 2026-05-01 | Vitest + 21 tests, `npm run verify` 게이트, ESLint 표준화 |

## 표준 파일 구조

각 `NN-name.md` 파일은 다음 섹션을 갖는다:

1. **헤더** — 완료일, 목표, 상태
2. **구현 결과** — 신규/수정/삭제 파일, 패키지 변경
3. **핵심 결정 사항 (Why)** — 선택, 대안, 이유, 향후 영향
4. **진행 중 Q&A** — 사용자가 단계 진행 중 던진 질문과 답변 요약
5. **검증 (DoD)** — 단계의 Definition of Done 항목별 결과
6. **다음 단계로 넘기는 메모** — 의도적 보류, 부채, 후속 단계에 영향을 주는 사항
