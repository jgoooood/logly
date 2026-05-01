# Q&A — Stage 2 (Supabase 타입 자동생성 + 제네릭 재부착) 학습 노트

Round 2 Stage 2 진행 중 사용자가 던진 개념 질문과 그에 대한 답변 원본.
- 작성 시점: 2026-05-01
- 단계 상태: 🟡 진행 중
- stage 완료 기록(`02-supabase-types.md`, 추후 작성)과 별도. 학습/참조용.

---

## Q1. Supabase 타입 자동생성 + 제네릭 재부착 이 작업은 왜 필요한거야?

### 한 줄 요약

**"DB 스키마와 코드 타입이 따로 노는 상태" 를 끝낸다.**
지금은 둘이 손으로 동기화 → 사람 실수 + 컴파일러가 잡아주지 못함.
이 단계 후에는 DB 스키마가 곧 코드 타입 → 컴파일러가 모든 SQL 호출을 검증.

---

### 현재 상태 — 두 개의 문제가 한 묶음

#### 문제 1. `types/database.ts` 가 손으로 쓴 거

```ts
// 이 파일은 사람이 직접 적은 것 — DB 의 진실과 동기화된다는 보장이 없음
export type Database = {
  public: {
    Tables: {
      logs: {
        Row: {
          id: string;
          user_id: string;
          raw: string;
          ...
```

**위험**: 누가 마이그레이션으로 컬럼을 추가하거나(`logs.tags text[]`), 이름을 바꾸면(`raw → log_text`), 이 파일은 그대로 — 컴파일러는 모름.

런타임에 `Cannot find column 'log_text'` 에러로 터짐 (Supabase 가 500 반환).

#### 문제 2. 그나마 있는 타입도 클라이언트에 "부착" 안 돼 있음

`lib/supabase/server.ts:8`:

```ts
return createServerClient(   // ← <Database> 제네릭 없음
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    ...
);
```

이게 "제네릭 재부착" 이 의미하는 부분. 정상이라면:

```ts
return createServerClient<Database>(   // ← 이렇게 부착돼야
    ...
);
```

**부착 안 됐을 때 일어나는 일** — `lib/supabase/log.repo.ts` 를 보면:

```ts
// line 19-27: 이 type Row 는 왜 여기 또 있는가?
type Row = {
  id: string;
  user_id: string;
  raw: string;
  ...
};
```

→ `database.ts` 에 이미 똑같은 게 있는데 **여기서 또 손으로 적음**. 왜? 클라이언트에 제네릭이 안 붙어 있어서 `supabase.from("logs").select(...)` 의 반환 타입이 그냥 `any` 비슷한 모양이라 — 안전을 확보하려면 repo 안에서 한 번 더 손으로 타입을 베껴 써야 함.

```ts
// line 44: insert 시 컬럼명 오타 나도 컴파일러가 모름
await supabase.from("logs").insert({
  user_id: args.userId,   // ← "userid" 라고 쳐도 컴파일 통과. 런타임에서야 폭발
  ...
});

// line 63: select 컬럼 문자열도 검증 안 됨
.select("id, user_id, raw, achievement, resume, interview, created_at")
//        ↑ 여기 "user_idd" 오타 내도 컴파일 통과
```

---

### 그래서 이 단계가 하는 일 두 가지

#### 작업 A — 자동생성으로 교체

```bash
supabase gen types typescript --project-id <REF> > types/database.ts
```

**Supabase CLI 가 운영 DB 의 실제 스키마를 읽어서 `Database` 타입을 만들어 덮어씀.**

- 컬럼 1개 추가? → 명령 한 번 → 타입 즉시 반영
- 컬럼명 변경? → 명령 한 번 → 옛 이름 쓰는 코드는 즉시 컴파일 에러
- enum, view, function 까지 다 나옴 (수동 작성으로는 거의 불가능)

