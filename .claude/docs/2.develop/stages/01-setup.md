# Stage 1 — 셋업 · 동작 검증

**완료일**: 2026-04-30
**상태**: ✅ 완료
**목표**: 코드가 로컬에서 실행되고 변환 기능(로그 → 3종 결과)이 한 번이라도 정상 동작하는지 확인. 이후 모든 단계의 전제.

---

## 1. 구현 결과

### 신규 산출물

| 산출물 | 역할 |
|---|---|
| `node_modules/` | npm 의존성 설치 (417 packages, exit 0) |
| `.env.local` | 로컬 환경변수 (`.gitignore`로 차단) |
| `.vscode/launch.json` | VS Code 디버그 구성 3종 (server-side / client-side / full stack) |

### 수정 파일 (Groq swap 단계에서)

| 파일 | 변경 내용 |
|---|---|
| `lib/openai.ts` | `baseURL: "https://api.groq.com/openai/v1"` 추가, env 키 `OPENAI_API_KEY` → `GROQ_API_KEY` |
| `app/api/transform/route.ts` | 모델 `gpt-4o-mini` → `llama-3.3-70b-versatile` |
| `.env.local` | `OPENAI_API_KEY` 제거, `GROQ_API_KEY` 추가 |

### 패키지 변경
- 신규 설치: 없음 (기존 `package.json` 그대로)
- 의존성 트리: 417 packages
- `npm audit`: 8 vulnerabilities (1 critical / 6 high / 1 moderate). Stage 1 동작에는 영향 없음 — 후속 단계에서 별도 처리 가능.

---

## 2. 핵심 결정 사항

### 결정 ① AI 제공자: OpenAI → Groq

**선택**: Groq의 OpenAI 호환 엔드포인트 (`llama-3.3-70b-versatile` 모델)

**대안 검토**:

| 옵션 | 무료 한도 | OpenAI 호환 | 코드 변경량 | 결과 |
|---|---|---|---|---|
| OpenAI (원래 계획) | 신규 가입 5달러 (불확실) | 네이티브 | 없음 | ❌ 결제 부담 |
| **Groq** | rate limit 충분 (Llama 무료) | ✅ | baseURL + 모델명 | ✅ 채택 |
| Google Gemini | 분 15req / 일 1500req | ❌ 별도 SDK | 중간 | 보류 |
| OpenRouter | 일부 모델 무료 | ✅ | baseURL + 모델명 | 동등 |
| Ollama (로컬) | 무제한 | ✅ | baseURL만 | 8GB+ RAM 필요 |

**왜 Groq인가**:
1. **OpenAI SDK 그대로 재사용** — `baseURL` 한 줄만 바꾸면 됨. 기존 `response_format: { type: "json_object" }` 호출 그대로 동작.
2. **JSON mode 지원** — Llama 3.x 계열은 Groq에서 JSON 강제 출력을 안정적으로 처리.
3. **한국어 출력 품질** — 70B 모델이라 8B 모델보다 한국어 자연스러움이 명확히 나음. dev 단계에서 사용자 검증 만족도 충분.
4. **카드 등록 불필요** — Google 로그인만으로 키 발급 가능 → 사용자가 즉시 시작.

**왜 Ollama 대신 Groq인가**: Ollama는 모델 다운로드(~5GB) + 8GB 이상 RAM 권장. dev 머신 사양에 의존하는 비결정성보다 가벼운 클라우드 호출이 신뢰성 높다.

**향후 영향**: 현재 `lib/openai.ts` 라는 파일명이 Groq를 가리키는 모순적 상태. **Stage 4 리팩터 시 `lib/ai/client.ts`로 이름·구조 모두 정리되며 provider 추상화 완료**. 그 시점부터는 환경변수 한 줄로 OpenAI/Groq/OpenRouter 등 교체 가능.

### 결정 ② VS Code launch.json 3구성 동시 제공

**선택**: `server-side`, `client-side`, `full stack` 3개를 한 파일에 동시 정의.

**왜 셋 다 넣었나**:
- 디버깅 상황이 케이스별로 다름 (API 라우트 vs 클라이언트 컴포넌트 vs 둘 다)
- 매번 launch.json을 고치는 비용 > 한 번에 셋 다 넣는 비용
- "Next.js: full stack"이 가장 강력하지만, server-side만 단순 실행하고 싶을 때도 있음

**왜 디버거를 쓰나**: CLAUDE.md §14에 "console.log 디버깅 잔재 커밋 금지" 가 명시됨. 브레이크포인트 기반 디버깅이 표준이어야 자연스럽게 그 룰을 따르게 됨.

