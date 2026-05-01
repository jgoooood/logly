# Stage 2 — Supabase 타입 자동생성 + 제네릭 재부착

**완료일**: 2026-05-01
**우선도**: 🟡
**상태**: ✅ 완료
**목표**: 수동 `types/database.ts` 를 Supabase CLI 자동생성으로 교체. `createServerClient` / `createBrowserClient` 에 `<Database>` 제네릭 재부착해 컴파일 타임 안전성 복구. log.repo 의 손으로 베껴 쓴 `Row` 타입 제거.

---

## 1. 구현 결과

### 신규 파일

| 경로 | 역할 |
|---|---|
| `.claude/docs/2.develop/stage2/qa-stage2-supabase-types.md` | 사용자 학습 Q&A 노트 (database vs domain / string 타입 / 매핑 검증 3문항) |

### 수정 파일

| 경로 | 변경 |
|---|---|
| `types/database.ts` | Supabase CLI 자동생성 결과로 덮어씀. `__InternalSupabase`, `Tables<>`/`TablesInsert<>`/`TablesUpdate<>`/`Enums<>`/`CompositeTypes<>` 헬퍼 타입 추가. `logs.Relationships: []` 포함 |
| `lib/supabase/server.ts` | `createServerClient<Database>(...)` 부착. 주석 정리 |
| `lib/supabase/client.ts` | `createBrowserClient<Database>(...)` 부착. 주석 정리 |
| `lib/supabase/middleware.ts` | `createServerClient<Database>(...)` 부착 |
| `lib/supabase/log.repo.ts` | 손으로 쓴 `type Row` 제거 → `Database["public"]["Tables"]["logs"]["Row"]` / `Insert` 파생 사용. `insert()` 인자에 `LogInsert` 타입 명시 |
| `package.json` | `types:gen` 스크립트 추가 (`npx supabase gen types typescript --project-id sservosnoklqcrbzreoq > types/database.ts`) |

### 패키지 추가
- 없음 (CLI 는 `npx supabase` 로 일회성 실행, devDependency 추가 안 함)

---

## 2. 핵심 결정 사항

### 결정 ① CLI 도구 제공 방식: `npx supabase` (글로벌 설치 / devDependency 미사용)

**선택**: `package.json` 의 `types:gen` 스크립트에서 `npx supabase` 로 호출.

**왜 글로벌 설치 안 했나**:
- 글로벌 설치는 사용자 환경마다 버전 차이 발생 → 자동생성 결과 미세 차이 가능. CI 재현성 ↓.
- `npx supabase` 는 매번 동일 버전을 보장 + 새 머신에서 별도 셋업 불필요.

**왜 devDependency 도 안 넣었나**:
- Supabase CLI 는 npm 외에도 Scoop / Homebrew / 직접 다운로드 방식이 공식 지원되며, 머신마다 선호가 갈림.
- devDependency 로 박으면 `npm install` 시마다 ~50MB 바이너리 다운로드 → 첫 install 비용 ↑ + CI 캐시 무거워짐.
- types 자동생성은 "마이그레이션 직후" 만 실행되는 비빈번 작업이라 매 install 비용은 부적절.

**대안**: `supabase` 를 `devDependencies` 에 추가. 향후 마이그레이션이 잦아지고 팀이 커지면 도입 검토 가치 있음.

### 결정 ② `<Database>` 부착의 타이밍: 수동 `database.ts` 정비 후 부착 → 자동생성으로 교체

**선택**: 두 단계로 진행.
1. 수동 `database.ts` 를 자동생성 결과 형태로 미리 정비 (`Relationships: []`, `CompositeTypes` 등 추가)
2. 3개 클라이언트 + log.repo 에 `<Database>` 부착 + verify 통과 확인
3. 사용자가 `npm run types:gen` 실행 → 자동생성 결과로 덮어씀 → verify 재통과

**왜 두 단계로**:
- Round 1 의 수동 `database.ts` 가 `GenericSchema` 와 호환 안 됨 (`Relationships` 누락). 그대로 부착하면 `tsc` 가 깨짐.
- 자동생성을 먼저 돌리려면 사용자 로컬에서 `supabase login` 필요 → 대화형 인증이라 코드 작업과 분리해야 함.
- 코드 작업 (1, 2 단계) 을 먼저 끝내고 verify 통과 → 사용자는 그저 명령 한 번 실행 → 결과 동일 형태로 덮어쓰기 → 자연스러운 무중단 전환.

**검증된 호환성**:
- 수동 정비본의 `logs` 슬롯 모양과 자동생성 결과의 `logs` 슬롯이 정확히 일치 (Row/Insert/Update 의 컬럼명/optional 여부 동일).
- 자동생성이 추가한 `__InternalSupabase`, 헬퍼 타입(`Tables<>` 등), `Constants` value 는 우리 코드가 사용하지 않음 → 영향 0.

