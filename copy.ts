const locale =
  typeof navigator === "undefined" ? undefined : navigator.language;
const numbers = new Intl.NumberFormat(locale);
const englishPlurals = new Intl.PluralRules("en");
const dates = new Intl.DateTimeFormat(locale, {
  dateStyle: "medium",
  timeStyle: "short",
});
const times = new Intl.DateTimeFormat(locale, {
  hour: "numeric",
  minute: "2-digit",
});
const relative = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
const lists = new Intl.ListFormat(locale, {
  style: "long",
  type: "conjunction",
});
export const formatNumber = (value: number) => numbers.format(value);
export const formatDate = (value: string) => dates.format(new Date(value));
export const formatTime = (value: string) => times.format(new Date(value));
export const formatList = (values: string[]) => lists.format(values);
export function countLabel(
  value: number,
  messages: { one: string; other: string },
) {
  const template =
    englishPlurals.select(value) === "one" ? messages.one : messages.other;
  return template.replaceAll("{count}", formatNumber(value));
}
export function relativeDate(value: string) {
  const elapsed = (Date.parse(value) - Date.now()) / 86_400_000;
  if (!Number.isFinite(elapsed)) return "Date unavailable";
  return relative.format(Math.trunc(elapsed), "day");
}
