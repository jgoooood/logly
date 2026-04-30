import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import type { Log } from "@/types/domain";

type InsertArgs = {
  userId: string;
  raw: string;
  achievement: string;
  resume: string;
  interview: string;
};

type ListArgs = {
  userId: string;
  limit?: number;
  cursor?: string; // ISO timestamp; 이 값보다 더 오래된 row만 반환
};

type Row = {
  id: string;
  user_id: string;
  raw: string;
  achievement: string;
  resume: string;
  interview: string;
  created_at: string;
};

function rowToDomain(row: Row): Log {
  return {
    id: row.id,
    userId: row.user_id,
    raw: row.raw,
    achievement: row.achievement,
    resume: row.resume,
    interview: row.interview,
    createdAt: row.created_at,
  };
}

export const logRepo = {
  async insert(args: InsertArgs): Promise<void> {
    const supabase = createSupabaseServerClient();
    const { error } = await supabase.from("logs").insert({
      user_id: args.userId,
      raw: args.raw,
      achievement: args.achievement,
      resume: args.resume,
      interview: args.interview,
    });
    if (error) {
      logger.error("logRepo.insert.failed", { err: error });
      throw error;
    }
  },

  async listForUser(args: ListArgs): Promise<Log[]> {
    const supabase = createSupabaseServerClient();
    const limit = args.limit ?? 20;

    let query = supabase
      .from("logs")
      .select("id, user_id, raw, achievement, resume, interview, created_at")
      .eq("user_id", args.userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (args.cursor) {
      query = query.lt("created_at", args.cursor);
    }

    const { data, error } = await query;
    if (error) {
      logger.error("logRepo.listForUser.failed", { err: error });
      throw error;
    }

    return (data ?? []).map(rowToDomain);
  },
};