`package.json` 에 `"types:gen": "supabase gen types ..."` 스크립트로 박아두면 누구나 한 줄로 갱신.

#### 작업 B — 클라이언트에 `<Database>` 제네릭 부착

```ts
// before
createServerClient(url, key, opts)
createBrowserClient(url, key)

// after
createServerClient<Database>(url, key, opts)
createBrowserClient<Database>(url, key)
```

이 한 글자 추가가 다음을 활성화:

```ts
// repo 안에서 이게 가능해짐
const { data } = await supabase.from("logs").select("*");
//                                  ↑ 자동완성됨 (logs / reports / ... 만)
//      data 의 타입은 자동으로 logs.Row[]
//      "user_idd" 같은 오타는 컴파일 에러
```

→ `log.repo.ts` 의 손으로 쓴 `type Row = {...}` 도 삭제 가능 (`Database['public']['Tables']['logs']['Row']` 으로 추론).

---

### 비교 — 같은 실수 시나리오

마이그레이션으로 `logs.tags text[]` 컬럼 추가했는데 누군가 코드 갱신 깜빡함.

| 단계 | 지금 (수동) | 자동생성 + 제네릭 부착 후 |
|---|---|---|
| 코드에서 `tags` 사용 시도 | 손으로 `database.ts` 갱신해야 함. 안 하면 `tags` 가 타입에 없음 | `npm run types:gen` 한 번 → 즉시 사용 가능 |
| 오타 `tagss` | 컴파일 통과 → 런타임 에러 | 컴파일 에러 → 머지 차단 |
| insert 시 필수 컬럼 누락 | 컴파일 통과 → 런타임 NULL constraint 에러 | 컴파일 에러 |
| `select("created_t")` 오타 | 컴파일 통과 → 런타임 빈 결과 | 컴파일 에러 |

---

### 왜 Stage 1 이 아니라 지금인가

CLAUDE.md §15.4 의 작업 순서: **"타입 → 스키마 → 서비스 → 라우트 → UI → 테스트"**.

Round 1 에서는 supabase-js v2.45 + 수동 타입의 호환 문제로 이걸 일단 후순위로 미뤘음 (`types/database.ts` 주석 1줄에 "후속 단계에서 CLI 자동 생성으로 교체" 라고 명시돼 있음).

**왜 지금**:
- Stage 4 (리포트 캐싱 — 새 `reports` 테이블) 이 곧 등장. 새 테이블/컬럼 만들 때 자동 생성이 켜져 있어야 자연스럽게 사용 가능 → IMPLEMENTATION2.md 의존성 표 에서 "Stage 2 권장 → Stage 4" 인 이유.
- 운영 배포 전 마지막 정리. 운영 후엔 스키마 변경 빈도가 늘어남 → 수동 동기화가 더 위험해짐.

---

### 비유로 정리

- **수동 `database.ts`** = 종이 메뉴판. 주방에서 메뉴 바꿔도 홀에 안 알려주면 손님은 옛 메뉴 시킴 → 주방에서 "그거 없는데요" 라고 답 (= 런타임 에러).
- **자동생성 + 제네릭 부착** = 주방 POS 시스템과 홀 태블릿이 직결. 메뉴 바꾸면 즉시 홀 화면 갱신. 손님이 없는 메뉴 시킬 수가 없음 (= 컴파일 에러로 사전 차단).

---

## Q2. database.ts이건 뭐고 domain.ts이건 뭔데? 그리고 지금 타입이 string으로 선언된거 아니야? 화면에서 입력받은 값이 db에 저장될 때 데이터 타입이 다르다는거야?

### 1. `database.ts` vs `domain.ts` — 같은 데이터의 두 얼굴

같은 "로그 한 건" 인데 **이름 표기 규칙이 다릅니다.**

| `types/database.ts` (DB row) | `types/domain.ts` (도메인) |
|---|---|
| `user_id` (snake_case) | `userId` (camelCase) |
| `created_at` | `createdAt` |
| Postgres 컬럼명 그대로 | JS/TS 컨벤션 그대로 |

