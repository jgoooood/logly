import { createBrowserClient } from "@supabase/ssr";

// 타입 제네릭은 Supabase CLI 자동생성 도입 시 부착 (`supabase gen types typescript`).
// 현재는 untyped로 운영하고, 도메인 타입은 repo 레이어 경계에서 강제한다.
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
