import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logRepo } from "@/lib/supabase/log.repo";
import { Errors } from "@/lib/errors";
import type { Log } from "@/types/domain";

export const logService = {
  async listForCurrentUser(args?: {
    limit?: number;
    cursor?: string;
  }): Promise<Log[]> {
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw Errors.Unauthorized();

    return logRepo.listForUser({ userId: user.id, ...args });
  },
};
