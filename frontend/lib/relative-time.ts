export function relativeTime(date: string, now: number) {
  const seconds = (new Date(date).getTime() - now) / 1000;
  if (Math.abs(seconds) < 60) return "just now";
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "always" });
  if (Math.abs(seconds) < 3600)
    return formatter.format(Math.round(seconds / 60), "minute");
  if (Math.abs(seconds) < 86400)
    return formatter.format(Math.round(seconds / 3600), "hour");
  return formatter.format(Math.round(seconds / 86400), "day");
}
