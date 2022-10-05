export function readableDate(
  date: Date | undefined,
  options: Intl.DateTimeFormatOptions = {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "2-digit",
  },
): string {
  if (date === undefined) {
    return "Invalid Date";
  }

  return date.toLocaleDateString("en-US", options);
}