```ts
// database.ts ─ DB가 보는 모양
type Row = { user_id: string; created_at: string; ... }

// domain.ts ─ 우리 코드가 쓰는 모양
type Log = { userId: string; createdAt: string; ... }
```

#### 왜 두 개인가 — "경계(boundary)" 패턴

**경계**: DB ↔ 우리 코드 사이의 번역 지점.

`log.repo.ts:29` 의 `rowToDomain` 함수가 그 번역가입니다:

```ts
function rowToDomain(row: Row): Log {
  return {
    id: row.id,
    userId: row.user_id,        // ← snake → camel
    raw: row.raw,
    ...
    createdAt: row.created_at,  // ← snake → camel
  };
}
```

**왜 굳이 번역**:
- Postgres 관례 = snake_case (DB 세계의 표준)
- JS/TS 관례 = camelCase (`React useEffect`, `Date.toISOString` 등 모두 카멜)
- 한 쪽으로 통일하면 다른 쪽이 어색해짐 → 경계에서 한 번만 변환

→ **컴포넌트는 `Log` 만 본다. DB는 `Row` 만 본다. repo 가 다리.** 이게 CLAUDE.md §2.3 의 레이어 책임 설계.

---

### 2. "전부 string 인데 뭐가 문제야?"

**핵심**: 우려 대상은 **값(value) 타입** 이 아니라 **이름(key)** 과 **누락** 입니다. 값은 사실 거의 다 string 으로 잘 맞습니다 (Postgres timestamp 도 Supabase JSON 응답에선 ISO 문자열로 옴). 두 종류로 구분해서 다시 설명.

#### 위험 1. 컬럼명 오타 — 컴파일러가 못 잡음

`log.repo.ts:44`:

```ts
await supabase.from("logs").insert({
  user_id: args.userId,
  raw: args.raw,
  ...
});
```

지금은 클라이언트에 `<Database>` 제네릭이 안 붙어 있어서, `insert(...)` 인자의 키 이름이 **`any` 비슷한 상태**입니다. 그래서:

```ts
await supabase.from("logs").insert({
  user_idd: args.userId,   // ← 오타. 컴파일 통과
  raw: args.raw,
  ...
});
```

**컴파일은 통과합니다.** 런타임에 Supabase 가 "그런 컬럼 없는데요" 500 응답 → 변환은 잘 됐는데 저장만 실패 → 사용자가 변환 결과 보긴 했는데 다시 보니 사라진 상황.

`<Database>` 제네릭 부착 후:

```ts
await supabase.from("logs").insert({
  user_idd: args.userId,
  //  ↑ 컴파일 에러: "user_idd" does not exist on type "logs.Insert"
});
```

→ **빌드 단계에서 막힘.** 타입스크립트의 본분.

#### 위험 2. 필수 컬럼 누락

```ts
await supabase.from("logs").insert({
  user_id: args.userId,
  raw: args.raw,
  // achievement 빠뜨림
});
```

지금: 컴파일 통과 → 런타임 NOT NULL 에러.
부착 후: 컴파일 에러 (`achievement` is required).

#### 위험 3. 스키마가 바뀔 때

이게 진짜 큰 차이. **Stage 4 에서 `reports` 테이블이 생기고, Stage 4 이후 어떤 컬럼이 추가/변경/삭제될 수 있음.**

지금 (수동):
- 마이그레이션 작성 → SQL 실행 → `database.ts` 손으로 갱신 → 까먹으면 끝
- 타입은 옛날 모양인데 DB 는 새 모양 → 이름 충돌 / 새 컬럼 못 씀

자동생성 후:
```bash
npm run types:gen
```
- Supabase 가 실제 DB 를 읽어서 `database.ts` 다시 씀
- 새 컬럼은 즉시 자동완성에 등장
- 사라진 컬럼은 즉시 컴파일 에러로 표시

