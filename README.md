# Logly

AI 기반 커리어 관리 웹앱. 하루의 업무 한 줄을 성과 · 이력서 · 면접 답변으로 변환합니다.

## Stack
- Next.js 14 (App Router, TypeScript)
- Tailwind CSS
- Supabase (DB + Auth)
- OpenAI API

## Getting Started

```bash
cd C:\project\logly
npm install
cp .env.example .env.local   # 키 입력
npm run dev
```

http://localhost:3000

## Structure

```
app/
  api/transform/   # POST: 한 줄 로그 → 3가지 결과
  layout.tsx
  page.tsx
components/
  LogInput.tsx
  ResultCard.tsx
lib/
  openai.ts
  supabase.ts
```
