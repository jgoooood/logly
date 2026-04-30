# Stage 2 — DB 스키마 + RLS 마이그레이션

**완료일**: 2026-04-30
**상태**: ✅ 완료
**목표**: `logs` 테이블과 RLS 정책을 마이그레이션 파일로 도입. 이후 단계의 DB 기반.

---

## 1. 구현 결과

### 신규 파일

| 경로 | 역할 |
|---|---|
| `supabase/migrations/0001_init.sql` | `logs` 테이블 + 인덱스 + RLS 4종 정책 (select/insert/update/delete own) |
| `types/domain.ts` | `Log`, `TransformResult`, `TransformKind` 도메인 타입 |
| `types/database.ts` | Supabase row 타입 (수동 stub, CLI 자동생성으로 전환 권장 주석 포함) |

### 수정 파일 (Supabase 키 체계 swap)

| 파일 | 변경 |
|---|---|
| `.env.local` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` → `SUPABASE_SECRET_KEY` |
| `.env.example` | 동일 키 명칭 + Groq 형식 반영 |
| `lib/supabase.ts` | env 변수명 신규 체계 일치 |
| `IMPLEMENTATION.md` | Stage 1 메모 + Stage 3 DoD 참조 갱신 |

### 패키지 변경
- 없음. SQL 마이그레이션 + 타입 파일만 추가.

---

## 2. 핵심 결정 사항

### 결정 ① RLS 정책: 본인 데이터만, 4종 모두 명시

**선택**: `auth.uid() = user_id` 조건의 select / insert / update / delete 정책 4개.

```sql
alter table public.logs enable row level security;