---

### 3. "화면 입력값이 DB 저장될 때 데이터 타입이 다른 거냐?"

**아닙니다. 값 자체는 같은 타입(거의 다 string)이라 흘러가는 데 문제 없습니다.**

흐름을 따라가 보면:

```
[사용자 입력]
  raw: "API 응답 캐싱 적용"   (string)
        │
        ▼
[Server Action / API Route]
  zod 검증: z.string().trim().min(1).max(500)
        │
        ▼
[transform.service]
  Log domain shape: { raw: string, achievement: string, ... }
        │
        ▼
[log.repo.insert]
  ↓ rowToDomain 의 반대 방향: camelCase → snake_case 키 변환
  {
    user_id: "u123",      ← string
    raw: "API ...",        ← string
    achievement: "...",    ← string (AI 결과)
    resume: "...",         ← string
    interview: "...",      ← string
  }
        │
        ▼
[Postgres logs 테이블]
  user_id uuid, raw text, achievement text, ...
```

**값 타입**: string (TS) ↔ uuid/text (Postgres). Supabase 가 자동 변환 — string 으로 보내면 uuid 컬럼에 잘 들어감 (UUID 포맷이면).

**다른 건 키 이름의 표기**: `userId` (TS 코드) ↔ `user_id` (DB). repo 가 변환.

→ **"데이터 타입이 다른" 게 아니라 "키 이름 표기 규칙이 다른" 것**. 그리고 자동생성 + 제네릭 부착이 해결하는 건 그 변환 지점에서 **오타/누락을 컴파일러가 자동 검증해주게 만드는 것**.

---

### 한 그림으로

```
[ 사용자 화면 ]
  string 입력
       │
       ▼ (zod 검증: 길이/형식만 확인)
[ 도메인 (domain.ts) ]
  Log { userId, raw, createdAt, ... }   ← camelCase
       │
       ▼ (repo 가 변환)
[ DB row (database.ts) ]
  Row { user_id, raw, created_at, ... } ← snake_case
       │
       ▼ (Supabase 가 SQL 발행)
[ Postgres ]
  uuid, text, timestamptz, ...
```

- **화면 ↔ 도메인 ↔ DB row 사이에서 값은 큰 변환 없이 흘러감**
- 변환되는 건 키 이름 표기 (camel ↔ snake)
- 자동생성 + 제네릭 부착이 추가하는 가치 = **이 변환 지점들의 오타/누락을 컴파일러가 잡음**

---

## Q3. 지금 화면에서 받은 값을 실제 db컬럼에 매핑하는 작업을 log.repo가 담당하는데, 이때 database라는 제네릭을 사용하지 않으면 db랑 실질적인 연결이 안돼서 빌드는 성공해서 추후 데이터 삽입 작업 시 db오류 난다는거지?

네, 거의 정확합니다. 표현 한 부분만 살짝 다듬으면 끝.

### 맞습니다

> log.repo 가 화면값을 DB 컬럼으로 매핑하는 담당
> `<Database>` 제네릭 없으면 그 매핑이 컴파일 단계에서 검증 안 됨
> → 빌드는 통과
> → 데이터 삽입 시 DB 오류로 폭발

**핵심 흐름 그대로.**

### 한 곳만 정확히

> "DB랑 실질적인 연결이 안돼서"

여기는 살짝 어감 다듬어야 정확.

**런타임 연결 자체는 잘 됩니다** — Supabase 클라이언트가 HTTP 요청 보내고 응답 받는 건 정상 작동. URL, 키, 인증 다 살아 있음.

빠져 있는 건 **TS 컴파일러와 DB 스키마 사이의 연결**.

```
런타임 연결 (HTTP):       지금도 작동 ✅
컴파일 타임 연결 (타입):  현재 끊어짐 ❌  ← 이걸 잇는 게 이번 단계
```

