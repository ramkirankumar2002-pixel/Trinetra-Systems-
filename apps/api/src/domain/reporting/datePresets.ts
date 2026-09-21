import { addCalendarDays, calendarDateInTimeZone, currentSiteDayBounds, zonedDayBounds } from "../siteDay.js";
import { HttpError } from "../../lib/httpError.js";

export const REPORT_DATE_PRESETS = [
  "today",
  "yesterday",
  "last_7_days",
  "last_30_days",
  "current_month",
  "custom",
] as const;

export type ReportDatePreset = (typeof REPORT_DATE_PRESETS)[number];

export const EMPTY_REPORT_MESSAGE = "No data available for the selected period.";
export const INSUFFICIENT_DATA = "Insufficient data";
export const LARGE_REPORT_DAY_SPAN = 90;

export function isReportDatePreset(value: string): value is ReportDatePreset {
  return (REPORT_DATE_PRESETS as readonly string[]).includes(value);
}

export function parseReportDatePreset(value: unknown): ReportDatePreset | undefined {
  if (value === undefined || value === "") {
    return undefined;
  }
  if (typeof value !== "string" || !isReportDatePreset(value)) {
    throw new HttpError(400, "datePreset must be today, yesterday, last_7_days, last_30_days, current_month, or custom");
  }
  return value;
}

export type ResolvedReportDates = {
  from?: Date;
  to?: Date;
  fromYmd?: string;
  toYmd?: string;
  preset: ReportDatePreset | "none";
  timeZone: string;
  daySpan: number | null;
  isLargeHistorical: boolean;
};

export function resolveReportDates(input: {
  preset?: ReportDatePreset | undefined;
  from?: Date | undefined;
  to?: Date | undefined;
  timeZone: string;
  now?: Date;
}): ResolvedReportDates {
  const now = input.now ?? new Date();
  const today = currentSiteDayBounds(input.timeZone, now);
  const preset = input.preset ?? (input.from || input.to ? "custom" : "none");

  if (preset === "none") {
    return {
      preset: "none",
      timeZone: input.timeZone,
      daySpan: null,
      isLargeHistorical: true,
    };
  }

  if (preset === "custom") {
    return datedRange(input.from, input.to, input.timeZone, "custom");
  }

  const ymdRange = presetRangeYmd(preset, today.date);
  const boundsFrom = zonedDayBounds(input.timeZone, ymdRange.fromYmd);
  const boundsTo = zonedDayBounds(input.timeZone, ymdRange.toYmd);
  return datedRange(boundsFrom.start, new Date(boundsTo.end.getTime() - 1), input.timeZone, preset);
}

export function inclusiveDaySpan(fromYmd: string, toYmd: string): number {
  let cursor = fromYmd;
  let count = 1;
  while (cursor < toYmd) {
    cursor = addCalendarDays(cursor, 1);
    count += 1;
    if (count > 3700) {
      break;
    }
  }
  return count;
}

function presetRangeYmd(
  preset: Exclude<ReportDatePreset, "custom">,
  todayYmd: string,
): { fromYmd: string; toYmd: string } {
  switch (preset) {
    case "today":
      return { fromYmd: todayYmd, toYmd: todayYmd };
    case "yesterday": {
      const yesterday = addCalendarDays(todayYmd, -1);
      return { fromYmd: yesterday, toYmd: yesterday };
    }
    case "last_7_days":
      return { fromYmd: addCalendarDays(todayYmd, -6), toYmd: todayYmd };
    case "last_30_days":
      return { fromYmd: addCalendarDays(todayYmd, -29), toYmd: todayYmd };
    case "current_month":
      return { fromYmd: `${todayYmd.slice(0, 7)}-01`, toYmd: todayYmd };
    default: {
      const _exhaustive: never = preset;
      return _exhaustive;
    }
  }
}

function datedRange(
  from: Date | undefined,
  to: Date | undefined,
  timeZone: string,
  preset: ReportDatePreset,
): ResolvedReportDates {
  const fromYmd = from ? calendarDateInTimeZone(from, timeZone) : undefined;
  const toYmd = to ? calendarDateInTimeZone(to, timeZone) : undefined;
  const daySpan = fromYmd && toYmd ? inclusiveDaySpan(fromYmd, toYmd) : null;
  return {
    ...(from === undefined ? {} : { from }),
    ...(to === undefined ? {} : { to }),
    ...(fromYmd === undefined ? {} : { fromYmd }),
    ...(toYmd === undefined ? {} : { toYmd }),
    preset,
    timeZone,
    daySpan,
    isLargeHistorical: daySpan === null || daySpan > LARGE_REPORT_DAY_SPAN,
  };
}