---

## 3. 진행 중 Q&A

### Q1. 서버 빌드하려면 뭐 실행해야 돼?

| 용도 | 명령 |
|---|---|
| 개발 서버 (Stage 1 검증용) | `npm run dev` |
| 프로덕션 빌드 | `npm run build` |
| 프로덕션 실행 (build 후) | `npm start` |
| 타입 체크만 | `npx tsc --noEmit` |

Stage 1은 `npm run dev` 만으로 충분. `build`는 Stage 3 보안 검증에서 한 번 사용됨.

### Q2. VS Code에서 실행하는 건 없어?

3가지 방법:

1. **통합 터미널** (`Ctrl + ` ``) → `npm run dev`
2. **NPM Scripts 사이드바** — `package.json` 펼치고 `dev` 옆 ▶
3. **디버거** (F5) — `launch.json` 추가 시 브레이크포인트 + 자동 Chrome 오픈 가능

→ launch.json 도입 결정 (위 §2 결정 ②)

### Q3. CLI로 스크린샷 첨부 안 돼?

가능. 우선순:

| 방법 | 설명 |
|---|---|
| 클립보드 paste (`Ctrl+V`) | `Win+Shift+S` 등으로 캡처 → 클립보드 → 붙여넣기. `[Image #N]` 칩으로 삽입. 가장 빠름. |
| 드래그 앤 드롭 | 이미지 파일을 터미널에 끌어다 놓으면 경로 자동 입력 |
| `@경로` 참조 | 예: `@C:\temp\err.png 이거 봐줘`. 자동완성 지원 |

출처: https://code.claude.com/docs/en/interactive-mode.md

### Q4. Logly 메인 화면 떴어. 완료된 거야?

**아직.** 화면 렌더링 = dev 서버 + UI 동작까지만 검증. **Stage 1 DoD는 변환 1회 성공이 포함**되므로 입력 → "AI 변환하기" → 카드 3개 출력이 확인돼야 완료. 사용자 수동 액션 필요.

### Q5. `401 Incorrect API key provided: sk-REPLA*E_ME` 오류

**원인**: `.env.local` 의 placeholder (`sk-REPLACE_ME`) 가 그대로 OpenAI에 전송됨.

**해결**:
1. 실제 키 발급
2. `.env.local` 갱신
3. **dev 서버 재시작 (필수)** — Next.js는 `.env.local` 을 시작 시점에만 읽기 때문

이 시점에 사용자가 비용 부담을 이유로 무료 대안을 요청 → Groq swap으로 이어짐.

### Q6. 무료로 테스트해볼 AI 없어?

→ 위 §2 결정 ① 표 참조. Groq 채택.

### Q7. Groq에서 Display Name 쓰라는데 이건 뭐야?

키 자체와 무관한 **이름표**. 콘솔에서 키 여러 개 발급 시 구분용. 추천 패턴: `프로젝트명-환경` (예: `logly-dev`, `logly-prod`). 동작에 영향 없으므로 부담 없이 입력.

---

## 4. 검증 (DoD)

| 항목 | 결과 | 검증 방법 |
|---|---|---|
| `node_modules/` 존재 | ✅ | `npm install` 417 packages, exit 0 |
| `.env.local` 존재 + AI 키 채워짐 | ✅ | `GROQ_API_KEY=gsk_...` |
| 브라우저에서 변환 1회 성공 | ✅ | 사용자 수동 — "성과 요약 / 이력서 문장 / 면접 답변" 카드 3개 출력 확인 |
| `npx tsc --noEmit` 0 errors | ✅ | exit 0 |

---

## 5. 다음 단계로 넘기는 메모

### 의도적 보류 / 부채
- **AI 클라이언트 추상화 부채**: `lib/openai.ts` 라는 파일명이 Groq를 가리키는 모순. Stage 4에서 `lib/ai/client.ts`로 이름·구조 정리 예정.
- **`.env.example` 미갱신**: Groq 키만 기재됐고 Supabase 키 명칭은 legacy 그대로. Stage 2에서 신규 키 체계로 한 번에 갱신 (불필요한 중간 PR 회피).
- **`npm audit` 8건**: critical 1 / high 6 / moderate 1. dev 동작에는 영향 없음. Stage 7(테스트) 마무리 시점 또는 별도 보안 단계에서 일괄 처리 권장.

### Stage 2에 영향
- 사용자가 Supabase 가입 + 프로젝트 생성 + 키 3개 발급 등 외부 작업 필요. 사전 안내 동선 보강.