비유:

- **런타임 연결** = 배달 기사가 식당에 잘 도착함
- **컴파일 연결** = 주문서에 적힌 메뉴가 그 식당 메뉴인지 사전 검증
- 지금: 주문서 검증 없이 기사가 출발 → 식당 도착해서 "그 메뉴 없는데요" 듣고 빈손 복귀 (= 런타임 DB 오류)
- 부착 후: 주문서 단계에서 메뉴판과 대조 → 없는 메뉴 입력 시 주문 자체가 거절 (= 컴파일 에러)

### 정리

> "**`<Database>` 제네릭 없으면 TS 컴파일러가 DB 스키마를 모르는 상태라, repo 의 컬럼 매핑 코드에 오타/누락이 있어도 빌드는 통과 → 실제 INSERT 호출 때 Supabase 가 DB 오류로 응답한다.**"

이렇게 다듬으면 100% 정확.

---

## Q4. 방금 supabase cli로 npm명령어 3번 날린거는 뭐때문에 그런거야? 그리고 next.js + supabase는 db 컬럼값을 보통 cli로 불러오는게 일반적이야?

### 1. 방금 친 3개 명령의 역할

```
1) npx supabase login
2) npm run types:gen
3) npm run verify
```

**각각이 책임지는 단계가 다릅니다.**

#### ① `npx supabase login` — 인증

```
당신의 컴퓨터  ──HTTPS──▶  Supabase 클라우드
   "로그인 좀 시켜줘"
                          ┌──── 브라우저 자동 오픈
                          │     "이 CLI 가 당신 계정에 접근해도 돼?"
                          ▼
                          [승인 클릭]
                          │
                          ▼
   ◀──── 토큰 발급
   ~/.supabase/access-token 에 저장
```

- **목적**: 다음 명령(`gen types`) 이 당신 계정의 프로젝트에 접근할 권한을 얻음
- **빈도**: 머신 한 대당 **한 번만**. 토큰이 파일에 저장되므로 다음부터는 자동 인증
- **저장 위치**: 윈도우는 보통 `C:\Users\<당신>\.supabase\access-token`
- **보안**: 이 토큰은 비밀. `.gitignore` 와 무관 (홈 디렉터리이고 프로젝트 밖)

#### ② `npm run types:gen` — 실제 타입 생성

```
package.json:
  "types:gen": "npx supabase gen types typescript --project-id sservosnoklqcrbzreoq > types/database.ts"
                ↑ supabase 가 ↑ 그 프로젝트의            ↑ TS 형태로  ↑ 우리 파일에
                  아까 받은     실제 DB 스키마를            출력         덮어씀
                  토큰으로
                  인증
```

- **목적**: Supabase 가 운영 DB 의 실제 schema 를 읽어서 → TS 타입으로 변환 → `types/database.ts` 에 덮어쓰기
- **빈도**: **마이그레이션 (DB 스키마 변경) 후에만** 실행. 코드 짜는 도중엔 안 돌림
- **결과**: 그래서 자동생성된 파일에 `__InternalSupabase`, `Tables<>`, `Constants` 등이 추가됨

#### ③ `npm run verify` — 정합성 검증

```
package.json:
  "verify": "npm run typecheck && npm run lint && npm run test"
              ↑ TS 컴파일 OK?    ↑ 코드 스타일?  ↑ 테스트 다 통과?
```

- **목적**: 새 타입 파일이 **기존 코드와 호환되는지** 확인. 자동생성 결과가 우리 코드(`log.repo.ts` 등) 가 사용하는 모양과 안 맞으면 typecheck 가 깨짐
- **빈도**: 거의 모든 커밋 직전 / 머지 직전. Round 1 의 PR 머지 게이트로 표준화됨
- **이번 의미**: "자동생성 → 코드 호환" 이 첫 시도에 통과했음 = 미리 정비해 둔 수동 `database.ts` 가 자동생성 결과와 정확히 같은 모양이었음을 검증

