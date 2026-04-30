// Supabase 데이터베이스 타입 — 현재는 supabase-js 클라이언트에 부착하지 않는다.
// 이유: 수동 작성 스펙이 supabase-js v2.45+ 의 내부 Database 형식과 어긋나 type 충돌.
// 대안: 후속 단계에서 CLI 자동 생성으로 교체.
//   supabase gen types typescript --project-id <PROJECT_ID> > types/database.ts
// 그 전까지는 도메인 타입(types/domain.ts)을 repo 경계에서 사용해 안전성 확보.

export type Database = {
  public: {
    Tables: {
      logs: {
        Row: {
          id: string;
          user_id: string;
          raw: string;
          achievement: string;
          resume: string;
          interview: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          raw: string;
          achievement: string;
          resume: string;
          interview: string;
          created_at?: string;
        };
        Update: Partial<{
          id: string;
          user_id: string;
          raw: string;
          achievement: string;
          resume: string;
          interview: string;
          created_at: string;
        }>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
};
