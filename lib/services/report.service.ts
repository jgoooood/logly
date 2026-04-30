import { completeJSON } from "@/lib/ai/client";
import {
  REPORT_SYSTEM_PROMPT,
  buildReportUserMessage,
  reportOutputSchema,
  type ReportOutput,
} from "@/lib/ai/prompts/report";
import { logRepo } from "@/lib/supabase/log.repo";
import { logger } from "@/lib/logger";

const ONE_WEEK_DAYS = 7;
const FETCH_LIMIT = 200;

export type WeeklyReport =
  | { empty: true; periodStart: string; periodEnd: string }
  | {
      empty: false;
      periodStart: string;
      periodEnd: string;
      logCount: number;
      output: ReportOutput;
    };

export const reportService = {
  async generateWeekly(args: { userId: string }): Promise<WeeklyReport> {
    const t0 = Date.now();
    const now = new Date();
    const periodEnd = now.toISOString();
    const periodStart = new Date(
      now.getTime() - ONE_WEEK_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();

    // 최근 N개를 가져온 뒤 service에서 since 필터.
    // logRepo.listSince 도입은 별도 단계 (CRUD 일관성 vs YAGNI 검토 후).
    const recent = await logRepo.listForUser({
      userId: args.userId,
      limit: FETCH_LIMIT,
    });
    const inWindow = recent.filter((l) => l.createdAt >= periodStart);

    if (inWindow.length === 0) {
      logger.info("report.weekly.empty", { userId: args.userId });
      return { empty: true, periodStart, periodEnd };
    }

    const messages = inWindow.map((l) => ({
      date: l.createdAt.slice(0, 10),
      text: l.raw,
    }));

    const output = await completeJSON({
      system: REPORT_SYSTEM_PROMPT,
      user: buildReportUserMessage(messages),
      temperature: 0.3,
      schema: reportOutputSchema,
    });

    logger.info("report.weekly.completed", {
      userId: args.userId,
      ms: Date.now() - t0,
      logCount: inWindow.length,
    });

    return {
      empty: false,
      periodStart,
      periodEnd,
      logCount: inWindow.length,
      output,
    };
  },
};