#### 한 줄로 흐름 정리

```
[로그인 = 권한 얻기]
       │
       ▼
[gen types = DB 보고 타입 파일 받아쓰기]
       │
       ▼
[verify = 받은 타입과 우리 코드가 잘 맞는지 확인]
```

→ 셋이 한 묶음. 하나라도 빠지면 의미 없음.

---

### 2. Next.js + Supabase 에서 CLI 로 타입 생성이 일반적이냐?

**네, 사실상 표준입니다.** Supabase 공식 권장 패턴이고, 커뮤니티에서도 거의 모든 TS 기반 프로젝트가 이 방식을 씁니다.

#### 흔한 오해 짚고 가기

> "DB 컬럼값을 CLI 로 불러온다"

**값(value) 을 불러오는 게 아니라, 스키마 (테이블/컬럼/타입의 모양) 를 불러옵니다.**

| 구분 | 방법 | 빈도 |
|---|---|---|
| **스키마 (모양)** = "logs 테이블에 어떤 컬럼이 있나" | CLI 로 한 번 받아 TS 파일에 박음 | 마이그레이션 후 1회 |
| **값 (실제 데이터)** = "user u123 의 로그 30건" | 런타임에 `supabase.from("logs").select(...)` 로 HTTPS 요청 | 매 요청마다 |

→ CLI 는 "지도 그려두기" / 런타임은 "지도 보고 길 찾기". 완전히 다른 단계.

#### 왜 CLI 가 표준이 되었나

**대안과 비교**:

| 방식 | 장점 | 단점 |
|---|---|---|
| **Supabase CLI 자동생성** ← 우리가 선택 | 공식 도구, 0 설정, Postgres 의 모든 기능 (RLS/views/RPC/enum) 반영 | CLI 설치 + 인증 필요 |
| 수동 타입 작성 | 의존 0 | 우리가 Round 1 에서 했던 것 — drift 발생, 안전성 무너짐 |
| Prisma | ORM 까지 패키지로 옴, 강력 | Supabase 와 중복 (마이그레이션 도구가 둘 됨), Auth/RLS 통합 약함 |
| Drizzle | TypeSafe SQL builder, 가벼움 | Supabase 의 RLS / Auth 와 통합 셋업 추가 필요 |
| pgTyped 등 SQL 분석기 | raw SQL 의 타입 추론 | Supabase JS 클라이언트와 어울리지 않음 (raw SQL 안 씀) |

**Supabase 공식 문서가 직접 권장**:
> The Supabase CLI provides a typescript types generator that uses your database schema as the source of truth.

(공식 가이드 _"Generating Types"_ 섹션 첫 문장)

#### 그래서 실제 현장 패턴

거의 모든 진지한 Next.js + Supabase + TS 프로젝트의 `package.json` 을 보면 똑같은 줄이 있어요:

```json
"scripts": {
  "types:gen": "supabase gen types typescript --project-id <ref> > types/database.ts"
}
```

이름만 `types:gen` / `gen-types` / `db:types` / `update-types` 로 다를 뿐, 본질은 동일.

워크플로도 동일:
1. 마이그레이션 작성
2. `supabase db push` (또는 `migration up`)
3. `npm run types:gen`
4. 코드 수정 (이제 새 컬럼이 자동완성에 등장)
5. PR

#### 한 단계 더 나아간 패턴 (참고용)

성숙한 팀은 보통 다음 두 가지를 추가:
- **CI 에서 `types:gen` 실행 후 diff 가 있으면 PR 거절** — 누가 마이그레이션 짜고 types 업데이트 안 했을 때 자동 차단
- **로컬 Supabase (`supabase start`) 에서 가져오기** — 운영 DB 가 아니라 로컬 도커 Supabase 로부터 생성. 인증 토큰 없이 작업 가능 + 운영 DB 부담 0

