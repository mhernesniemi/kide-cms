/**
 * Tiny leveled logger for CMS internals.
 *
 * Level is read from CMS_LOG_LEVEL (silent | error | warn | info | debug),
 * defaulting to "info". Set CMS_LOG_LEVEL=warn (or silent) to quiet the
 * structured audit lines and other info chatter during bulk scripts:
 *
 *   CMS_LOG_LEVEL=warn pnpm cms:seed
 *
 * Reads process.env directly (no runtime coupling) so it works in scripts and
 * in the Worker alike.
 */
export type LogLevel = "silent" | "error" | "warn" | "info" | "debug";

const ORDER: Record<LogLevel, number> = { silent: 0, error: 1, warn: 2, info: 3, debug: 4 };

const currentLevel = (): LogLevel => {
  const raw = (typeof process !== "undefined" ? process.env?.CMS_LOG_LEVEL : undefined)?.toLowerCase();
  return raw && raw in ORDER ? (raw as LogLevel) : "info";
};

const enabled = (level: Exclude<LogLevel, "silent">) => ORDER[level] <= ORDER[currentLevel()];

export const log = {
  error: (...args: unknown[]) => {
    if (enabled("error")) console.error(...args);
  },
  warn: (...args: unknown[]) => {
    if (enabled("warn")) console.warn(...args);
  },
  info: (...args: unknown[]) => {
    if (enabled("info")) console.log(...args);
  },
  debug: (...args: unknown[]) => {
    if (enabled("debug")) console.debug(...args);
  },
};
