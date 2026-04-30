import { completeJSON } from "@/lib/ai/client";
import {
  TRANSFORM_SYSTEM_PROMPT,
  buildTransformUserMessage,
  transformOutputSchema,
  type TransformOutput,
} from "@/lib/ai/prompts/transform";
import { logRepo } from "@/lib/supabase/log.repo";
import { logger } from "@/lib/logger";

export const transformService = {
  async run(args: { userId: string; log: string }): Promise<TransformOutput> {
    const t0 = Date.now();

    const result = await completeJSON({
      system: TRANSFORM_SYSTEM_PROMPT,
      user: buildTransformUserMessage(args.log),
      temperature: 0.5,
      schema: transformOutputSchema,
    });

    await logRepo.insert({
      userId: args.userId,
      raw: args.log,
      achievement: result.achievement,
      resume: result.resume,
      interview: result.interview,
    });

    logger.info("transform.completed", {
      userId: args.userId,
      ms: Date.now() - t0,
    });

    return result;
  },
};