→ 우리는 지금 Stage 7 (CI) 에서 첫 번째 패턴 도입 검토할 수 있고, 운영 분리 (Stage 8) 시점에 두 번째 패턴 검토 가능. **현재는 운영 ref 직접 조회 방식이라 가장 단순한 단계.**

---

### 비유로 정리

- **CLI 로 타입 생성** = 건축가가 시공 현장 가서 실제 도면 그려 사무실로 가져옴 (한 번)
- **`<Database>` 제네릭 부착** = 그 도면을 사무실 벽에 붙여 모든 직원이 보게 함
- **런타임 Supabase 호출** = 직원이 도면 보고 정확한 자재를 주문 (매번)

도면 없이 직원이 "음 이 위치엔 콘크리트 같은데?" 추측해서 자재 주문하면 → 시공 단계에서 폭발 (= Round 1 의 수동 타입 + 미부착 상태). CLI 로 도면 받고 벽에 붙이면 추측이 사라짐.

---

## Q5. 보통 자바같은 경우는 db스키마를 생성 후 거기에 맞춰 별도로 자바파일을 생성하잖아. next.js는 db에서 스키마생성 후 코드로 직접 불러오는 방식이야?

핵심은 "Next.js 의 방식" 이 아니라 **"DB 와 코드 중 어느 쪽을 진실로 볼 것인가"** 의 철학 차이. 두 진영이 있고, 자바도 Next.js 도 둘 다 가지고 있음.

### 두 가지 철학

```
[ Code-First ]                    [ DB-First ]
   코드(클래스/스키마 파일)            DB 스키마(SQL)
        │                                │
        │ (도구가 자동 변환)              │ (도구가 자동 변환)
        ▼                                ▼
       DB 스키마                       타입/엔티티 코드
```

| | Code-First | DB-First |
|---|---|---|
| 진실의 출처 | 코드 | DB |
| 변경 흐름 | 코드 수정 → 마이그레이션 자동 생성 | SQL 마이그레이션 → 타입 자동 갱신 |
| 강점 | IDE 자동완성, 리팩터링 안전 | 복잡한 SQL/RLS/뷰/트리거 자유롭게 작성 |
| 약점 | 도구가 표현 못 하는 SQL 기능 (예: 복잡한 RLS) 한계 | 매번 갱신 명령 1회 필요 |

---

### 자바 진영 — 둘 다 있음

자바를 "보통 DB 만들고 자바 파일 별도 생성" 으로 기억하는 건 **JPA Entity 를 손으로 쓰는 패턴**. 그건 사실 **수동 동기화** — 우리가 Round 1 에서 했던 거랑 똑같은 부채.

자바의 실제 모습:

| 패턴 | 분류 | 자동화 |
|---|---|---|
| **JPA `@Entity`** + Hibernate `ddl-auto=update` | Code-First | 자바 클래스가 진실 → DB 자동 생성 |
| **JPA `@Entity` 손으로** + 기존 DB | 수동 동기화 | 우리 Round 1 과 동일한 부채. 컬럼 바뀌면 손으로 동기화 |
| **JOOQ** | DB-First | DB → `.java` 파일 자동 생성 (**우리가 한 것과 정확히 동일한 패턴**) |
| **MyBatis Generator** | DB-First | DB → `.xml` + VO 자동 생성 |
| **Flyway/Liquibase + JPA** | DB-First | SQL 마이그레이션이 진실 → Entity 는 그에 맞춰 작성 |

→ 한국 엔터프라이즈 자바에서 흔한 "JPA Entity 손으로 작성" 은 사실 **자동화가 빠진 변종**. JOOQ 쓰는 팀이라면 JOOQ 도 우리와 똑같이 `mvn generate-sources` 한 번으로 자바 파일 받아옴.

---

### Next.js 진영 — 여기도 둘 다 있음

