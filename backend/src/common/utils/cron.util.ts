import { CronExpressionParser } from 'cron-parser';

export function isValidTimezone(timezone: string): boolean {
  if (!timezone || typeof timezone !== 'string') {
    return false;
  }
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

export function isValidCronExpression(
  expression: string,
  timezone = 'UTC',
): boolean {
  if (!expression || typeof expression !== 'string') {
    return false;
  }
  const trimmed = expression.trim();
  if (!trimmed) {
    return false;
  }
  try {
    CronExpressionParser.parse(trimmed, { tz: timezone });
    return true;
  } catch {
    return false;
  }
}

export function computeNextRunAt(
  expression: string,
  timezone = 'UTC',
  fromDate: Date = new Date(),
): Date {
  const parsed = CronExpressionParser.parse(expression.trim(), {
    tz: timezone,
    currentDate: fromDate,
  });
  return parsed.next().toDate();
}
