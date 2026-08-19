const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function todayInTokyo(): string {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const tokyo = new Date(utcMs + 9 * 60 * 60000);
  const y = tokyo.getFullYear();
  const m = String(tokyo.getMonth() + 1).padStart(2, "0");
  const d = String(tokyo.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function isValidDateString(value: string | undefined): value is string {
  return !!value && DATE_RE.test(value) && !Number.isNaN(new Date(value).getTime());
}

export function addDays(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

export function formatDateLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return `${y}年${m}月${d}日（${WEEKDAY_LABELS[date.getUTCDay()]}）`;
}

/** resident_default_meals.weekday (DBのextract(dow from date)と同じ, 0=日曜〜6=土曜) を返す。 */
export function weekdayOfDate(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
