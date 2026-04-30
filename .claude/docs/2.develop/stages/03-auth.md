# Stage 3 — Supabase Auth (로그인/회원가입 + 세션 가드)

**완료일**: 2026-05-01
**상태**: ✅ 완료
**목표**: 인증된 사용자만 앱을 사용. 세션 갱신 미들웨어 + 라우트 그룹 가드.

---

## 1. 구현 결과

### 신규 파일

| 경로 | 역할 |
|---|---|
| `lib/supabase/client.ts` | 브라우저용 Supabase 클라이언트 (`createBrowserClient`, publishable key only) |
| `lib/supabase/server.ts` | RSC/Route Handler/Server Action용 (`createServerClient` + `cookies()`) |
| `lib/supabase/middleware.ts` | 세션 토큰 갱신 헬퍼 (`updateSession`) |
| `middleware.ts` (루트) | 모든 요청에서 세션 갱신 진입점 |
| `app/(auth)/actions.ts` | Server Action: `signIn`, `signUp`, `signOut` |
| `app/(auth)/login/page.tsx` | 이메일/비밀번호 로그인 폼 |
| `app/(auth)/signup/page.tsx` | 회원가입 폼 |
| `app/(app)/layout.tsx` | 세션 가드 (미인증 → `/login` redirect) + 헤더 + 로그아웃 버튼 |
| `app/(app)/page.tsx` | 기존 홈 (`app/page.tsx` 에서 이동) |

### 삭제 파일

| 경로 | 사유 |
|---|---|
| `app/page.tsx` | `(app)/page.tsx` 로 이동. 라우트 충돌 방지 |
| `lib/supabase.ts` | `lib/supabase/{client,server,middleware}.ts` 로 분해 |

### 패키지 변경
- 추가: `@supabase/ssr`

---

## 2. 핵심 결정 사항

### 결정 ① 인증 방식: 이메일 + 비밀번호

**선택**: 가장 단순한 이메일/비밀번호 인증.

**대안**:

| 옵션 | 장점 | 단점 |
|---|---|---|
| **이메일 + 비밀번호** ⭐ | Supabase 기본, 외부 콘솔 설정 0 | 가입 후 confirm email 메일 발송됨 |
| Magic link | 비밀번호 관리 X | 이메일 도달 대기 → dev 흐름 끊김 |
| OAuth (GitHub/Google) | UX 좋음 | OAuth 앱 등록 단계 ↑ |

**왜 이메일/비밀번호인가**:
- dev에서 Supabase 대시보드 → Authentication → Providers → Email → "Confirm email" OFF 토글로 즉시 가입 + 로그인 가능 → **회귀 검증 사이클 빠름**
- OAuth는 1시간 추가 작업이지만 본질적인 인증 가치는 동일 → MVP 단계에선 비싸다
- Magic link는 dev에서 메일 수신 환경 의존 → 검증 깨짐

**향후 영향**: OAuth 추가는 actions.ts에 `signInWithOAuth` 추가 + 콘솔 OAuth 앱 등록만 하면 됨 — 호환적으로 확장 가능.

### 결정 ② 라우트 그룹: `(app)` / `(auth)` 분리

**선택**: 인증 필요 영역과 비인증 영역을 라우트 그룹으로 명시적 분리.

```
app/
  (auth)/
    actions.ts
    login/page.tsx
    signup/page.tsx
  (app)/
    layout.tsx     ← 가드는 여기 한 곳
    page.tsx       ← 인증 필요한 모든 페이지의 부모
```

**왜 라우트 그룹을 쓰나**:
- 라우트 그룹은 URL에 영향을 주지 않으면서 **레이아웃 + 가드를 폴더 단위로 적용** 가능.
- `(app)/layout.tsx` 한 곳에서 가드 → 모든 자식 페이지 자동 보호. **가드 누락 실수 방지**.
- 새 인증 필요 페이지(예: `(app)/logs/page.tsx`)를 추가만 해도 자동으로 가드 상속.

**대안**: 페이지마다 `redirect('/login')` 직접 호출 → 누락 위험.

### 결정 ③ 세션 갱신: 루트 `middleware.ts` 사용

**선택**: `@supabase/ssr` 의 권장 패턴 — 미들웨어에서 매 요청 세션 갱신, layout에서 가드.

**왜 미들웨어와 가드를 분리하나**:
- **미들웨어 = 세션 갱신** (정적이든 동적이든 모든 요청에 토큰 만료 방지)
- **layout = 가드** (인증 필요한 페이지 집합에서만 user 검증 + redirect)
- 책임 분리 → 미들웨어가 redirect까지 들고 있으면 정적 페이지 접근에서도 인증 검사가 발생해 비용↑.

**왜 매 요청 세션 갱신이 필요한가**: Supabase JWT는 1시간 만료. 사용자가 페이지를 떠나지 않은 채 1시간 넘기면 재로그인 강제됨. 미들웨어에서 매 요청 `getUser()` 호출 시 SDK가 자동으로 refresh token 사용해 세션 연장.

