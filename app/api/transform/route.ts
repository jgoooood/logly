import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { transformInputSchema } from "@/lib/validation/transform.schema";
import { transformService } from "@/lib/services/transform.service";
import { rateLimit } from "@/lib/rate-limit";
import { Errors, toErrorResponse } from "@/lib/errors";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAILY_LIMIT = 10;
const DAY_IN_SEC = 86_400;

export async function POST(req: Request) {
  try {
    // 1) 인증
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw Errors.Unauthorized();

    // 2) 레이트 리밋
    const limit = await rateLimit({
      key: `transform:${user.id}`,
      limit: DAILY_LIMIT,
      windowSec: DAY_IN_SEC,
    });
    if (!limit.ok) throw Errors.RateLimited(limit.retryAfter);

    // 3) 입력 검증
    const body = await req.json().catch(() => ({}));
    const parsed = transformInputSchema.safeParse(body);
    if (!parsed.success) throw Errors.BadInput(parsed.error.flatten());

    // 4) 서비스 호출
    const result = await transformService.run({
      userId: user.id,
      log: parsed.data.log,
    });

    // 5) 응답
    return NextResponse.json(result, { status: 200 });
  } catch (e) {
    logger.error("api.transform.failed", { err: e });
    return toErrorResponse(e);
  }
}
