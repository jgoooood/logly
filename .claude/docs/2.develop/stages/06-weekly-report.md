# Stage 6 — 주간 리포트

**완료일**: 2026-05-01
**상태**: ✅ 완료
**목표**: 최근 7일 로그를 모아 한 주 회고를 AI로 생성. 두 번째 AI 호출 사례로서 Stage 4에서 정립한 패턴(`completeJSON` + zod 스키마 + service layer + 5단계 라우트 템플릿)이 새 도메인에 일관되게 적용되는지 검증.

---

## 1. 구현 결과

### 신규 파일

| 경로 | 역할 |
|---|---|
| `lib/ai/prompts/report.ts` | 시스템 프롬프트 + `reportOutputSchema` (summary / highlights / keywords) + 인젝션-안전 user 메시지 빌더 |
| `lib/services/report.service.ts` | `reportService.generateWeekly({ userId })` — `WeeklyReport` discriminated union 반환 |
| `app/api/reports/weekly/route.ts` | POST, §5.1 5단계 템플릿. 사용자별 일 5회 레이트 리밋 |
| `app/(app)/reports/page.tsx` | 페이지 셸 + 헤더 + 로그 목록 링크 |
| `components/features/report/ReportPanel.tsx` | `"use client"` — 생성/재생성 버튼, 4상태(idle/loading/error/empty/ready) 처리 |

### 수정 파일

| 경로 | 변경 |
|---|---|
| `app/(app)/page.tsx` | 헤더 아래 링크 모음에 "주간 리포트 →" 추가 |

### 패키지 변경
- 없음. 기존 zod / OpenAI SDK 그대로 활용.

---

## 2. 핵심 결정 사항

### 결정 ① HTTP 메서드: GET → POST

**선택**: `/api/reports/weekly` 를 POST 메서드로 구현.

**대안**: 계획상 GET. 일반 조회 라우트라 GET이 RESTful.

**왜 POST인가**:
- AI 호출은 **비용 발생 액션**. GET은 idempotent + cacheable 의미가 있는데, 리포트 생성은 매 호출마다 새 토큰 비용.
- GET으로 두면 브라우저/CDN/프록시가 중간에 캐싱할 가능성 → 의도치 않은 응답 재사용.
- POST는 "생성/명령" 의미라 사용자에게도 "이 행동은 비용이 든다"가 명확.

**향후 캐싱 도입 시**: `GET /api/reports/weekly?week=YYYY-WW` 같은 쿼리 파라미터 + DB에 리포트 row 저장 후 GET이 의미 있어짐. 그 시점에 분리.

### 결정 ② Empty / Non-empty 상태를 200으로 통합 (422 아님)

**선택**: 7일 로그 0건 시 `200 OK` + `{ empty: true, periodStart, periodEnd }`.

**대안**: 422 Unprocessable Entity.

**왜 200인가**:
- "데이터가 없음" 은 **에러가 아니라 정상 상태**. 사용자가 잘못한 게 없음.
- 클라이언트가 422를 받으면 catch 블록으로 빠지는데, 빈 상태는 정상 화면(EmptyReport)을 보여줘야 함 → 분기가 어색.
- TypeScript discriminated union (`{ empty: true } | { empty: false; output: ... }`) 으로 클라이언트가 컴파일 타임에 분기 강제됨 — 타입 안전.

```ts
type WeeklyReport =
  | { empty: true; periodStart: string; periodEnd: string }
  | { empty: false; periodStart: string; periodEnd: string; logCount: number; output: ReportOutput };
```

### 결정 ③ 레이트 리밋 키 분리 (`report:weekly:` vs `transform:`)

**선택**: 별도 카운터.

**왜 분리**:
- transform은 작은 호출(짧은 입력 → 짧은 출력), 일 10회.
- report는 큰 호출(여러 로그 → 긴 출력), 일 5회.
- 사용자가 "변환을 많이 했다고 리포트도 못 만드는" 것은 부자연스러움.
- 도메인별 quota 정책이 자연스럽게 분리됨.

**일관 시그니처**: 인메모리 stub의 `{ key, limit, windowSec }` 인터페이스가 두 도메인에서 동일하게 동작 → Redis 교체 시에도 도메인별 정책 유지.

### 결정 ④ PII 격리: 프롬프트 인풋은 `{ date, text }` 만

**선택**: `buildReportUserMessage(logs: { date: string; text: string }[])` — `userId`, 이메일, log id 등 미포함.

**왜 격리**:
- AI provider(Groq)는 외부 시스템. 사용자 식별 정보 송신은 PII 노출.
- 모델이 식별 정보를 활용해야 할 이유 없음 — 회고 요약은 텍스트 자체만 필요.
- 향후 logging/observability를 외부 도구로 보낼 때도 같은 원칙 (CLAUDE.md §9.3 "외부 분석 도구로 본문 전송 금지(메타데이터만)").

**라벨로 감싸 인젝션 방어**: `한_주_업무_기록:\n"""\n{body}\n"""` — Stage 4의 transform 패턴 재사용.

### 결정 ⑤ 7일 윈도우 처리: 200건 fetch 후 서비스에서 since 필터

**선택**: `logRepo.listForUser({ limit: 200 })` → service에서 `createdAt >= periodStart` 필터.

