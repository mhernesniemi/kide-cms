export type DateSettings = {
  locale: string;
  timeZone?: string;
  options: Intl.DateTimeFormatOptions;
  pattern?: string;
};

export const DEFAULT_DATE_SETTINGS: DateSettings = {
  locale: "en-GB",
  options: { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" },
};

type DateParts = { year: string; month: string; day: string; hour: string; minute: string; second: string };

const zoneParts = (date: Date, zone: string | undefined): DateParts => {
  const parts: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date)) {
    if (p.type !== "literal") parts[p.type] = p.value;
  }
  return parts as unknown as DateParts;
};

const TOKEN_FNS: Record<string, (p: DateParts) => string> = {
  yyyy: (p) => p.year,
  yy: (p) => p.year.slice(-2),
  MM: (p) => p.month,
  M: (p) => String(Number(p.month)),
  dd: (p) => p.day,
  d: (p) => String(Number(p.day)),
  HH: (p) => p.hour,
  H: (p) => String(Number(p.hour)),
  hh: (p) => String(((Number(p.hour) + 11) % 12) + 1).padStart(2, "0"),
  h: (p) => String(((Number(p.hour) + 11) % 12) + 1),
  mm: (p) => p.minute,
  m: (p) => String(Number(p.minute)),
  ss: (p) => p.second,
  s: (p) => String(Number(p.second)),
  a: (p) => (Number(p.hour) < 12 ? "AM" : "PM"),
};

const TOKEN_RE = /'([^']*)'|yyyy|yy|MM|M|dd|d|HH|H|hh|h|mm|m|ss|s|a/g;

const formatWithPattern = (date: Date, pattern: string, zone: string | undefined): string => {
  const p = zoneParts(date, zone);
  return pattern.replace(TOKEN_RE, (match, quoted?: string) => {
    if (quoted !== undefined) return quoted === "" ? "'" : quoted; // '' → literal apostrophe
    return TOKEN_FNS[match]?.(p) ?? match;
  });
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Past dates within a day read as relative time ("5 minutes ago"); older or future ones as a date. */
const relative = (date: Date, locale: string, now: number): string | undefined => {
  const ago = now - date.getTime();
  if (ago < 0 || ago >= DAY) return undefined;
  if (ago < MINUTE) return "just now";
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  return ago < HOUR ? rtf.format(-Math.floor(ago / MINUTE), "minute") : rtf.format(-Math.floor(ago / HOUR), "hour");
};

export const formatDateWith = (value: unknown, settings: DateSettings, now = Date.now()): string => {
  if (!value) return "—";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  if (settings.pattern) return formatWithPattern(date, settings.pattern, settings.timeZone);
  return (
    relative(date, settings.locale, now) ??
    date.toLocaleString(settings.locale, { ...settings.options, timeZone: settings.timeZone })
  );
};
