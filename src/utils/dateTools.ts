export function readableDate(date: Date, options: Intl.DateTimeFormatOptions = { timeZone: 'UTC', year: 'numeric', month: 'short', day: '2-digit' }): string {
    return date.toLocaleDateString('en-US', options)
}
