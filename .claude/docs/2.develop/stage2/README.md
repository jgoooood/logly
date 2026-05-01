# Stage Records — Round 2

이 디렉터리는 Logly 프로젝트의 **Round 2 단계별 완료 기록 보관소**다.
Round 1 결과 (`.claude/stages/`) 와 구분된다.

## 어떻게 사용하나
- Round 2 단계의 DoD 전부 충족 → `IMPLEMENTATION2.md` 에서 ✅ 마킹할 때 새 파일 추가
- 한 번 작성한 파일은 **수정하지 않는다**. 잘못된 결정이 드러나면 별도 단계 또는 후속 메모로 처리
- 검색용: 향후 "왜 Upstash를 골랐지?", "리포트 캐싱 전략 어떻게 결정했지?" 같은 질문에 즉시 답하기 위함

## Round 1 와의 관계
- Round 1 인덱스: [`../stages/README.md`](../stages/README.md) — Stage 1~7 (셋업 → 테스트 셋업)
- Round 2 는 Stage 1 부터 새로 번호를 시작 (Round 1 의 Stage 8 이 아님)
- TaskList ID는 Round 1 누적 (#8 이상). 문서상 Stage 번호와 TaskList ID 가 다를 수 있음 — 본 문서의 Stage 번호가 단일 출처.

## 인덱스

| # | 단계 | 우선도 | 완료일 | 핵심 산출물 |
|---|---|---|---|---|
| 1 | Rate Limit Redis 전환 | 🔴 | 2026-05-01 | [01-rate-limit-redis.md](./01-rate-limit-redis.md) — Upstash Redis, `lib/rate-limit.ts` 교체, 호출부 0줄 변경 |
| 2 | Supabase 타입 자동생성 | 🟡 | 2026-05-01 | [02-supabase-types.md](./02-supabase-types.md) — `supabase gen types`, `<Database>` 제네릭 재부착, log.repo Database 파생 타입 |
| 3 | npm audit 정리 | 🟡 | _진행 예정_ | 8건 (critical 1 / high 6 / moderate 1) 해소 |
| 4 | 리포트 캐싱 | 🟡 | _진행 예정_ | `reports` 테이블, week_key 멱등 키, force 재생성 |
| 5 | LogListView 페이지네이션 UI | 🟢 | _진행 예정_ | "더 보기" Server Action, cursor 기반 |
| 6 | 통합/e2e 테스트 확장 | 🟢 | _진행 예정_ | route 통합 테스트, Playwright e2e |
| 7 | CI 파이프라인 | 🟢 | _진행 예정_ | GitHub Actions verify 워크플로 |
| 8 | 운영 배포 | — | _진행 예정_ | Vercel, 환경변수 분리, Confirm email ON |

## 표준 파일 구조

각 `NN-name.md` 파일은 다음 섹션을 갖는다 (Round 1 과 동일):

1. **헤더** — 완료일, 우선도, 목표, 상태
2. **구현 결과** — 신규/수정/삭제 파일, 패키지 변경
3. **핵심 결정 사항 (Why)** — 선택, 대안, 이유, 향후 영향
4. **진행 중 Q&A** — 사용자가 단계 진행 중 던진 질문과 답변 요약
5. **검증 (DoD)** — Definition of Done 항목별 결과
6. **다음 단계로 넘기는 메모** — 의도적 보류, 부채, 후속 단계에 영향을 주는 사항