Next.js 자체는 ORM 을 강제하지 않음. 어떤 패키지를 고르냐에 따라 갈림:

| 라이브러리 | 분류 | 진실 |
|---|---|---|
| **Supabase CLI gen types** ← 우리 선택 | DB-First | Supabase 가 진실, TS 타입은 그 사진 |
| **Prisma** | Code-First | `schema.prisma` 가 진실, DB 는 거울 |
| **Drizzle** | Code-First | `schema.ts` 가 진실, 마이그레이션 자동 생성 |
| **Kysely + 수동** | 수동 | TS 타입 손으로. Round 1 과 동일 |

각각의 사용 흐름:

**Supabase (우리)** — DB 먼저
```
SQL 마이그레이션 작성
   ↓
supabase db push  (DB 에 적용)
   ↓
npm run types:gen  (TS 파일 받아오기)
   ↓
코드에서 사용
```

**Prisma** — 코드 먼저
```
schema.prisma 수정 (Prisma 의 자체 DSL)
   ↓
npx prisma migrate dev  (DB 마이그레이션 자동 생성 + 적용)
   ↓
npx prisma generate  (TS 클라이언트 생성)
   ↓
코드에서 사용
```

→ 진실의 출처가 정반대.

---

### 자바 vs Next.js 직접 비교표

| 패턴 | 자바 대응 | Next.js 대응 |
|---|---|---|
| Code-First (코드가 진실) | JPA + `ddl-auto` | Prisma, Drizzle |
| DB-First 자동화 | JOOQ | **Supabase CLI gen types** ← 우리 |
| DB-First 수동 동기화 | "Entity 손으로 작성" 패턴 | Round 1 의 수동 `database.ts` |

**즉, "자바는 X, Next.js 는 Y" 가 아니라**:
- 자바에서 손으로 Entity 짰다면 → 그건 **수동 동기화**
- 우리가 Stage 2 에서 한 건 자바의 **JOOQ** 와 같은 자세
- Prisma 를 골랐다면 자바의 **JPA + ddl-auto** 와 같은 자세

---

### 그럼 왜 Supabase 는 DB-First 인가

**Supabase 의 정체성** 에서 옴.

Supabase = "**Postgres + 부가 서비스**". Postgres 가 1등 시민. Postgres 가 가진 모든 기능을 그대로 노출하는 게 셀링 포인트:

- RLS (Row Level Security) — Postgres 의 정책 시스템
- Functions / Triggers / Views — Postgres 표준
- Realtime — Postgres replication 기반
- Auth — `auth.users` 테이블 (Postgres 안)

**이걸 코드 DSL 로 표현하면 표현력 한계** 가 옴. 예를 들어 RLS 정책:

```sql
create policy "logs_select_own" on logs
  for select using (auth.uid() = user_id);
```

이걸 Prisma 의 `schema.prisma` DSL 로 적으려면? **불가능.** 그래서 Prisma 쓰는 팀도 RLS 가 필요하면 결국 raw SQL 마이그레이션을 별도로 관리.

→ Supabase 는 처음부터 **"SQL 이 진실, 코드는 거울"** 로 설계된 것. CLAUDE.md §9.2 에서 RLS 를 1등 시민으로 다루는 이유도 같음.

**반대로 Prisma 는** 단순한 CRUD 위주 + 여러 DB 호환 (MySQL, SQLite 도 지원) 이 강점이라 **공통분모로 깎아낸 DSL** 이 자연스러움. 트레이드오프.

---

### 한 줄로

> **"DB-First / Code-First 는 언어가 아니라 도구 선택의 문제." 자바도 Next.js 도 양쪽 다 있음. 우리가 Supabase 를 골랐기 때문에 자연스럽게 DB-First 가 된 것.**

JOOQ 써본 적 있으면 우리가 Stage 2 에서 한 작업이 익숙할 것 — 정확히 같은 자세, 다른 언어.