### 결정 ③ log.repo 에서 `Database` 파생 타입 사용 (도메인 타입은 보존)

**선택**:

```ts
type LogRow = Database["public"]["Tables"]["logs"]["Row"];
type LogInsert = Database["public"]["Tables"]["logs"]["Insert"];

const payload: LogInsert = { user_id: ..., raw: ..., ... };
await supabase.from("logs").insert(payload);
```

**왜 도메인 타입(`Log`) 을 없애지 않았나**:
- `Log` (camelCase) 는 서비스/UI 가 쓰는 타입. `LogRow` (snake_case) 는 DB 경계 한정.
- 두 표기를 혼용하면 코드 가독성 악화 — UI 에서 `log.user_id` 를 쓰면 컨벤션 깨짐.
- repo 의 `rowToDomain` 매퍼는 그대로 유지. 단, 입력 타입이 이제 `LogRow` (typed) 라 매핑 코드가 컴파일러 검증 대상.

**왜 `LogInsert` 타입을 명시 변수에 잡았나**:
- 인라인 객체 리터럴로 `insert({...})` 에 직접 넘기면, TypeScript 의 "excess property check" 가 동작해 오타가 즉시 잡힘 (그게 우리가 원하는 것).
- `const payload: LogInsert = {...}` 식으로 잡아두면 그 변수 자체에서도 타입 에러가 나면서 추가로 변수 재사용 시 안전 — 중간 가공 (예: 향후 `payload.created_at = ...`) 시 타입 보존.
- 하나의 패턴으로 통일 → 새 repo 추가 시 동일 형식 차용.

### 결정 ④ Project Ref 를 `package.json` 스크립트에 직접 박음

**선택**: `"types:gen": "npx supabase gen types typescript --project-id sservosnoklqcrbzreoq > types/database.ts"`

**왜 환경변수가 아닌 인라인**:
- Project Ref 는 비밀 정보 아님 (URL 의 일부, 클라이언트 노출됨). `.env` 에 둘 이유 없음.
- 누구든 `npm run types:gen` 한 줄로 실행 가능 → 셋업 단계 1개 절감.
- 운영 / 스테이지 분리 시점에 ref 가 늘면 그때 `types:gen:dev`, `types:gen:prod` 로 분기 검토.

**대안**: `--project-id $PROJECT_REF` + `.env` 의 `PROJECT_REF`. 셋업 단계 추가 + 셸별 변수 참조 문법 차이 (cmd `%VAR%` vs bash `$VAR`) 로 크로스 플랫폼 부담 ↑.

### 결정 ⑤ Supabase 자동생성 결과의 헬퍼 타입(`Tables<>`, `Constants`) 은 손대지 않고 그대로 유지

**선택**: 자동생성이 추가한 `Tables<>`, `TablesInsert<>`, `TablesUpdate<>`, `Enums<>`, `CompositeTypes<>` 타입 헬퍼와 `Constants` value 를 삭제하지 않고 유지.

**왜**:
- 우리 코드는 현재 안 쓰지만, **Supabase 가 매번 자동생성하는 결과의 일부** — 삭제하면 다음 `types:gen` 실행 때 다시 추가됨 → diff noise.
- Stage 4 (reports 테이블 추가) 시 `Tables<"reports">` 같은 헬퍼가 자연스럽게 사용 가능.
- 미사용 export 가 부담되지 않음 — TypeScript 가 사용처 없는 타입은 번들에 포함 안 함, 런타임 영향 0.

**향후**: `Constants` value 만은 런타임 객체라 일정량 번들 영향. 비대해지면 별도 분리 검토.

---

## 3. 진행 중 Q&A

사용자가 단계 진행 중 던진 개념 질문 3개. 답변 원본은 `qa-stage2-supabase-types.md` 에 보관.

| # | 질문 | 핵심 응답 요약 |
|---|---|---|
| 1 | "Supabase 타입 자동생성 + 제네릭 재부착 이 작업은 왜 필요한거야?" | 수동 `database.ts` 의 schema drift 위험 + 클라이언트 제네릭 미부착으로 컬럼명 오타/누락이 컴파일 통과되는 문제. `types:gen` + `<Database>` 부착으로 모두 해결. CLAUDE.md §15.4 작업 순서의 전제 |
| 2 | "database.ts vs domain.ts? string 타입인데 뭐가 문제? 화면 입력값 타입이 다른 거?" | DB row(`snake_case`) vs 도메인(`camelCase`) — 같은 데이터의 두 표기. 값 타입은 거의 다 string 으로 호환. 문제는 키 이름 오타와 누락. repo 가 경계 매퍼 |
| 3 | "log.repo 가 매핑하는데 제네릭 없으면 빌드 통과 → 데이터 삽입 시 DB 오류?" | 정확. 단 "DB 연결 안 됨" 이 아니라 "TS 컴파일러와 DB 스키마 사이 연결 끊김". 런타임 HTTP 연결은 정상, 컴파일 타임 검증만 부재 |