**대안 검토**:
- (가) `logRepo.listSince({ userId, since })` 신규 메서드 추가
- (나) `logRepo.listForUser({ userId, since })` 인자 확장
- (다) 200건 fetch 후 메모리 필터 ← 채택

**왜 (다)인가**:
- 일 평균 1~3건의 로그 작성을 가정하면 7일치 = 최대 ~30건. 200건 fetch는 충분히 여유.
- 200건 = ~50KB 응답. 네트워크/파싱 비용 무시 가능.
- repo 인터페이스 변경 없이 한 번 통과 → repo 시그니처 안정성 ↑.
- 향후 사용량이 늘어 로그가 일 50건+ 발생하는 사용자가 생기면 (가) 또는 (나) 도입. **YAGNI**.

**부채**: 코드 주석으로 명시 (`// logRepo.listSince 도입은 별도 단계`).

### 결정 ⑥ AI 호출 패턴 재사용 (Stage 4와 동일 골격)

**선택**: Stage 4 transform과 동일한 코드 골격을 그대로 적용.

```
prompts/{도메인}.ts  ← 시스템 프롬프트 + zod schema + user 메시지 빌더
services/{도메인}.service.ts  ← AI client + repo 호출
api/.../route.ts  ← 5단계 템플릿
```

**왜 동일하게**:
- 두 번째 사례 = **추상화 검증**. 새 도메인이 같은 골격으로 들어맞으면 추상화가 정확.
- 향후 세 번째, 네 번째 AI 도메인도 같은 골격으로 추가 가능 → 학습 곡선 0.
- 다른 골격을 도입하면 **언제 어느 골격을 쓸지** 결정 부담이 추가됨.

**검증**: report.service.ts 가 transform.service.ts 와 거의 동일한 구조로 작성됨 → 패턴이 잘 일반화됨을 확인.

---

## 3. 진행 중 Q&A

### Q1. 서버 재시작했는데 기존 로그인 유저는 유지돼?

**유지됨.** 세션 쿠키는 브라우저에 저장(HTTP-only) → dev 프로세스 재시작과 무관.

| 요소 | 위치 | dev 재시작 영향 |
|---|---|---|
| 세션 쿠키 (`sb-...-auth-token`) | 브라우저 | 영향 없음 |
| Next.js 프로세스 | 로컬 머신 | 종료/재시작 |
| Supabase 사용자 / auth 설정 | Supabase 클라우드 | 영향 없음 |

세션이 끊기는 경우: 로그아웃, 쿠키 삭제, refresh token 60일 만료, 시크릿 창. 검증 시 로그인 화면이 안 뜨는 게 정상.

---

## 4. 검증 (DoD)

| 항목 | 결과 | 검증 방법 |
|---|---|---|
| `/api/reports/weekly` 미인증 시 401 | ✅ | `curl -i -X POST http://localhost:3000/api/reports/weekly` |
| 7일 0건 시 200 + `empty: true` | ✅ | EmptyReport 카드 표시 |
| 리포트 생성 표시 | ✅ | 요약 / 주요 성과 / 키워드 3섹션 + 기간 + 로그 건수 |
| 프롬프트에 사용자 식별 정보 미포함 | ✅ | `buildReportUserMessage` 시그니처 = `{ date, text }[]` 만 |
| zod 출력 검증 | ✅ | `reportOutputSchema.parse` 실패 시 502 매핑 |
| 홈 링크 동작 | ✅ | 헤더 "주간 리포트 →" → /reports |
| `npx tsc --noEmit` 0 errors | ✅ | exit 0 |

---

## 5. 다음 단계로 넘기는 메모

### Stage 7 (테스트)에 직접 영향
- `report.service.ts` 의 두 분기(empty / 정상) 단위 테스트 필수.
- `buildReportUserMessage` 의 인젝션 sanitize(`"""` 치환) 단위 테스트.
- transform과 같은 골격이라 mock 패턴 재사용 — `vi.mock("@/lib/ai/client")` + `vi.mock("@/lib/supabase/log.repo")`.

### 운영 배포 전 처리 부채
- **리포트 캐싱 부재**: 같은 주에 여러 번 생성 = 매번 AI 호출. 향후 `reports` 테이블 도입 + 주차 단위 멱등 키로 캐싱.
- **재생성 시 비용**: "다시 생성하기" 버튼이 비용 의식 없이 눌릴 수 있음. 버튼에 "AI 호출 1회 발생" 부가 텍스트 또는 비용 한도 알림 검토.
- **고로그 사용자 200건 한도**: 1주에 200건 넘는 사용자 발생 시 일부 로그 누락. `logRepo.listSince` 도입 시점 결정.

### 의도적 보류
- **월간 리포트**: 주간만 구현. 월간/연간은 동일 골격 복제로 가능 (별도 단계).
- **리포트 PDF/공유 링크**: MVP 범위 외.
- **리포트 자동 발송 (이메일/슬랙)**: 별도 cron + 외부 통합 단계.

### 패턴 검증 결과
- **AI 호출 추상화 안정**: prompts → service → route 골격이 transform과 report 두 도메인에 동일하게 적용. 향후 도메인 추가 비용 ↓.
- **Errors / toErrorResponse 재사용**: 새 라우트도 같은 catch + toErrorResponse 패턴. 라우트당 catch 블록 코드량 4줄로 표준화.
- **rate-limit 인터페이스 안정**: 도메인별 키 분리만으로 정책 차별화. Redis 교체 시 일괄 swap 가능.
