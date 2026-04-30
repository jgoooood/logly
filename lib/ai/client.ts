import OpenAI from "openai";
import { Errors } from "@/lib/errors";

// Provider: Groq (OpenAI 호환). 환경변수 한 줄로 다른 호환 provider로 교체 가능.
const AI_BASE_URL = "https://api.groq.com/openai/v1";
export const AI_MODEL = "llama-3.3-70b-versatile";

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!process.env.GROQ_API_KEY) throw Errors.AiUnavailable();
  if (!client) {
    client = new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: AI_BASE_URL,
    });
  }
  return client;
}

type Schema<T> = { parse: (v: unknown) => T };

export async function completeJSON<T>(args: {
  system: string;
  user: string;
  temperature?: number;
  schema: Schema<T>;
  signal?: AbortSignal;
}): Promise<T> {
  const openai = getClient();

  const completion = await openai.chat.completions.create(
    {
      model: AI_MODEL,
      temperature: args.temperature ?? 0.5,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: args.system },
        { role: "user", content: args.user },
      ],
    },
    { signal: args.signal },
  );

  const raw = completion.choices[0]?.message?.content ?? "";

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    throw Errors.AiBadResponse();
  }

  try {
    return args.schema.parse(parsedJson);
  } catch {
    throw Errors.AiBadResponse();
  }
}