### 결정 ④ Supabase 클라이언트 3분 분리

**선택**: 단일 파일이었던 `lib/supabase.ts` 를 환경별로 3개 파일로 분해.

| 파일 | 환경 | 키 |
|---|---|---|
| `client.ts` | 브라우저 (Client Component) | publishable only |
| `server.ts` | RSC / Route Handler / Server Action | publishable + cookies |
| `middleware.ts` | NextRequest 컨텍스트 | publishable + request cookies |

**왜 분해하나**:
- 각 환경의 cookie 처리 방식이 다름 (`next/headers` vs `request.cookies`)
- 한 파일에 합치면 import할 때 잘못된 환경 헬퍼를 부르기 쉬움 (예: 클라이언트에서 server.ts 헬퍼 호출 → cookies() 에러)
- `client.ts` 는 절대 secret을 알 수 없게 강제 → **번들 분석 시 secret 누수 검출 단순화**.

**보안 검증**: `findstr /s /c:"sb_secret_" .next\static\*` → 0건 출력 ✅. publishable 키만 클라이언트 번들 진입.

---

## 3. 진행 중 Q&A

### Q1. 추천대로 진행

→ 이메일/비밀번호 (위 §2 결정 ①) + 기존 홈을 인증 필수로 전환 (위 §2 결정 ②).

### Q2. `grep -r "sb_secret_" /c/project/logly/.next/static` 시 "지정된 경로를 찾을 수 없습니다"

원인 두 가지:
1. **Windows cmd에 `grep` 없음** — Linux/bash 명령. Git Bash 안에서만 동작.
2. **`.next/static` 은 `npm run build` 후 생성됨** — dev 서버만 띄워서는 없음.

해결: 빌드 한 번 + Windows 친화 명령으로 변경.

### Q3. `Select-String -Path .next\static\**\* -Pattern "sb_publishable_" ...` cmd창에서 쳐도 돼?

**아니오.** `Select-String`은 PowerShell 전용. cmd에서는 `findstr`:

```cmd
npm run build
findstr /s /c:"sb_secret_" .next\static\*
```

→ 출력 없음 = 안전 ✅
→ 매칭 라인 출력 = 클라이언트 번들에 secret 누수 ❌

publishable 키 검증은 옵션 (브라우저 번들에 들어가야 정상이라 굳이 확인 불필요).

---

## 4. 검증 (DoD)

| 항목 | 결과 | 검증 방법 |
|---|---|---|
| 미로그인 → `/login` redirect | ✅ | 쿠키 없는 상태로 `/` 접근 → /login 자동 이동 |
| 회원가입 → 로그인 → 홈 진입 | ✅ | /signup → /login?signedUp=1 → 자격증명 입력 → / 진입 |
| 로그아웃 동작 | ✅ | 헤더 우상단 버튼 → /login 복귀 |
| 빌드 번들에 `sb_secret_` 미포함 | ✅ | `findstr /s /c:"sb_secret_" .next\static\*` → 0건 |
| `npx tsc --noEmit` 0 errors | ✅ | exit 0 (`.next` 캐시 한 번 정리 후) |

---

## 5. 다음 단계로 넘기는 메모

### 운영 배포 시 필요한 변경
- Supabase Authentication → "Confirm email" **다시 ON** (현재 dev 편의로 OFF)
- 비밀번호 재설정 흐름 (`/forgot-password`) 추가
- Rate limit 도입 (가입 봇 방어)

### Stage 4에 직접 영향
- `app/api/transform/route.ts` 의 첫 번째 검증 단계가 **세션 검증** 으로 갈 수 있게 됨 (현재는 인증 없이 누구나 호출 가능). Stage 4 5단계 템플릿(인증 → 레이트리밋 → 검증 → 서비스 → 응답)의 **인증 단계가 의미 있는 동작으로 활성화**됨.

### Stage 5에 직접 영향
- `transform.service.ts` 가 변환 결과를 `logs` 테이블에 저장할 때 `user_id` 는 세션에서 가져옴. 클라이언트가 보낸 `userId` 절대 신뢰 금지 (CLAUDE.md §9 위반).

### 알려진 부채
- `(app)/layout.tsx` 헤더 디자인이 임시. 실제 UX 다듬기는 별도 단계.
- `actions.ts` 의 에러 메시지가 Supabase 원문(영어)을 그대로 노출. 사용자 친화적 한국어 매핑 필요 시 후속 단계.
- `types/database.ts` 여전히 수동 stub. CLI 도입은 보류 중.

### 캐시 정리 사용 사례 발견
- `app/page.tsx` 이동 시 `.next/types/app/page.ts` stale 에러 발생 → `rm -rf .next` 로 해결.
- 라우트 구조를 크게 바꾼 직후엔 `.next` 한 번 정리 권장. dev 서버는 자동 재생성하므로 큰 비용 없음.
