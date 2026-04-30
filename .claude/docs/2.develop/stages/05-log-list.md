# Stage 5 — 로그 저장 + 목록 화면

**완료일**: 2026-05-01
**상태**: ✅ 완료
**목표**: 변환 결과를 `logs` 테이블에 저장하고, 사용자가 자기 로그를 목록으로 볼 수 있게 한다. Stage 4의 service layer가 비어 있던 `logRepo.insert` TODO를 채워 첫 번째 도메인 데이터 흐름(변환 → 저장 → 조회) 완성.

---

## 1. 구현 결과

### 신규 파일

| 경로 | 역할 |
|---|---|
| `lib/supabase/log.repo.ts` | DB 액세스. `insert`, `listForUser({ limit, cursor })` + row→domain 매핑 |
| `lib/services/log.service.ts` | `listForCurrentUser` — 세션에서 user 자동 추출 후 repo 호출 |
| `components/ui/EmptyState.tsx` | 빈 상태 표준 컴포넌트 (title + description + action) |
| `components/ui/ErrorState.tsx` | 에러 상태 표준 컴포넌트 |
| `components/ui/Skeleton.tsx` | 로딩 스켈레톤 |
| `components/features/log/LogListView.tsx` | `"use client"` — 카드 펼치기/접기 + 날짜 포맷 |
| `app/(app)/logs/page.tsx` | RSC — 목록 조회 + 에러 fallback 렌더 |
| `app/(app)/logs/loading.tsx` | Next.js 표준 로딩 UI (스켈레톤 3개) |

### 수정 파일

| 경로 | 변경 |
|---|---|
| `lib/services/transform.service.ts` | 변환 성공 후 `logRepo.insert` 호출 추가. Stage 4의 TODO 해소 |
| `app/(app)/page.tsx` | 헤더에 "내 로그 보기 →" 링크 추가 |
| `lib/supabase/{client,server,middleware}.ts` | `<Database>` 타입 제네릭 제거 (충돌 해결) |
| `types/database.ts` | 주석 갱신 — 현재 미사용, CLI 자동생성으로 교체 권장 |

### 패키지 변경
- 없음. 신규 패키지 추가 0건.

---

## 2. 핵심 결정 사항

### 결정 ① RLS + 명시적 `.eq("user_id", ...)` 동시 사용

**선택**: repo의 `listForUser` 가 RLS만 의존하지 않고 `.eq("user_id", args.userId)` 도 함께 명시.

**왜 둘 다 거나**:
- RLS는 **보안 마지막 방어선**. 명시적 필터는 **인덱스 활용 + 의도 명료화**.
- `logs (user_id, created_at desc)` 복합 인덱스는 `.eq + .order` 패턴에서 covering scan. RLS 만 두면 Postgres가 인덱스를 못 쓸 가능성 있음.
- 코드 리뷰어가 "이 쿼리가 어떤 조건으로 필터링되는지"를 SQL 레벨로 즉시 알 수 있음.

**왜 RLS만 의존하지 않는가**:
- RLS 정책 미스(예: 미래 마이그레이션에서 정책 변경) 시 silent하게 다른 사용자 데이터 노출 위험.
- 명시적 조건이 있으면 코드가 두 번째 가드 역할.

### 결정 ② RSC가 데이터 조회, Client Component는 인터랙션만

**선택**: `app/(app)/logs/page.tsx` (Server Component) → `LogListView` (`"use client"`) 로 logs 배열 전달.

**왜 분리**:
- 데이터 조회는 RSC에서 → 인증 쿠키 자동 활용, 서버 fetch 1회로 끝, 브라우저로 fetch 코드 안 나감 → 번들 작아짐.
- 인터랙션(카드 펼치기)은 클라이언트에서 → useState 사용.
- CLAUDE.md §6.2 컨테이너/프레젠테이션 분리 패턴 정확히 적용.

**왜 useEffect + fetch 안 쓰나**:
- CLAUDE.md §3.2 "데이터 mutation은 Server Action 또는 Route Handler. `useEffect` + `fetch` 패턴 금지."
- RSC 활용 시 코드량 절반, 캐시 효율 ↑.

### 결정 ③ Cursor 기반 페이지네이션 (offset 아님)

**선택**: `listForUser({ limit, cursor })` 시그니처. cursor는 `created_at` ISO 문자열.

**왜 cursor인가** (offset 대신):
- offset/limit은 큰 데이터셋에서 성능 저하 (DB가 N+limit 행을 스캔).
- cursor는 인덱스(`created_at desc`)에 직접 매칭 → O(limit).
- 새 row가 추가돼도 페이지 경계가 흔들리지 않음 (offset은 흔들림).

**현재 적용**:
- `/logs` 페이지는 첫 50개만 로드. UI에 "더 보기" 버튼 미구현 (Stage 5 스코프 외).
- repo 시그니처가 cursor를 받게 만들어 둠 → UI 추가 시 호출부만 변경, repo 변경 없음.

### 결정 ④ 4상태 표준 컴포넌트 (`EmptyState`, `ErrorState`, `Skeleton`)

**선택**: 도메인 무관한 UI 프리미티브를 `components/ui/` 에 배치.

