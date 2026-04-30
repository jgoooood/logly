// Logly 도메인 타입.
// DB row 타입(types/database.ts)과 다르게, 서비스/UI 레이어에서 쓰는 카멜케이스 형태.

export type Log = {
  id: string;
  userId: string;
  raw: string;
  achievement: string;
  resume: string;
  interview: string;
  createdAt: string;
};

export type TransformResult = {
  achievement: string;
  resume: string;
  interview: string;
};

export const TRANSFORM_KIND = ["achievement", "resume", "interview"] as const;
export type TransformKind = (typeof TRANSFORM_KIND)[number];
