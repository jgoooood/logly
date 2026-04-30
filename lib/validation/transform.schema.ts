import { z } from "zod";

export const MAX_LOG_LENGTH = 500;

export const transformInputSchema = z.object({
  log: z.string().trim().min(1).max(MAX_LOG_LENGTH),
});

export type TransformInput = z.infer<typeof transformInputSchema>;