**왜 표준화**:
- 모든 데이터 화면이 `loading / empty / error / ready` 4상태를 다뤄야 한다는 게 CLAUDE.md §6.3 강제.
- 매번 페이지마다 inline 스타일 짜면 일관성 깨짐 + 누락 발생.
- 이후 Stage 6 (주간 리포트), 향후 다른 목록 화면이 같은 컴포넌트 재사용 → 유지보수 비용 ↓.

**RSC + Next.js 관습 매핑**:
- loading → `app/(app)/logs/loading.tsx` (Next.js 자동 활성)
- empty → RSC가 빈 배열 → `LogListView` 가 `EmptyState` 렌더
- error → RSC try/catch → `ErrorState` 렌더
- ready → 정상 카드 리스트

### 결정 ⑤ supabase-js `<Database>` 제네릭 잠시 분리

**선택**: 모든 클라이언트 생성자(`createServerClient`, `createBrowserClient`)에서 `<Database>` 타입 제네릭 제거. repo 레이어 경계에서 도메인 타입(`Log`)으로 안전성 확보.

**원인**:
- Stage 2에서 작성한 `types/database.ts` 의 수동 stub이 supabase-js v2.45 의 내부 Database 형식과 어긋남 (`PostgrestVersion: "12"`, `Relationships`, `CompositeTypes` 등).
- typed 제네릭 사용 시 `.insert(...)` 가 `parameter of type 'never'` 에러 발생.

**대안**:
- (가) Supabase CLI 도입 → `supabase gen types typescript` 자동 생성.
- (나) 수동 stub을 v2.45 스펙 맞춰 재작성 (Relationships, CompositeTypes 등 추가).
- (다) **typed 제네릭 분리 + repo 경계 타입 강제** ← 채택.

**왜 (다)인가**:
- (가)는 CLI 인증 + 도입 작업이 추가 → Stage 5 범위 초과.
- (나)는 supabase-js 버전 올라갈 때마다 수동 동기화 부담. **부채 누적**.
- (다)는 즉시 동작 + 도메인 타입(`Log`)은 그대로 유지 → 호출부 안전성 미손실.

**대가**: `from("logs")` 가 untyped → 잘못된 컬럼명 / 잘못된 데이터 모양은 런타임 에러로 발견. repo 함수 내부 한정이라 영향 범위 작음.

**향후**: 자동생성 도입 시점에 한 줄(`<Database>`) 추가만 하면 type 안전성 복귀.

---

## 3. 진행 중 Q&A

이 단계는 사용자 추가 질문 없이 자동 작업으로 진행됨. 단계 종료 후 검증 1~3 항목 통과 보고.

---

## 4. 검증 (DoD)

| 항목 | 결과 | 검증 방법 |
|---|---|---|
| 변환 후 `logs` 테이블에 row 생성 | ✅ | Supabase SQL Editor 에서 `select count(*) from public.logs` 증가 확인 |
| `/logs` 에서 본인 데이터만 보임 | ✅ | 빈 상태 / 본인 로그 분기 정상 |
| 4상태 처리 | ✅ | `loading.tsx` + `EmptyState`/`ErrorState` + 정상 렌더 |
| `select *` 사용 없음 | ✅ | `log.repo.ts` 에서 7개 컬럼 명시 |
| `npx tsc --noEmit` 0 errors | ✅ | exit 0 (Database 제네릭 분리 후) |

---

## 5. 다음 단계로 넘기는 메모

### Stage 6에 직접 영향
- `report.service.ts` 에서 `logRepo.listForUser({ userId, since })` 패턴이 필요해질 가능성. 현재 repo는 cursor 기반이라 `since` 추가는 별도 메서드 또는 args 확장으로 처리.
- 주간 리포트는 **최근 7일 logs 전체 텍스트** 를 프롬프트에 넘김. 보관 정책상 일주일 안의 데이터만 처리되므로 cursor 페이지네이션 불필요.

### Stage 7(테스트)에 직접 영향
- `log.repo.ts` `rowToDomain` 함수 — 순수 함수라 단위 테스트 1순위.
- `log.service.ts` `listForCurrentUser` — 미인증 시 `Errors.Unauthorized()` throw 검증.
- `transform.service.ts` 의 `logRepo.insert` 흐름 — Stage 4 테스트에 더해서 `logRepo.insert` 가 정확한 인자로 호출되는지 spy 추가.

### 의도적 보류
- **"더 보기" 페이지네이션 UI 미구현**: 첫 50건만 노출. 사용자가 50개 넘는 로그 작성 시 잘림. 이슈 발생 시 Server Action으로 추가 페이지 fetch 추가. repo 시그니처는 이미 cursor 지원.
- **카드 정렬/필터 UI 미구현**: 단순 시간 역순. 향후 검색/태그 도입 시 별도 단계.
- **logRepo.insert 실패 시 동작**: 변환 결과는 응답되지 않고 5xx. 즉, AI 호출 비용은 발생했지만 사용자에 결과 미전달. **데이터 일관성을 사용자 가치보다 우선** — 응답 후 비동기 저장으로 바꾸면 결과는 받지만 누락 위험. 현재 정책 유지.

### 부채 (운영 배포 전 처리)
- `types/database.ts` CLI 자동생성 도입.
- supabase 클라이언트에 `<Database>` 제네릭 다시 부착.
- LogListView 페이지네이션 UI (50건 한도 해제).