**의의**: Stage 1 의 인프라 (Redis) 질문 흐름과 달리, 이번엔 **타입 시스템과 DB 의 추상화 경계** 가 주제. 사용자가 "값 vs 키 이름 vs 컴파일 타임" 의 차이를 정확히 분리해 이해함 → Stage 4 의 새 reports 테이블 추가 작업이 한층 매끄럽게 진행될 토대.

---

## 4. 검증 (DoD)

| 항목 | 결과 | 검증 방법 |
|---|---|---|
| `npm run types:gen` 으로 `types/database.ts` 자동 갱신 동작 | ✅ | 사용자가 `npx supabase login` + `npm run types:gen` 실행 → 파일이 자동생성 결과로 덮어씌워짐. `__InternalSupabase`, 헬퍼 타입, `Constants` 추가 확인 |
| `from("logs")` insert/select 가 typed (`Database` 파생 추론) | ✅ | `lib/supabase/log.repo.ts:6-7` 의 `LogRow`/`LogInsert` 가 `Database["public"]["Tables"]["logs"]["Row"]`/`["Insert"]` 에서 추론됨 |
| 잘못된 컬럼명 사용 시 컴파일 에러 | ✅ | 임시 `__type_check_only.ts` 파일에 `user_idd` 오타 삽입 후 `tsc --noEmit` → `error TS2769: ... 'user_idd' does not exist ... Did you mean to write 'user_id'?` 출력 확인 후 파일 삭제 |
| `npm run verify` 통과 | ✅ | typecheck (exit 0) + lint (No warnings) + test (5 files / 25 tests / 1.48s). `types:gen` 실행 후에도 동일 통과 |

**자동생성 후 코드 호환성**:
- 자동생성 결과의 `logs` 슬롯 모양(Row/Insert/Update 컬럼명·optional 여부) 이 우리 사전 정비본과 정확히 일치 → log.repo 의 `LogRow`/`LogInsert` 파생이 그대로 유효.
- 자동생성이 추가한 `__InternalSupabase` 는 supabase-js 가 알아서 처리 → 우리 코드가 신경 쓸 필요 없음.

---

## 5. 다음 단계로 넘기는 메모

### 부채 / 의도적 보류

- **마이그레이션 후 자동 갱신** — 지금은 수동 `npm run types:gen` 실행. 향후 `supabase migration up` 명령과 묶거나 git pre-commit / CI 단계에서 강제 검토. 잊으면 schema drift 재발 가능.
- **헬퍼 타입(`Tables<>`, `Constants`) 활용** — 자동생성이 제공했지만 현재 코드 미사용. Stage 4 의 `reports` 테이블 추가 시 `Tables<"reports">` 패턴으로 일관성 있게 도입 검토.
- **DB 마이그레이션 파일과 타입 동기화 검증 자동화 부재** — 누군가 마이그레이션 작성 후 `types:gen` 안 돌려도 PR 머지 가능. Stage 7 (CI) 에서 `types:gen` → diff 검증 단계 추가 검토.

### 후속 단계 영향

- **Stage 3 (npm audit 정리)** — 의존성 업그레이드 시 `@supabase/ssr` 또는 `@supabase/supabase-js` 의 메이저 버전이 올라가면 `Database` 호환성 재확인 필요. 현재 부착이 잘 동작하는 시점이 베이스라인.
- **Stage 4 (리포트 캐싱 — 새 `reports` 테이블)** — 마이그레이션 작성 → `npm run types:gen` 실행 → `reports` 슬롯이 `Database["public"]["Tables"]` 에 자동 등장 → repo 가 `ReportRow`/`ReportInsert` 파생 사용. **이번 단계가 정확히 Stage 4 의 디딤돌.**
- **Stage 8 (운영 배포)** — 운영용 Supabase 프로젝트가 분리되면 `package.json` 의 `types:gen` 스크립트 ref 도 분리 필요 (`types:gen:dev`, `types:gen:prod`). 운영 마이그레이션 후엔 운영 ref 로 자동생성해 dev 코드와 동기화.

### 한 줄 요약

**DB 스키마와 TS 타입이 동일한 진실을 본다** — `npm run types:gen` 한 줄로 동기화 가능, `<Database>` 제네릭이 모든 SQL 호출의 컬럼명/필수 필드를 컴파일 타임에 검증. CLAUDE.md §15.4 작업 순서 ("타입 → 스키마 → 서비스 → 라우트 → UI → 테스트") 의 첫 단계가 비로소 안정적 기반이 됨. Stage 4 (새 테이블) 부터 자연스러운 흐름으로 진입.
