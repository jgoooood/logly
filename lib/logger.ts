type LogLevel = "debug" | "info" | "warn" | "error";

function serialize(payload: Record<string, unknown>): string {
  return JSON.stringify(payload, (_key, value) => {
    if (value instanceof Error) {
      return { name: value.name, message: value.message, stack: value.stack };
    }
    return value;
  });
}

function log(level: LogLevel, event: string, extra?: Record<string, unknown>) {
  const payload = {
    time: new Date().toISOString(),
    level,
    event,
    ...extra,
  };
  const out = serialize(payload);
  if (level === "error") console.error(out);
  else if (level === "warn") console.warn(out);
  else console.log(out);
}

export const logger = {
  debug: (event: string, extra?: Record<string, unknown>) => log("debug", event, extra),
  info: (event: string, extra?: Record<string, unknown>) => log("info", event, extra),
  warn: (event: string, extra?: Record<string, unknown>) => log("warn", event, extra),
  error: (event: string, extra?: Record<string, unknown>) => log("error", event, extra),
};
