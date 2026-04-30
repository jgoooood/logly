import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { reportService } from "@/lib/services/report.service";
import { rateLimit } from "@/lib/rate-limit";
import { Errors, toErrorResponse } from "@/lib/errors";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAILY_LIMIT = 5;
const DAY_IN_SEC = 86_400;

export async function POST() {
  try {
    // 1) 인증
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw Errors.Unauthorized();

    // 2) 레이트 리밋 (사용자별 일 5회)
    const limit = await rateLimit({
      key: `report:weekly:${user.id}`,
      limit: DAILY_LIMIT,
      windowSec: DAY_IN_SEC,
    });
    if (!limit.ok) throw Errors.RateLimited(limit.retryAfter);

    // 3) 입력 검증 — 입력 인자 없음

    // 4) 서비스 호출
    const result = await reportService.generateWeekly({ userId: user.id });

    // 5) 응답
    return NextResponse.json(result, { status: 200 });
  } catch (e) {
    logger.error("api.reports.weekly.failed", { err: e });
    return toErrorResponse(e);
  }
}