create policy "logs_select_own" on public.logs for select  using (auth.uid() = user_id);
create policy "logs_insert_own" on public.logs for insert  with check (auth.uid() = user_id);
create policy "logs_update_own" on public.logs for update  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "logs_delete_own" on public.logs for delete  using (auth.uid() = user_id);
```

**왜 4종 모두 명시하나** (CRUD 통합 정책 하나가 아니라):
- Postgres RLS는 정책이 **명시되지 않으면 차단**. select만 정의하면 insert는 막힘.
- 명시적으로 분리해야 나중에 "본인 데이터만 select 되지만 update는 admin도 허용" 같은 변경 시 정책별 수정이 쉬움.
- DoD의 "RLS 정책 4종 포함" 검증과 1:1 대응 → 마이그레이션 적용 후 `pg_policies`로 4행 확인 자동화 가능.

**왜 select에 `with check`가 없나**: select에는 정책상 의미가 없음 (`using` 만 적용). insert/update에만 `with check` 필수.

**왜 인덱스를 `(user_id, created_at desc)` 로 만드나**:
- 거의 모든 쿼리가 "내가 쓴 로그를 최신순으로" 패턴.
- 단일 컬럼 user_id 인덱스만 있으면 정렬 시 별도 sort 발생.
- 복합 인덱스 + DESC 순서 매칭 → covering 가능.

### 결정 ② Supabase 키 체계: 신규(Publishable + Secret) 채택

**선택**: legacy(`anon`/`service_role` JWT) 대신 신규(`sb_publishable_*`/`sb_secret_*`) 사용.

**대안**: legacy 그대로 유지 → 단계 진행 빠름.

**왜 신규로 가나** (사용자 직접 결정 — "어차피 바꿀 거면 처음부터 신규로"):
- legacy는 단계적 deprecate 예정. 어차피 마이그레이션 들어옴 → 부채 누적.
- 두 체계는 기능 차이 0. `@supabase/ssr`을 포함한 SDK 모두 양쪽 지원.
- 새 프로젝트 시작 시점이 명칭 통일의 가장 저렴한 타이밍.

**비용**: env 변수명/사용 코드 4파일 동시 갱신 → 한 번의 작업으로 끝남.

**향후 영향**: 모든 후속 단계가 신규 체계 기준으로 작성됨. 외부 튜토리얼/문서가 legacy 명칭을 쓰면 사용자가 직접 매핑해야 함. 매핑 표를 IMPLEMENTATION.md에 잠시 보존.

### 결정 ③ `types/database.ts` 수동 stub

**선택**: `logs` 테이블만 수동으로 타입 작성.

**대안**: `supabase gen types typescript --project-id <id>` CLI 자동 생성.

**왜 수동인가**:
- CLI 설치 + 인증 셋업 비용 > 테이블 1개 수동 작성 비용 (현재 시점)
- Supabase CLI는 추후 마이그레이션 자동 적용에도 쓰이므로 별도 단계로 의도적으로 미룸 → 도입 시 한 번에 효과 본다.
- 파일 상단 주석으로 "CLI 자동생성 권장" 명시 → 망각 방지.

**향후 영향**: 두 번째 테이블 추가 시 자동화 도입 권장 (Stage 5의 logs 외 테이블 또는 별도 인프라 단계).

---

## 3. 진행 중 Q&A

### Q1. 구글 로그인 vs GitHub 로그인 (Supabase 가입용)

기능 차이 없음. **GitHub이 살짝 유리**:
- 코드 푸시 + Vercel 자동 배포 시 같은 계정으로 묶임
- 이 프로젝트를 GitHub 레포로 올릴 가능성 → 자연스러움

이미 가입된 계정 있으면 그쪽으로 충분. 나중에 다른 OAuth 추가 연결도 가능.

### Q2. GitHub Organization 생성해야 돼?

**필요 없음.** 개인 계정으로 충분.

| 시점 | Org 필요 |
|---|---|
| 솔로 개발 / MVP | ❌ |
| 협업자 2명 이상 | ✅ |
| 회사/팀 명의 분리 | ✅ |
| 팀 단위 결제 | ✅ |

나중에 필요해지면 개인 레포 → Org로 transfer 가능. 처음부터 만들 필요 없음.

### Q3. Supabase에서 Organization 만들라는데 무조건이야?

**다른 개념**. 이건 Supabase 내부의 "프로젝트 묶음 + 청구 단위"이고 GitHub Organization과 무관.

| | Supabase Organization | GitHub Organization |
|---|---|---|
| 만드는 곳 | Supabase 대시보드 | github.com |
| 의미 | 프로젝트 그룹 + 청구 | 코드 레포 그룹 + 멤버 |
| 비용 | 무료 (Free tier) | 무료 (개인) |
| Logly에 필요 | ✅ 모든 프로젝트가 어느 Org에 속해야 함 | ❌ |

`logly` 같은 라벨로 만들고 Free 플랜 선택하면 끝.

### Q4. 보안 체크박스 3개 있는데 RLS 켜야 돼?

**RLS는 무조건 ✅**. CLAUDE.md §9.2 강제. 사용자별 데이터 격리의 마지막 방어선.

다른 두 개는 항목 이름에 따라:
- "Enforce SSL on connections" → ✅ 항상
- "Restrict network access / IP allowlist" → ⚠️ dev에선 ❌ (외부에서 로컬 dev 서버 접근 막힐 수 있음)
- "Enable PITR" → 유료 기능, ❌

기본값으로 RLS만 ✅ 켜고 나머지는 default. 문제 발생 시 그때 조정.

### Q5. API Keys 화면 PUBLISHABLE vs LEGACY 차이?

| | Publishable (신규) | Legacy (구) |
|---|---|---|
| Public 키 | `sb_publishable_...` | `anon` (긴 JWT) |
| Secret 키 | `sb_secret_...` | `service_role` (긴 JWT) |
| 발급 방식 | 여러 개 발급/회전 가능 | 프로젝트당 1개씩 고정 |
| Supabase 권장 | ✅ 신규 프로젝트 | 점진적 deprecate |
| 동작 | 둘 다 정상 동작 | 둘 다 정상 동작 |

→ 위 §2 결정 ② 참조. 신규 채택.

### Q6. 어차피 바꿀 거면 처음부터 신규?

사용자 의견 반영. `.env.local`/`.env.example`/`lib/supabase.ts`/`IMPLEMENTATION.md` 일괄 변경.

---

## 4. 검증 (DoD)

| 항목 | 결과 | 검증 방법 |
|---|---|---|
| 마이그레이션 파일 존재 + RLS 4종 포함 | ✅ | 파일 작성 |
| Supabase에 마이그레이션 적용됨 | ✅ | SQL Editor → Run → "Success" |
| `types/domain.ts` Log/TransformResult export | ✅ | 파일 작성 + tsc 통과 |
| 격리 검증 (익명 select 0건) | ✅ | `select count(*) from public.logs;` → `0` |

추가 검증:
- `information_schema.columns` → 컬럼 7개 확인
- `pg_policies` → 정책 4개 확인

---

## 5. 다음 단계로 넘기는 메모

### Stage 3에 직접 영향
- 인증 도입 후 사용자별 로그 격리는 **Stage 5에서 사용자 단위로 재검증** 필요. 현재는 익명 0건만 확인됨.
- `lib/supabase.ts` 단일 파일은 **Stage 3에서 `lib/supabase/{client,server,middleware}.ts` 로 분해** 예정. 지금 형태는 임시.

### 자동화 부채
- DB 스키마 변경 시 새 migration 파일 추가 (`0002_*.sql`). 0001 직접 수정 금지.
- types/database.ts 자동생성 도입 시점: 2번째 테이블 추가 또는 Stage 5.

### 보안 메모
- Service Role Key (현재 `SUPABASE_SECRET_KEY`) 는 **클라이언트 번들 진입 절대 금지**. Stage 3 빌드 검증에서 grep 검사 추가됨.
