const DEFAULT_TIMEZONE = "Asia/Kolkata";

export function defaultOperationalTimezone(): string {
  return DEFAULT_TIMEZONE;
}

export function calendarDateInTimeZone(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) {
    throw new Error("Unable to resolve calendar date for timezone");
  }

  return `${year}-${month}-${day}`;
}

export function zonedDayBounds(timeZone: string, dateYmd: string): { start: Date; end: Date } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateYmd);
  if (!match) {
    throw new Error("Date must be YYYY-MM-DD");
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const start = zonedLocalToUtc(year, month, day, 0, 0, 0, 0, timeZone);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  const end = zonedLocalToUtc(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), 0, 0, 0, 0, timeZone);

  return { start, end };
}

export function currentSiteDayBounds(timeZone: string, now: Date = new Date()): { start: Date; end: Date; date: string } {
  const date = calendarDateInTimeZone(now, timeZone);
  const bounds = zonedDayBounds(timeZone, date);
  return { ...bounds, date };
}

export function addCalendarDays(dateYmd: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateYmd);
  if (!match) {
    throw new Error("Date must be YYYY-MM-DD");
  }

  const shifted = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
  const year = String(shifted.getUTCFullYear());
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function zonedLocalToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  millisecond: number,
  timeZone: string,
): Date {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  const offsetMs = timezoneOffsetMs(timeZone, new Date(utcGuess));
  const adjusted = new Date(utcGuess - offsetMs);
  const confirm = timezoneOffsetMs(timeZone, adjusted);
  if (confirm !== offsetMs) {
    return new Date(utcGuess - confirm);
  }
  return adjusted;
}

function timezoneOffsetMs(timeZone: string, instant: Date): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(formatter.formatToParts(instant).map((part) => [part.type, part.value]));
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - instant.getTime();
}
