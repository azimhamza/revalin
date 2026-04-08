const DEFAULT_PAYOUT_TIMEZONE = "America/Toronto";

type TimeZoneParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

export type WeeklyPayoutPeriod = {
  periodKey: string;
  timezone: string;
  start: Date;
  end: Date;
  startLocalDate: string;
  endLocalDate: string;
  label: string;
};

const dateTimeFormatterCache = new Map<string, Intl.DateTimeFormat>();
const offsetFormatterCache = new Map<string, Intl.DateTimeFormat>();

function getDateTimeFormatter(timeZone: string) {
  const key = `datetime:${timeZone}`;
  const cached = dateTimeFormatterCache.get(key);
  if (cached) {
    return cached;
  }

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  dateTimeFormatterCache.set(key, formatter);
  return formatter;
}

function getOffsetFormatter(timeZone: string) {
  const key = `offset:${timeZone}`;
  const cached = offsetFormatterCache.get(key);
  if (cached) {
    return cached;
  }

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "longOffset",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  offsetFormatterCache.set(key, formatter);
  return formatter;
}

export function getTimeZoneParts(value: Date, timeZone: string): TimeZoneParts {
  const parts = getDateTimeFormatter(timeZone).formatToParts(value);

  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value || 0);

  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
    second: read("second"),
  };
}

function getTimeZoneOffsetMinutes(value: Date, timeZone: string) {
  const parts = getOffsetFormatter(timeZone).formatToParts(value);
  const zonePart = parts.find((part) => part.type === "timeZoneName")?.value || "";
  const match = zonePart.match(/GMT([+-]\d{1,2})(?::?(\d{2}))?/i);

  if (!match) {
    throw new Error(`Unable to parse timezone offset for ${timeZone}.`);
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2] || "0");
  const sign = hours < 0 ? -1 : 1;

  return hours * 60 + sign * minutes;
}

type ZonedDateTimeInput = {
  year: number;
  month: number;
  day: number;
  hour?: number;
  minute?: number;
  second?: number;
  millisecond?: number;
};

export function zonedDateTimeToUtc(
  input: ZonedDateTimeInput,
  timeZone = DEFAULT_PAYOUT_TIMEZONE,
) {
  const hour = input.hour ?? 0;
  const minute = input.minute ?? 0;
  const second = input.second ?? 0;
  const millisecond = input.millisecond ?? 0;
  const naiveUtc = Date.UTC(
    input.year,
    input.month - 1,
    input.day,
    hour,
    minute,
    second,
    millisecond,
  );

  const initialOffset = getTimeZoneOffsetMinutes(new Date(naiveUtc), timeZone);
  let resolvedUtc = naiveUtc - initialOffset * 60_000;
  const resolvedOffset = getTimeZoneOffsetMinutes(new Date(resolvedUtc), timeZone);

  if (resolvedOffset !== initialOffset) {
    resolvedUtc = naiveUtc - resolvedOffset * 60_000;
  }

  return new Date(resolvedUtc);
}

function addUtcDays(value: Date, days: number) {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function toLocalDateKey(
  parts: Pick<TimeZoneParts, "year" | "month" | "day">,
) {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(
    parts.day,
  ).padStart(2, "0")}`;
}

function toCalendarDateFromKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatPeriodLabel(start: Date, end: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return `${formatter.format(start)} - ${formatter.format(end)}`;
}

export function buildWeeklyPayoutPeriod(
  value: Date | string | number = new Date(),
  timeZone = DEFAULT_PAYOUT_TIMEZONE,
): WeeklyPayoutPeriod {
  const reference = value instanceof Date ? value : new Date(value);
  const localParts = getTimeZoneParts(reference, timeZone);
  const localDateKey = toLocalDateKey(localParts);
  const localCalendarDate = toCalendarDateFromKey(localDateKey);
  const weekdayIndex = (localCalendarDate.getUTCDay() + 6) % 7;
  const monday = addUtcDays(localCalendarDate, -weekdayIndex);
  const friday = addUtcDays(monday, 4);

  const startLocalDate = toLocalDateKey({
    year: monday.getUTCFullYear(),
    month: monday.getUTCMonth() + 1,
    day: monday.getUTCDate(),
  });
  const endLocalDate = toLocalDateKey({
    year: friday.getUTCFullYear(),
    month: friday.getUTCMonth() + 1,
    day: friday.getUTCDate(),
  });

  const start = zonedDateTimeToUtc(
    {
      year: monday.getUTCFullYear(),
      month: monday.getUTCMonth() + 1,
      day: monday.getUTCDate(),
      hour: 0,
      minute: 0,
      second: 0,
      millisecond: 0,
    },
    timeZone,
  );
  const end = zonedDateTimeToUtc(
    {
      year: friday.getUTCFullYear(),
      month: friday.getUTCMonth() + 1,
      day: friday.getUTCDate(),
      hour: 23,
      minute: 59,
      second: 59,
      millisecond: 999,
    },
    timeZone,
  );

  return {
    periodKey: startLocalDate,
    timezone: timeZone,
    start,
    end,
    startLocalDate,
    endLocalDate,
    label: formatPeriodLabel(start, end, timeZone),
  };
}

export function getTimeZoneDateKey(
  value: Date | string | number = new Date(),
  timeZone = DEFAULT_PAYOUT_TIMEZONE,
) {
  const reference = value instanceof Date ? value : new Date(value);
  return toLocalDateKey(getTimeZoneParts(reference, timeZone));
}

export function getTimeZoneMonthKey(
  value: Date | string | number = new Date(),
  timeZone = DEFAULT_PAYOUT_TIMEZONE,
) {
  const reference = value instanceof Date ? value : new Date(value);
  const parts = getTimeZoneParts(reference, timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}`;
}

export function getCurrentPayoutFridayDate(
  value: Date | string | number = new Date(),
  timeZone = DEFAULT_PAYOUT_TIMEZONE,
) {
  const period = buildWeeklyPayoutPeriod(value, timeZone);
  return period.endLocalDate;
}

export function formatPayoutPeriodLabel(
  period: Pick<WeeklyPayoutPeriod, "start" | "end" | "timezone">,
) {
  return formatPeriodLabel(period.start, period.end, period.timezone);
}

export function getDefaultPayoutTimezone() {
  return DEFAULT_PAYOUT_TIMEZONE;
}
