export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "Not scheduled";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";

  const diffSec = Math.round((date.getTime() - Date.now()) / 1000);
  const abs = Math.abs(diffSec);

  if (abs < 10) return diffSec >= 0 ? "in a few seconds" : "just now";
  if (abs < 60) return diffSec >= 0 ? `in ${abs}s` : `${abs}s ago`;

  const mins = Math.round(abs / 60);
  if (mins < 60) return diffSec >= 0 ? `in ${mins}m` : `${mins}m ago`;

  const hours = Math.round(mins / 60);
  if (hours < 24) return diffSec >= 0 ? `in ${hours}h` : `${hours}h ago`;

  const days = Math.round(hours / 24);
  return diffSec >= 0 ? `in ${days}d` : `${days}d ago`;
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export const CRON_PRESETS: Array<{ label: string; expression: string; hint: string }> = [
  { label: "Every 1 min", expression: "* * * * *", hint: "Runs every minute" },
  { label: "Every 5 min", expression: "*/5 * * * *", hint: "Runs every 5 minutes" },
  { label: "Every 15 min", expression: "*/15 * * * *", hint: "Runs every 15 minutes" },
  { label: "Hourly", expression: "0 * * * *", hint: "At minute 0 of every hour" },
  { label: "Daily 09:00", expression: "0 9 * * *", hint: "Every day at 09:00" },
  { label: "Weekdays 09:00", expression: "0 9 * * 1-5", hint: "Mon–Fri at 09:00" },
];

export const COMMON_TIMEZONES: string[] = [
  "UTC",
  "Asia/Jakarta",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Los_Angeles",
  "Australia/Sydney",
];

export function describeCron(expression: string): string {
  const match = CRON_PRESETS.find((preset) => preset.expression === expression.trim());
  if (match) return match.hint;
  return "Custom cron schedule";
}
